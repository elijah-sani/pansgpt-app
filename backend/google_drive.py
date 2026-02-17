import os
import io
import time
import socket
import ssl
import logging
from typing import Iterator, Optional, Dict, Any
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload
from googleapiclient.errors import HttpError
from google.auth.transport.requests import AuthorizedSession

logger = logging.getLogger("PansGPT")

class GoogleDriveService:
    """
    Service class for Google Drive operations.
    Handles authentication via a Service Account (service_account.json).
    """
    
    SCOPES = ['https://www.googleapis.com/auth/drive']
    TOKEN_FILE = 'token.json'

    def __init__(self, allow_upload: bool = False):
        """
        Initialize Google Drive service with OAuth 2.0 User Credentials.
        """
        self.credentials = None
        
        # 1. Load User Credentials
        if os.path.exists(self.TOKEN_FILE):
            try:
                self.credentials = Credentials.from_authorized_user_file(self.TOKEN_FILE, self.SCOPES)
            except Exception as e:
                logger.warning(f"Error loading token.json: {e}")
        
        # 2. Refresh if needed
        if not self.credentials or not self.credentials.valid:
            if self.credentials and self.credentials.expired and self.credentials.refresh_token:
                try:
                    logger.info("Refreshing access token...")
                    from google.auth.transport.requests import Request
                    self.credentials.refresh(Request())
                    # Save the refreshed token
                    with open(self.TOKEN_FILE, 'w') as token:
                        token.write(self.credentials.to_json())
                    logger.info("Token refreshed and saved.")
                except Exception as e:
                    raise Exception(f"CRITICAL: Failed to refresh token: {e}. Please re-run setup_auth.py")
            else:
                raise Exception("CRITICAL: token.json is missing or invalid. Please run setup_auth.py locally.")
        
        logger.info("Successfully authenticated with Google Drive (User OAuth).")
        
        # Build the Drive API service
        self.service = build('drive', 'v3', credentials=self.credentials, cache_discovery=False)
    
    def _execute_with_retry(self, request_func):
        """Helper to retry API calls on network failure."""
        max_retries = 3
        for attempt in range(max_retries):
            try:
                return request_func().execute()
            except (ssl.SSLError, socket.timeout, ConnectionError, AttributeError, HttpError) as e:
                logger.warning(f"Network error (Attempt {attempt + 1}/{max_retries}): {e}")
                if attempt == max_retries - 1:
                    raise
                time.sleep(2)
            except Exception as e:
                if "SSL" in str(e) or "EOF" in str(e):
                    logger.warning(f"SSL error (Attempt {attempt + 1}/{max_retries}): {e}")
                    time.sleep(2)
                else:
                    raise

    def get_file_metadata(self, file_id: str) -> Dict[str, Any]:
        """Get metadata for a file in Google Drive."""
        return self._execute_with_retry(
            lambda: self.service.files().get(
                fileId=file_id,
                fields='id, name, mimeType, size, createdTime, modifiedTime'
            )
        )
    
    def get_file_stream(self, file_id: str, chunk_size: int = 256 * 1024) -> Iterator[bytes]:
        """
        Stream file content with Range-Header Resumption.
        If the connection drops (SSL/Network), this method automatically reconnects 
        and requests the *remaining* bytes using the Range header.
        """
        import requests 
        
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
        downloaded_bytes = 0
        max_retries = 5
        
        for attempt in range(max_retries):
            try:
                # Create a fresh session for each attempt to clear bad SSL state
                authed_session = AuthorizedSession(self.credentials)
                
                headers = {}
                if downloaded_bytes > 0:
                    headers["Range"] = f"bytes={downloaded_bytes}-"
                    logger.info(f"Resuming stream from byte {downloaded_bytes}...")
                
                # Timeout: 15s connect, 60s read
                response = authed_session.get(url, headers=headers, stream=True, timeout=(15, 60))
                
                # Handle 416 Range Not Satisfiable (file fully downloaded?)
                if response.status_code == 416:
                     logger.info("Stream finished (416 Range Not Satisfiable reached).")
                     return

                response.raise_for_status()
                
                # iterate_content handles chunk decoding
                # We wrap it to catch errors during the READ phase
                for chunk in response.iter_content(chunk_size=chunk_size):
                    if chunk:
                        yield chunk
                        downloaded_bytes += len(chunk)
                        
                # If we exit the loop naturally, we are done
                return

            except (ssl.SSLError, requests.exceptions.ChunkedEncodingError, 
                    requests.exceptions.ConnectionError, requests.exceptions.ReadTimeout) as e:
                logger.warning(f"Stream dropped at {downloaded_bytes} bytes (Attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(2) # Wait a bit before reconnecting
                    continue
                else:
                    raise ValueError(f"Stream failed after {max_retries} attempts. Last error: {e}")
            except Exception as e:
                logger.error(f"Critical Stream Error: {e}")
                raise
    
    def download_file_bytes(self, file_id: str) -> bytes:
        """Download entire file content as bytes."""
        try:
            request = self.service.files().get_media(fileId=file_id)
            buffer = io.BytesIO()
            downloader = MediaIoBaseDownload(buffer, request)
            
            done = False
            while not done:
                status, done = downloader.next_chunk()
            
            buffer.seek(0)
            return buffer.read()
            
        except Exception as e:
            raise ValueError(f"Failed to download file: {str(e)}")
    
    def upload_file(
        self, 
        file_name: str, 
        file_obj, 
        mime_type: str = 'application/pdf',
        folder_id: Optional[str] = None,
        file_size: Optional[int] = None
    ) -> str:
        """
        Uploads a file-like object to Google Drive using Resumable Upload.
        Refactored to support:
        1. Chunked Streaming (Low Memory)
        2. Fresh Session per Retry (SSL Fix)
        """
        target_folder = folder_id or os.getenv('GOOGLE_DRIVE_FOLDER_ID')
        
        # Prepare Metadata
        metadata = {'name': file_name}
        if target_folder:
            metadata['parents'] = [target_folder]
        
        # Retry Loop for Network/SSL Stability
        max_retries = 3
        last_error = None
        
        for attempt in range(max_retries):
            try:
                # 1. Create a FRESH session for each attempt to avoid corrupted SSL states
                # This is the key fix for [SSL: UNEXPECTED_EOF_WHILE_READING]
                authed_session = AuthorizedSession(self.credentials)
                
                # 2. Initiate Resumable Upload
                upload_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable"
                
                headers = {
                    'X-Upload-Content-Type': mime_type,
                    'X-Upload-Content-Length': str(file_size) if file_size else None
                }
                
                # Send metadata to get the session URI
                init_response = authed_session.post(
                    upload_url,
                    json=metadata,
                    headers=headers,
                    timeout=(10, 30) # 10s connect, 30s read
                )
                init_response.raise_for_status()
                
                # The resilient upload URL
                session_uri = init_response.headers.get('Location')
                if not session_uri:
                    raise ValueError("Failed to retrieve resumable upload URI from Drive.")

                # 3. Stream Content
                # Reset file pointer for retry
                if hasattr(file_obj, 'seek'):
                    file_obj.seek(0)
                
                # Upload the actual data using PUT to the session URI
                # requests supports streaming upload if we pass a generator or file object
                upload_response = authed_session.put(
                    session_uri,
                    data=file_obj, # Takes file-like object directly
                    headers={'Content-Type': mime_type},
                    timeout=(30, 300) # Generous timeout for large files (5 mins)
                )
                
                upload_response.raise_for_status()
                
                # 4. Success
                file_id = upload_response.json().get('id')
                logger.info(f"Upload successful: {file_name} ({file_id})")
                return file_id

            except Exception as e:
                last_error = e
                logger.warning(f"Upload attempt {attempt + 1}/{max_retries} failed: {e}")
                
                # Wait before retry (exponential backoff)
                time.sleep(2 * (attempt + 1))
        
        # If we exit loop, all retries failed
        raise ValueError(f"CRITICAL: Upload failed after {max_retries} attempts. Last error: {last_error}")
    
    def list_files(
        self, 
        folder_id: Optional[str] = None, 
        mime_type: Optional[str] = None,
        page_size: int = 100
    ) -> list:
        """List files in Google Drive."""
        query_parts = []
        if folder_id: query_parts.append(f"'{folder_id}' in parents")
        if mime_type: query_parts.append(f"mimeType='{mime_type}'")
        query = ' and '.join(query_parts) if query_parts else None
        
        try:
            result = self._execute_with_retry(
                lambda: self.service.files().list(
                    q=query, pageSize=page_size,
                    fields="files(id, name, mimeType, size, createdTime)"
                )
            )
            return result.get('files', [])
        except Exception as e:
             raise ValueError(f"Failed to list files: {str(e)}")

    def delete_file(self, file_id: str) -> None:
        """Delete a file from Google Drive using AuthorizedSession for reliability."""
        try:
            # Use AuthorizedSession (requests-based) - same approach as get_file_stream
            # This is more reliable on Windows than httplib2
            authed_session = AuthorizedSession(self.credentials)
            url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
            
            response = authed_session.delete(url, timeout=30)
            
            if response.status_code == 204:
                return  # Success - file deleted
            elif response.status_code == 404:
                raise ValueError(f"File not found: {file_id}")
            else:
                response.raise_for_status()
                
        except Exception as e:
            raise ValueError(f"Failed to delete file: {str(e)}")


# Singleton instance
_drive_service: Optional[GoogleDriveService] = None


def get_drive_service(allow_upload: bool = False) -> GoogleDriveService:
    """
    Get or create a Google Drive service instance using OAuth 2.0.
    Since we use token.json which has static scopes, allow_upload is mainly for compatibility.
    """
    global _drive_service
    
    if _drive_service is None:
        _drive_service = GoogleDriveService(allow_upload=allow_upload)
        
    return _drive_service


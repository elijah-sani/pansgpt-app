import os
import io
import time
import socket
import ssl
from typing import Iterator, Optional, Dict, Any
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload
from googleapiclient.errors import HttpError
from google.auth.transport.requests import AuthorizedSession

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
                print(f"⚠️ Error loading token.json: {e}")
        
        # 2. Refresh if needed
        if not self.credentials or not self.credentials.valid:
            if self.credentials and self.credentials.expired and self.credentials.refresh_token:
                try:
                    print("🔄 Refreshing access token...")
                    from google.auth.transport.requests import Request
                    self.credentials.refresh(Request())
                    # Save the refreshed token
                    with open(self.TOKEN_FILE, 'w') as token:
                        token.write(self.credentials.to_json())
                    print("✅ Token refreshed and saved.")
                except Exception as e:
                    raise Exception(f"CRITICAL: Failed to refresh token: {e}. Please re-run setup_auth.py")
            else:
                raise Exception("CRITICAL: token.json is missing or invalid. Please run setup_auth.py locally.")
        
        print("✅ Successfully authenticated with Google Drive (User OAuth).")
        
        # Build the Drive API service
        self.service = build('drive', 'v3', credentials=self.credentials, cache_discovery=False)
    
    def _execute_with_retry(self, request_func):
        """Helper to retry API calls on network failure."""
        max_retries = 3
        for attempt in range(max_retries):
            try:
                return request_func().execute()
            except (ssl.SSLError, socket.timeout, ConnectionError, AttributeError, HttpError) as e:
                print(f"⚠️ Network error (Attempt {attempt + 1}/{max_retries}): {e}")
                if attempt == max_retries - 1:
                    raise
                time.sleep(2)
            except Exception as e:
                if "SSL" in str(e) or "EOF" in str(e):
                    print(f"⚠️ SSL error (Attempt {attempt + 1}/{max_retries}): {e}")
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
        Stream file content directly using requests with AuthorizedSession.
        This bypasses the slow MediaIoBaseDownload buffer.
        """
        try:
            # Create an authorized session
            authed_session = AuthorizedSession(self.credentials)
            
            # Drive API URL for file content
            url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
            
            # Stream the request
            response = authed_session.get(url, stream=True, timeout=30)
            response.raise_for_status()
            
            # Yield chunks directly from the socket
            for chunk in response.iter_content(chunk_size=chunk_size):
                if chunk:
                    yield chunk
                    
        except Exception as e:
            print(f"Streaming Error: {e}")
            raise ValueError(f"Stream connection failed: {str(e)}")
    
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
        content: bytes, 
        mime_type: str = 'application/pdf',
        folder_id: Optional[str] = None
    ) -> str:
        """
        Upload a file to Google Drive.
        """
        # Note: Scopes are now fixed in token.json, so dynamic check is less critical 
        # but we can assume 'drive.file' was requested during auth.
        
        # Use provided folder_id or fallback to env var
        target_folder = folder_id or os.getenv('GOOGLE_DRIVE_FOLDER_ID')
        
        file_metadata = {'name': file_name}
        if target_folder:
            file_metadata['parents'] = [target_folder]
        else:
            print("⚠️  WARNING: No Google Drive Folder ID found! Uploading to Service Account Root.")
        
        media = MediaIoBaseUpload(
            io.BytesIO(content),
            mimetype=mime_type,
            resumable=True
        )
        
        try:
            file = self._execute_with_retry(
                lambda: self.service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id'
                )
            )
            return file.get('id')
            
        except Exception as e:
            raise ValueError(f"Failed to upload file: {str(e)}")
    
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

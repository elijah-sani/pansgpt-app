import streamlit as st
import os
import sys
import subprocess
import time
import base64
import requests
import re
import fitz  # PyMuPDF
import concurrent.futures 
from datetime import datetime

# --- IMPORTS ---
try:
    from dotenv import load_dotenv
    from groq import Groq
    from supabase import create_client, Client
except ImportError:
    st.error("Missing dependencies. Please run `pip install -r requirements.txt`.")
    st.stop()

# --- SETUP PAGE CONFIG ---
st.set_page_config(
    page_title="PansGPT Content Manager",
    page_icon="💊",
    layout="wide"
)

load_dotenv()

# --- CONNECTION MANAGEMENT ---

def get_secret(key):
    """Retrieves secrets from Streamlit secrets or local .env"""
    try:
        if key in st.secrets:
            return st.secrets[key]
    except Exception:
        pass
    return os.getenv(key)

# Use cache_resource so we don't reconnect on every interaction
@st.cache_resource
def init_connections():
    groq_api_key = get_secret("GROQ_API_KEY")
    supabase_url = get_secret("SUPABASE_URL")
    supabase_key = get_secret("SUPABASE_SERVICE_ROLE_KEY")
    
    g_client = None
    s_client = None

    if groq_api_key:
        g_client = Groq(api_key=groq_api_key)
    
    if supabase_url and supabase_key:
        try:
            s_client = create_client(supabase_url, supabase_key)
        except Exception as e:
            st.error(f"Supabase Connection Error: {e}")
            
    return g_client, s_client

groq_client, supabase = init_connections()
SUPABASE_BUCKET = "lecture-images"

# --- DATABASE FUNCTIONS ---

def log_upload_to_db(filename, subject, processed_text):
    """Saves metadata and content to Supabase with retries"""
    if not supabase:
        st.error("Database connection missing.")
        return False
    
    data = {
        "filename": filename,
        "subject": subject,
        "status": "processed",
        "content": processed_text,
        "created_at": datetime.utcnow().isoformat()
    }
    
    # Retry logic for transient HTTP/2 StreamReset errors
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Attempt to insert data
            supabase.table("documents").insert(data).execute()
            return True
        except Exception as e:
            # Log specific error for debugging if needed, or just warn user
            if attempt == max_retries - 1:
                st.error(f"Could not save to history log after {max_retries} attempts. Error: {e}")
                return False
            
            # Backoff before retrying
            time.sleep(1 * (attempt + 1))
            continue

def delete_document(doc_id):
    """Deletes document record and associated images"""
    if not supabase:
        return
    
    # 1. Find linked images
    try:
        response = supabase.table("documents").select("content").eq("id", doc_id).execute()
        if response.data:
            content = response.data[0].get("content", "")
            # Find URLs matching our bucket
            urls = re.findall(r'url="([^"]+)"', content)
            
            files_to_remove = []
            for url in urls:
                if f"/{SUPABASE_BUCKET}/" in url:
                    filename = url.split(f"/{SUPABASE_BUCKET}/")[-1]
                    files_to_remove.append(filename)
            
            # Remove images from Storage
            if files_to_remove:
                supabase.storage.from_(SUPABASE_BUCKET).remove(files_to_remove)
                
    except Exception as e:
        print(f"Image cleanup warning: {e}")

    # 2. Delete DB Record
    try:
        supabase.table("documents").delete().eq("id", doc_id).execute()
        st.toast("Document deleted!", icon="🗑️")
    except Exception as e:
        st.error(f"Could not delete document: {e}")

def get_upload_history():
    """Fetches last 50 docs"""
    if not supabase:
        return []
    try:
        response = supabase.table("documents").select("*").order("created_at", desc=True).limit(50).execute()
        return response.data
    except Exception as e:
        st.error(f"Error fetching history: {e}")
        return []

# --- PROCESSING LOGIC ---

def upload_image_to_storage(image_bytes, filename):
    """Uploads bytes to Supabase Storage"""
    if not supabase:
        return "https://placeholder.url/credentials_missing.png"

    try:
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=filename,
            file=image_bytes,
            file_options={"content-type": "image/png", "upsert": "true"}
        )
        # Construct public URL
        project_url = get_secret("SUPABASE_URL")
        final_url = f"{project_url}/storage/v1/object/public/{SUPABASE_BUCKET}/{filename}"
        return final_url
    except Exception as e:
        # Fallback to manual URL construction if it was a duplicate error
        if "Duplicate" in str(e) or "409" in str(e):
             project_url = get_secret("SUPABASE_URL")
             return f"{project_url}/storage/v1/object/public/{SUPABASE_BUCKET}/{filename}"
        return "https://placeholder.url/upload_failed.png"

def analyze_image_groq(image_bytes):
    """Sends image to Groq Llama Vision model with Rate Limit Retry"""
    if not groq_client:
        return "[Vision Error: No API Key]"
        
    base64_image = base64.b64encode(image_bytes).decode('utf-8')
    prompt = "Analyze this pharmacy slide image. Describe the key visual elements, diagrams, or pathways in a flowing narrative paragraph. Do not transcribe text verbatim. Do not use markdown tables or numbered steps. Return ONLY the narrative description."
    
    max_retries = 5
    base_delay = 2 # seconds
    
    for attempt in range(max_retries):
        try:
            response = groq_client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct", # Reverted per request
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}},
                    ],
                }],
                max_tokens=1024,
                temperature=0.1,
            )
            return response.choices[0].message.content.strip()
        
        except Exception as e:
            error_msg = str(e).lower()
            # Check for Rate Limit (429) errors
            if "429" in error_msg or "rate limit" in error_msg:
                if attempt < max_retries - 1:
                    wait_time = base_delay * (2 ** attempt) # Exponential backoff: 2s, 4s, 8s...
                    time.sleep(wait_time)
                    continue
            
            # If it's not a rate limit error, or we ran out of retries, return error
            return f"[Vision Error: {str(e)}]"

def process_single_image_task(task_data):
    """Helper function to process a single image in a thread"""
    img_bytes, fname, image_count, page_index = task_data
    
    # Upload
    pub_url = upload_image_to_storage(img_bytes, fname)
    
    # Analyze
    desc = analyze_image_groq(img_bytes)
    clean_desc = desc.replace('"', "'")
    
    # Original custom format
    return f"\n<<SLIDE_IMAGE: url=\"{pub_url}\" caption=\"Img {image_count} (Page {page_index+1})\" context=\"{clean_desc}\">>\n"

# --- HYBRID LAYOUT RECONSTRUCTION ENGINE ---

import json

# --- STRICT AUDITOR PROMPT FOR TEXT CLEANING ---
TEXT_CLEANING_PROMPT = """Role: You are a ROBOTIC text formatter. Your ONLY job is to clean raw text.

STRICT RULES:
1. NO summarization - output EVERY piece of text provided
2. British English spelling (anaesthetic, colour)
3. Fix broken lines - merge words split across lines (e.g., "depolar-\\nization" -> "depolarization")
4. Fix broken sentences - merge fragments that were split by PDF extraction
5. PRESERVE any <<SLIDE_IMAGE...>> tags EXACTLY as they appear
6. Remove page numbers (standalone "12" or "Page 12 of 30")
7. Remove "Contd" or continuation markers
8. Keep proper paragraph breaks between distinct sections

CRITICAL BULLET POINT RULE:
If you encounter a bullet character (•, -, *, or a numbered item like "1.") in the middle of a text block, you MUST treat it as a NEW LINE.

BAD Output (WRONG - never do this):
"• Local anaesthetics decrease permeability. • Normally the process is reversible."

GOOD Output (CORRECT):
"- Local anaesthetics decrease permeability.
- Normally the process is reversible."

NEVER merge a line starting with a bullet point into the previous line. Each bullet must be on its own line.

SCIENTIFIC CONTENT RULES:

1. TABLES: If you detect a table structure (columns of data, headers with values below), convert it into a proper Markdown Table:
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value A  | Value B  | Value C  |

2. CHEMICAL FORMULAS: If you detect chemical formulas (e.g., C2H5OH, NaCl, H2O), format them using LaTeX math syntax:
- C2H5OH -> $C_2H_5OH$
- H2SO4 -> $H_2SO_4$
- Na+ -> $Na^+$
- CO2 -> $CO_2$

3. FLOWCHARTS/PROCESSES: If you detect a text-based flowchart or process sequence, represent it as a bulleted list with arrows:
- Step 1 → Step 2 → Step 3
OR
- Step 1
  ↓
- Step 2
  ↓
- Step 3

OUTPUT: Return ONLY the cleaned text with proper formatting. No commentary."""


def clean_text_with_ai(raw_text):
    """
    Sends raw text to Groq for AI-powered cleaning and fixing.
    Uses temperature 0.0 for deterministic output.
    """
    if not groq_client:
        return raw_text  # Fallback if no API key
    
    if not raw_text or len(raw_text.strip()) < 10:
        return raw_text  # Skip very short text
    
    try:
        response = groq_client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {"role": "system", "content": TEXT_CLEANING_PROMPT},
                {"role": "user", "content": f"Clean this raw lecture text:\n\n{raw_text}"}
            ],
            temperature=0.0,  # Deterministic - no creativity
            max_tokens=4096,
        )
        cleaned = response.choices[0].message.content.strip()
        return cleaned if cleaned else raw_text
    except Exception as e:
        print(f"AI Cleaning Error: {e}")
        return raw_text  # Fallback to raw text on error


# --- LAYOUT ANALYSIS PROMPT (LINEAR BLOCK STREAM) ---
LAYOUT_SYSTEM_PROMPT = """You are a Visual Content Scanner. 

Analyze this slide image from TOP to BOTTOM and deconstruct it into a LINEAR list of content blocks.

I will provide:
1. A slide screenshot (for visual reference of layout order)
2. CLEANED TEXT that has already been formatted
3. A list of IMAGE URLs extracted from this slide
4. The FULL PAGE SCREENSHOT URL (for fallback use)

YOUR TASK: Create a JSON object with a "blocks" array. Each block represents one visual element in order.

OUTPUT SCHEMA (strict JSON, no markdown, no code fences):

{
  "blocks": [
    {"type": "title", "content": "Main Title (for title/cover slides only)"},
    {"type": "heading", "content": "Section heading"},
    {"type": "text", "content": "Paragraph text..."},
    {"type": "bullets", "items": ["Point 1", "Point 2", "Point 3"]},
    {"type": "image", "url": "https://...single-large-image...", "caption": "Description"},
    {"type": "image_grid", "urls": ["url1", "url2", "url3"], "caption": "Multiple small images"},
    {"type": "table", "content": "| Col1 | Col2 |\\n|---|---|\\n| A | B |"}
  ]
}

BLOCK TYPES:
- "title": For TITLE SLIDES ONLY - use when slide has just a title with minimal text (will be centered)
- "heading": For section titles within content slides
- "text": For paragraphs or single text blocks
- "bullets": For lists (use items array)
- "image": For a SINGLE large/wide image (use url field)
- "image_grid": For MULTIPLE small images that should display in a grid (use urls array)
- "table": For markdown tables

SMART IMAGE RULES:
1. If there are 2-4 SMALL images on the slide, use "image_grid" with urls array
2. If there is 1 LARGE/WIDE image, use "image" with single url
3. Look at the slide layout - if images are arranged side-by-side, use image_grid

TITLE SLIDE DETECTION:
If the slide appears to be a TITLE or COVER slide (minimal content, just a title), use:
{"type": "title", "content": "The Title Text"}
This will be rendered centered on the page.

CRITICAL RULES:
1. ORDER MATTERS: Blocks MUST appear in the exact visual order (Top -> Bottom)
2. USE PROVIDED CONTENT: Match the CLEANED TEXT I give you - do NOT transcribe from the image
3. USE PROVIDED URLs: Only insert image URLs from the list I provide
4. IF NO TEXT: You may skip text blocks if slide is image-heavy
5. BULLET DETECTION: If text contains "-" or "•" markers, use "bullets" type

Return ONLY the JSON object."""


def extract_page_assets(doc, page, page_num, clean_name):
    """
    Extract raw materials from a PDF page:
    - Text blocks merged into logical paragraphs
    - Embedded images uploaded to Supabase with public URLs
    
    Returns: {'text_blocks': [...], 'images': [{'url': '...', 'bbox': ...}]}
    """
    assets = {
        'text_blocks': [],
        'images': []
    }
    
    # --- EXTRACT TEXT BLOCKS ---
    try:
        blocks = page.get_text("blocks")  # Returns list of (x0, y0, x1, y1, "text", block_no, block_type)
        
        text_blocks = []
        for block in blocks:
            if block[6] == 0:  # Type 0 = text block
                text = block[4].strip()
                if text and len(text) > 2:  # Filter tiny fragments
                    # Clean up common artifacts
                    text = text.replace('\n', ' ').strip()
                    text_blocks.append(text)
        
        # Merge short adjacent blocks into paragraphs
        merged = []
        current = ""
        for block in text_blocks:
            # If block is short and current exists, merge
            if len(block) < 80 and current:
                current += " " + block
            else:
                if current:
                    merged.append(current.strip())
                current = block
        if current:
            merged.append(current.strip())
        
        assets['text_blocks'] = merged
        
    except Exception as e:
        print(f"Page {page_num}: Text extraction error - {e}")
        assets['text_blocks'] = []
    
    # --- EXTRACT EMBEDDED IMAGES ---
    try:
        image_list = page.get_images(full=True)
        
        for img_idx, img_info in enumerate(image_list):
            xref = img_info[0]
            
            try:
                base_image = doc.extract_image(xref)
                img_bytes = base_image["image"]
                img_ext = base_image["ext"]
                
                # Skip only very tiny images (icons/decorations) - AGGRESSIVE MODE
                # Lowered threshold to capture chemical structures, formulas, small diagrams
                if len(img_bytes) < 1000:
                    continue
                
                # Upload to Supabase
                img_filename = f"img_{clean_name}_p{page_num}_{img_idx}.{img_ext}"
                img_url = upload_image_to_storage(img_bytes, img_filename)
                
                if img_url and "placeholder" not in img_url:
                    assets['images'].append({
                        'url': img_url,
                        'index': img_idx,
                        'size': len(img_bytes)
                    })
                    print(f"Page {page_num}: Image {img_idx} uploaded -> {img_filename}")
                    
            except Exception as img_err:
                print(f"Page {page_num}: Image {img_idx} extraction failed - {img_err}")
                continue
                
    except Exception as e:
        print(f"Page {page_num}: Image listing error - {e}")
        assets['images'] = []
    
    return assets


def analyze_layout_recipe(page_image_bytes, page_image_url, page_num, cleaned_text, image_urls):
    """
    Use Llama Vision to analyze the page layout and create a LINEAR BLOCK STREAM.
    
    Args:
        page_image_bytes: PNG bytes of the page screenshot
        page_image_url: Public URL of uploaded page screenshot
        page_num: Page number (1-indexed)
        cleaned_text: AI-cleaned text for this page
        image_urls: List of image URLs extracted from this page
    
    Returns: Block stream JSON with ordered blocks array.
    """
    
    # Helper: Create fallback blocks from cleaned text and images
    def create_fallback_blocks(text, urls):
        blocks = []
        lines = text.split('\n') if text else []
        
        # First line as heading if it exists
        if lines:
            blocks.append({"type": "heading", "content": lines[0]})
            
            # Remaining lines as text or bullets
            body_lines = lines[1:]
            if body_lines:
                # Check if it looks like a bullet list
                bullet_items = [l.lstrip('- •*').strip() for l in body_lines if l.strip()]
                if bullet_items:
                    blocks.append({"type": "bullets", "items": bullet_items})
        
        # Add images at the end
        for url in urls:
            blocks.append({"type": "image", "url": url, "caption": ""})
        
        return blocks
    
    if not groq_client:
        return {
            "blocks": create_fallback_blocks(cleaned_text, image_urls),
            "page_number": page_num,
            "page_image_url": page_image_url,
            "error": "No API key"
        }
    
    base64_image = base64.b64encode(page_image_bytes).decode('utf-8')
    
    # Prepare content summary for the AI (uses CLEANED text, not raw)
    content_summary = f"""
=== SLIDE {page_num} CONTENT ===

CLEANED TEXT (use this EXACTLY - distribute into blocks):
\"\"\"
{cleaned_text}
\"\"\"

AVAILABLE IMAGE URLs ({len(image_urls)} found):
{chr(10).join([f'[IMG_{idx}] {url}' for idx, url in enumerate(image_urls)]) if image_urls else '- None (text-only slide)'}

FULL PAGE SCREENSHOT URL (use for fallback_image blocks):
{page_image_url}
"""
    
    max_retries = 5
    base_delay = 10
    
    for attempt in range(max_retries):
        try:
            response = groq_client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[
                    {"role": "system", "content": LAYOUT_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text", 
                                "text": f"Scan this slide and create an ordered blocks array.{content_summary}"
                            },
                            {
                                "type": "image_url", 
                                "image_url": {"url": f"data:image/png;base64,{base64_image}"}
                            },
                        ],
                    }
                ],
                max_tokens=2048,
                temperature=0.0,
            )
            
            raw_response = response.choices[0].message.content.strip()
            
            # Clean up markdown code fences
            if raw_response.startswith("```"):
                parts = raw_response.split("```")
                if len(parts) >= 2:
                    raw_response = parts[1]
                    if raw_response.startswith("json"):
                        raw_response = raw_response[4:]
                    raw_response = raw_response.strip()
            
            # Parse JSON
            recipe = json.loads(raw_response)
            
            # Ensure blocks array exists
            if "blocks" not in recipe or not isinstance(recipe.get("blocks"), list):
                # Try to convert old format to blocks
                recipe["blocks"] = create_fallback_blocks(cleaned_text, image_urls)
            
            # Add metadata
            recipe["page_number"] = page_num
            recipe["page_image_url"] = page_image_url
            recipe["assets"] = {
                "text_count": len(cleaned_text.split('\n')) if cleaned_text else 0,
                "image_count": len(image_urls),
                "image_urls": image_urls
            }
            
            block_count = len(recipe.get("blocks", []))
            print(f"Page {page_num}: Block stream created -> {block_count} blocks")
            return recipe
            
        except json.JSONDecodeError as e:
            print(f"Page {page_num}: JSON parse error - {e}")
            return {
                "blocks": create_fallback_blocks(cleaned_text, image_urls),
                "page_number": page_num,
                "page_image_url": page_image_url,
                "assets": {
                    "text_count": len(cleaned_text.split('\n')) if cleaned_text else 0,
                    "image_count": len(image_urls),
                    "image_urls": image_urls
                },
                "parse_error": str(e)
            }
            
        except Exception as e:
            error_msg = str(e).lower()
            
            # Rate limit handling
            if "429" in error_msg or "rate limit" in error_msg:
                if attempt < max_retries - 1:
                    wait_time = base_delay * (attempt + 1)
                    print(f"Page {page_num}: Rate Limit. Sleeping {wait_time}s... (Attempt {attempt + 1}/{max_retries})")
                    time.sleep(wait_time)
                    continue
            
            print(f"Page {page_num}: Layout analysis error - {e}")
            if attempt == max_retries - 1:
                return {
                    "blocks": create_fallback_blocks(cleaned_text, image_urls),
                    "page_number": page_num,
                    "page_image_url": page_image_url,
                    "assets": {
                        "text_count": len(cleaned_text.split('\n')) if cleaned_text else 0,
                        "image_count": len(image_urls),
                        "image_urls": image_urls
                    },
                    "error": str(e)
                }
    
    return {
        "blocks": create_fallback_blocks(cleaned_text, image_urls),
        "page_number": page_num, 
        "page_image_url": page_image_url,
        "error": "Max retries exceeded"
    }

# --- REGEX TEXT PARSING (RESTORED) ---
def parse_document_text(raw_text):
    """
    Applies heuristics to format text based on user-defined rules:
    - Detects Headings (All caps, Numbered, Roman, etc.)
    - Formats Lists (-/•/1./a.)
    - Handles formatting (Bold definitions, notes, key-values)
    - Merges paragraph lines smartly
    """
    if not raw_text: return ""
    
    # --- SMART LINE MERGING ---
    original_lines = raw_text.split('\n')
    lines = []
    
    if original_lines:
        current_line = original_lines[0].strip()
        
        for next_part in original_lines[1:]:
            next_part = next_part.strip()
            
            # Handle blank lines (flush and preserve structure)
            if not next_part:
                if current_line:
                    lines.append(current_line)
                    current_line = ""
                lines.append("") 
                continue
            
            if not current_line:
                current_line = next_part
                continue
            
            # Check punctuation (Keep line if it ends with punctuation)
            if current_line.endswith(('.', '?', '!', ':')):
                lines.append(current_line)
                current_line = next_part
                continue
            
            # Check Exceptions (Next line)
            # Bullet point (-, •, *, ·) - matching existing regex logic
            if re.match(r'^[-•*·]', next_part):
                lines.append(current_line)
                current_line = next_part
                continue
            
            # Header (#, 1.)
            if next_part.startswith('#') or re.match(r'^\d+\.', next_part):
                lines.append(current_line)
                current_line = next_part
                continue
                
            # Merge
            current_line += " " + next_part
            
        if current_line:
            lines.append(current_line)

    processed_blocks = [] # List of strings (paragraphs/headings)
    current_paragraph = []

    def flush_paragraph():
        if current_paragraph:
            # Merge logic: Join with spaces, fix hyphenated line breaks
            # Replace "- " (hyphen at end of line) with empty string to merge words
            text = " ".join(current_paragraph).replace("- ", "") 
            if text.strip():
                processed_blocks.append(text.strip())
            current_paragraph.clear()

    for line in lines:
        line = line.strip()
        if not line:
            # Blank lines force a paragraph break
            flush_paragraph()
            continue

        # --- 6. CLEANUP RULES ---
        # Remove page numbers (standalone digits or "Page X of Y")
        if re.match(r'^\d+$', line) or re.match(r'^\d+\s*of\s*\d+$', line, re.IGNORECASE):
            continue
        
        # --- 1. HEADING DETECTION ---
        is_heading = False
        heading_level = 2 # Default to ##

        # Priority: Chapter/Section Prefix
        if re.match(r'^(Chapter|Section|Unit|Module)\s+\d+', line, re.IGNORECASE):
            is_heading = True
            heading_level = 1
        
        # Priority: ALL CAPS (3+ words, < 100 chars, must contain letters)
        elif line.isupper() and len(line.split()) >= 3 and len(line) < 100 and any(c.isalpha() for c in line):
            is_heading = True
            heading_level = 2

        # Priority: Numbered Heading (1. Introduction, 1.1 Method)
        elif re.match(r'^\d+(\.\d+)*\.?\s+[A-Za-z]', line) and len(line) < 100:
            is_heading = True
            # Level calc: 1. -> 2, 1.1 -> 3, 1.1.1 -> 4
            dots = line.split()[0].count('.')
            heading_level = min(2 + dots, 4)

        # Priority: Roman Numerals (I., II.)
        elif re.match(r'^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s+', line):
            is_heading = True
            heading_level = 2

        # Priority: Bold Markers (**Text**)
        elif line.startswith('**') and line.endswith('**') and len(line) < 80:
            is_heading = True
            heading_level = 3
            line = line.replace('**', '') # Remove markers for the header tag

        # Priority: Colon Ending (Introduction:)
        elif line.endswith(':') and len(line) < 50 and not re.match(r'^(Note|NB|Important|Example):', line, re.IGNORECASE):
            is_heading = True
            heading_level = 3

        if is_heading:
            flush_paragraph()
            processed_blocks.append(f"{'#' * heading_level} {line}")
            continue

        # --- 3. LIST DETECTION ---
        # Bullets (- • * ·)
        if re.match(r'^[-•*·]\s+', line):
            flush_paragraph()
            cleaned = re.sub(r'^[-•*·]\s+', '- ', line)
            processed_blocks.append(cleaned)
            continue
        
        # Numbered/Lettered Lists (1. 1) a. a) (a))
        if re.match(r'^(\d+|[a-zA-Z])[\)\.]\s+', line) or re.match(r'^\([a-zA-Z]\)\s+', line):
            flush_paragraph()
            processed_blocks.append(line)
            continue

        # --- 4. SPECIAL CONTENT ---
        # Definition (Term: Def)
        # Heuristic: Key is short (< 8 words), definition exists
        if ':' in line:
            parts = line.split(':', 1)
            key = parts[0].strip()
            val = parts[1].strip()
            if 0 < len(key.split()) < 8 and len(val) > 1:
                flush_paragraph()
                processed_blocks.append(f"- **{key}:** {val}")
                continue

        # Note/Warning/Example
        if re.match(r'^(Note|NB|Important|Example|E\.g\.|For example):', line, re.IGNORECASE):
            flush_paragraph()
            processed_blocks.append(f"> {line}")
            continue

        # Key-Value (Key = Value or Key -> Value)
        if re.match(r'^.+(\s*=\s*|\s*→\s*).+$', line) and len(line) < 100:
            flush_paragraph()
            processed_blocks.append(f"- {line}")
            continue

        # --- 5. PARAGRAPH ---
        current_paragraph.append(line)

    flush_paragraph()
    
    # Join blocks with double newlines for clear Markdown separation
    return "\n\n".join(processed_blocks)

# --- MAIN PIPELINE (HYBRID LAYOUT RECONSTRUCTION ENGINE) ---

def process_pdf_file(uploaded_file, subject_tag):
    """
    Hybrid Layout Reconstruction Pipeline:
    1. Extract text blocks and embedded images from each page
    2. Upload assets to Supabase Storage
    3. Screenshot each page and analyze layout with Vision AI
    4. Output structured JSON 'Layout Recipe' for frontend rendering
    """
    doc = fitz.open(stream=uploaded_file.read(), filetype="pdf")
    
    total_pages = len(doc)
    clean_name = uploaded_file.name.split('.')[0].replace(" ", "_")
    
    # Output: List of JSON Layout Recipes, one per page
    pages_json = []
    
    # Document metadata
    doc_metadata = {
        "filename": uploaded_file.name,
        "subject": subject_tag,
        "total_pages": total_pages,
        "processed_at": datetime.utcnow().isoformat()
    }
    
    with st.status("Processing Document (Hybrid Layout Engine)...", expanded=True) as status:
        
        status.write(f"📄 Found {total_pages} pages. Starting hybrid analysis...")
        prog_bar = st.progress(0.0)
        
        for i, page in enumerate(doc):
            page_num = i + 1
            
            # --- STEP 1: EXTRACT PAGE ASSETS (CLEAR PER PAGE) ---
            status.write(f"📝 Page {page_num}: Extracting text and images...")
            assets = extract_page_assets(doc, page, page_num, clean_name)
            
            raw_text = '\n'.join(assets.get('text_blocks', []))
            image_urls = [img['url'] for img in assets.get('images', [])]
            
            print(f"Page {page_num}: Found {len(assets['text_blocks'])} text blocks, {len(assets['images'])} images")
            
            # --- STEP 2: CLEAN TEXT WITH AI ---
            status.write(f"🧹 Page {page_num}: Cleaning and fixing text...")
            cleaned_text = clean_text_with_ai(raw_text)
            
            print(f"Page {page_num}: Text cleaned ({len(raw_text)} -> {len(cleaned_text)} chars)")
            
            # --- STEP 3: RENDER PAGE SCREENSHOT ---
            status.write(f"📸 Page {page_num}: Creating page screenshot...")
            mat = fitz.Matrix(2.0, 2.0)  # 2x zoom = ~144 DPI
            pix = page.get_pixmap(matrix=mat)
            page_img_bytes = pix.tobytes("png")
            
            # Upload page screenshot
            page_filename = f"page_{clean_name}_p{page_num}.png"
            page_image_url = upload_image_to_storage(page_img_bytes, page_filename)
            
            # --- STEP 4: ANALYZE LAYOUT WITH VISION AI ---
            status.write(f"🧠 Page {page_num}: Analyzing layout structure...")
            layout_recipe = analyze_layout_recipe(
                page_img_bytes, 
                page_image_url, 
                page_num, 
                cleaned_text,  # Pass CLEANED text
                image_urls     # Pass image URLs list
            )
            
            # Enrich recipe with raw assets (for fallback rendering)
            layout_recipe["raw_text"] = assets.get('text_blocks', [])
            layout_recipe["raw_images"] = assets.get('images', [])
            
            # Add to pages list
            pages_json.append(layout_recipe)
            
            # Update progress
            prog_bar.progress(page_num / total_pages)
            
            # Small delay to avoid rate limits
            if page_num < total_pages:
                time.sleep(0.5)
        
        status.write("✅ Finalizing document structure...")
        status.update(label="Processing Complete!", state="complete", expanded=False)
    
    # --- OUTPUT: JSON STRING ---
    output = {
        "metadata": doc_metadata,
        "pages": pages_json
    }
    
    return json.dumps(output, indent=2, ensure_ascii=False)

# --- UI LAYOUT ---

st.title("📚 PansGPT Manager")
st.markdown("---")

col1, col2 = st.columns([1, 1.5], gap="large") 

# --- LEFT COLUMN: UPLOAD ---
with col1:
    with st.container(border=True):
        st.subheader("📤 Upload Material")
        st.info("Upload PDF lectures here. The AI will extract text and analyze diagrams.")
        
        subject_tag = st.selectbox(
            "Subject Category", 
            [
                "Pharmacology(PCL)", 
                "Pharmaceutical Medicinal Chemistry(PCH)", 
                "Pharmaceutics(PCT)", 
                "Clinical Pharmacy(PCP/CLP)", 
                "Pharmaceutical Microbiology(PMB)", 
                "Pharmaceutical Technology(PTE)", 
                "Anatomy(ANA)", 
                "Physiology(PHY)", 
                "Biochemistry(BIO)", 
                "Other"
            ]
        )
        
        uploaded_file = st.file_uploader("Drop PDF here", type=["pdf"])

        if uploaded_file and st.button("Start Processing", type="primary", use_container_width=True):
            if not groq_client:
                st.error("Missing Groq API Key.")
            else:
                try:
                    processed_text = process_pdf_file(uploaded_file, subject_tag)
                    
                    if processed_text:
                        with st.spinner("Saving to database..."):
                            # Log to DB
                            saved = log_upload_to_db(uploaded_file.name, subject_tag, processed_text)
                            
                            if saved:
                                st.success("Saved to Database!")
                                time.sleep(1)
                                st.rerun()
                except Exception as e:
                    st.error(f"Critical Error during processing: {e}")

# --- RIGHT COLUMN: HISTORY ---
with col2:
    with st.container(border=True):
        h_col1, h_col2 = st.columns([5, 1])
        with h_col1:
            st.subheader("📚 Library History")
        with h_col2:
            if st.button("🔄", help="Refresh Library"):
                st.rerun()

        # Search Bar
        search_query = st.text_input("🔍 Search Library", placeholder="Search by filename or subject...", label_visibility="collapsed")

        history_data = get_upload_history()
        
        # Filter Logic
        if search_query and history_data:
            query = search_query.lower()
            history_data = [
                d for d in history_data 
                if query in d.get('filename', '').lower() or query in d.get('subject', '').lower()
            ]

        if history_data:
            # Scrollable container for history items if list is long
            with st.container(height=600):
                for doc in history_data:
                    with st.container(border=True):
                        c_info, c_actions = st.columns([4, 1.5])
                        
                        with c_info:
                            st.markdown(f"**{doc.get('filename', 'Unknown File')}**")
                            raw_date = doc.get('created_at', '')
                            display_date = raw_date[:10] if raw_date else "Unknown"
                            st.caption(f"🏷️ {doc.get('subject', 'General')} • 📅 {display_date}")
                        
                        with c_actions:
                            col_dl, col_del = st.columns(2)
                            with col_dl:
                                content = doc.get('content', '')
                                if content:
                                    dl_name = doc.get('filename', 'doc.pdf').replace(".pdf", ".txt")
                                    st.download_button(
                                        "📥", 
                                        data=content, 
                                        file_name=dl_name,
                                        key=f"dl_{doc['id']}",
                                        help="Download processed text"
                                    )
                            with col_del:
                                if st.button("🗑️", key=f"del_{doc['id']}", help="Delete document"):
                                    delete_document(doc['id'])
                                    time.sleep(0.5)
                                    st.rerun()
        else:
            if search_query:
                st.warning(f"No documents found matching '{search_query}'.")
            else:
                st.info("No documents found in database.")
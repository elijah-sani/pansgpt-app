// FILE: frontend/types/types.ts

export interface NoteSourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NoteSourceProps {
  source_page?: number;
  source_rect?: NoteSourceRect;
  source_quote?: string;
}

export type NoteBlock = Record<string, unknown> & {
  props?: Record<string, unknown> & NoteSourceProps;
  content?: Record<string, unknown>[];
};

export type BlockNoteContent = NoteBlock[];

export type NoteCategory = 'Definition' | 'Key Point' | 'Formula' | 'Important';

export interface PDFNote {
  id: string;
  user_id: string;
  document_id?: string;
  image_base64: string;
  ai_explanation?: string | null;
  category?: NoteCategory | null;
  page_number?: number | null;
  user_annotation?: string | null;
  created_at: string;
  title?: string;
  content?: BlockNoteContent;
  tags?: string[];
  last_edited_at?: string;
}

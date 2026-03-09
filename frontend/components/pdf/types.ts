export type PDFNote = {
  id: string | number;
  category?: string | null;
  ai_explanation?: string | null;
  user_annotation?: string | null;
  page_number?: number | null;
  image_base64?: string | null;
};

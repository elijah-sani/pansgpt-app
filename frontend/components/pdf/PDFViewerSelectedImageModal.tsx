import { X } from 'lucide-react';

type PDFViewerSelectedImageModalProps = {
  image: string | null;
  onClose: () => void;
};

export function PDFViewerSelectedImageModal({
  image,
  onClose,
}: PDFViewerSelectedImageModalProps) {
  if (!image) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 text-foreground/80 hover:text-foreground bg-background/50 hover:bg-background rounded-full transition-all"
        >
          <X className="w-6 h-6" />
        </button>
        <img
          src={`data:image/png;base64,${image}`}
          alt="Full screen snip"
          className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-border bg-white"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    </div>
  );
}

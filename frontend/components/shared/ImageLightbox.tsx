import { X } from 'lucide-react';

type ImageLightboxProps = {
  image: string | null;
  onClose: () => void;
};

export default function ImageLightbox({ image, onClose }: ImageLightboxProps) {
  if (!image) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/50 rounded-full p-2 transition-colors" onClick={onClose}>
        <X className="w-6 h-6" />
      </button>
      <img
        src={`data:image/jpeg;base64,${image}`}
        alt="Full View"
        className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

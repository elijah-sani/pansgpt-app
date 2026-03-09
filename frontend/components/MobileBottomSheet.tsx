'use client';

import React, { useEffect } from 'react';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: string;
}

export default function MobileBottomSheet({ isOpen, onClose, children, maxHeight = '90vh' }: MobileBottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-2xl overflow-hidden
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: `calc(${maxHeight} - 24px)` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

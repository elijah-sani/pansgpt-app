'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, RefreshCw, X } from 'lucide-react';
import MobileBottomSheet from '@/components/MobileBottomSheet';
import { buildAvatarUrl } from '@/lib/avatars';

interface AvatarSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (url: string) => void;
}

export default function AvatarSelectionModal({ isOpen, onClose, onConfirm }: AvatarSelectionModalProps) {
    const [seeds, setSeeds] = useState<string[]>([]);
    const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const generateSeeds = () => {
        setIsGenerating(true);
        const newSeeds = Array.from({ length: 12 }, () => Math.random().toString(36).substring(7));
        setSeeds(newSeeds);
        setTimeout(() => setIsGenerating(false), 400);
    };

    useEffect(() => {
        if (!isOpen) return;
        const t = setTimeout(() => {
            generateSeeds();
            setSelectedSeed(null);
        }, 0);
        return () => clearTimeout(t);
    }, [isOpen]);

    if (!isOpen) return null;

    const modalContent = (
        <>
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/30">
                <div>
                    <h2 className="text-lg font-bold text-foreground">Choose Avatar</h2>
                    <p className="text-sm text-muted-foreground">Select your digital persona</p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                </button>
            </div>

            <div className="p-5 overflow-y-auto bg-background/50">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {seeds.map((seed, i) => (
                        <motion.button
                            key={seed}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            onClick={() => setSelectedSeed(seed)}
                            className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                                selectedSeed === seed
                                    ? 'border-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-card scale-105 shadow-lg'
                                    : 'border-border hover:border-primary/50 hover:scale-105'
                            }`}
                        >
                            <img src={buildAvatarUrl(seed)} alt={`Avatar ${i}`} className="w-full h-full object-cover bg-muted/30" loading="lazy" />
                            {selectedSeed === seed && (
                                <div className="absolute top-1 right-1 bg-primary text-primary-foreground p-0.5 rounded-full shadow-sm">
                                    <Check className="w-3 h-3" />
                                </div>
                            )}
                        </motion.button>
                    ))}
                </div>
            </div>

            <div className="p-5 border-t border-border bg-muted/30 flex items-center justify-between gap-3">
                <button
                    onClick={generateSeeds}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 py-2.5 bg-background border border-border hover:bg-muted text-foreground rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
                <button
                    onClick={() => {
                        if (selectedSeed) onConfirm(buildAvatarUrl(selectedSeed));
                    }}
                    disabled={!selectedSeed}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold transition-all disabled:opacity-40 hover:opacity-90 shadow-md"
                >
                    <Check className="w-4 h-4" />
                    Confirm
                </button>
            </div>
        </>
    );

    return (
        <>
            <MobileBottomSheet isOpen={isOpen} onClose={onClose}>
                <div className="bg-card flex flex-col max-h-[90vh]">
                    {modalContent}
                </div>
            </MobileBottomSheet>

            <div className="hidden md:block">
                <AnimatePresence>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
                        onClick={onClose}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {modalContent}
                        </motion.div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </>
    );
}

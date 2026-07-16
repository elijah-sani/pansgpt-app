'use client';
import { useState } from 'react';
import { X, Scissors, MessageSquare, BookmarkPlus, Highlighter, ChevronRight, ChevronLeft } from 'lucide-react';

const STEPS = [
    {
        icon: MessageSquare,
        title: 'AI Chat',
        gif: '/ai%20chat.gif',
        description: 'Ask any question about what you\'re reading. The AI has full context of the open document.',
    },
    {
        icon: Scissors,
        title: 'Snip Tool',
        gif: '/snip.gif',
        description: 'Draw a box over any diagram, table, or image to ask the AI about it.',
    },
    {
        icon: Highlighter,
        title: 'Text Highlights',
        gif: '/highlight.gif',
        description: 'Select any text on the page to explain, define, or copy it instantly.',
    },
];

interface StudyModeTutorialProps {
    onClose: () => void;
}
export function StudyModeTutorial({ onClose }: StudyModeTutorialProps) {
    const [step, setStep] = useState(0);
    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-md md:max-w-lg overflow-hidden relative animate-in slide-in-from-bottom-4 duration-300">

                {/* GIF Showcase - spans 100% width of the card */}
                <div className="relative w-full aspect-video bg-muted/30 overflow-hidden border-b border-border/60 flex items-center justify-center select-none">
                    <img
                        src={current.gif}
                        alt={current.title}
                        className="w-full h-full object-cover"
                    />
                    {/* Close button overlayed in top-right corner of GIF */}
                    <button
                        onClick={onClose}
                        className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition-colors border border-white/10"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Header & Description */}
                <div className="px-6 pt-5 pb-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Study Mode Guide</p>
                    <h2 className="text-xl font-bold text-foreground mb-2">{current.title}</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>
                </div>

                {/* Footer */}
                <div className="px-6 pb-5 flex items-center justify-between">
                    {/* Step dots */}
                    <div className="flex gap-1.5">
                        {STEPS.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setStep(i)}
                                className={`w-2 h-2 rounded-full transition-all duration-200 ${i === step ? 'bg-primary w-5' : 'bg-border hover:bg-muted-foreground'}`}
                            />
                        ))}
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center gap-2">
                        {step > 0 && (
                            <button
                                onClick={() => setStep(s => s - 1)}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </button>
                        )}
                        <button
                            onClick={() => isLast ? onClose() : setStep(s => s + 1)}
                            className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        >
                            {isLast ? 'Get started' : 'Next'}
                            {!isLast && <ChevronRight className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

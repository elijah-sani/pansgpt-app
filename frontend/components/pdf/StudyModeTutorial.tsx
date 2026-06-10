'use client';
import { useState } from 'react';
import { X, Scissors, MessageSquare, BookmarkPlus, Highlighter, ChevronRight, ChevronLeft } from 'lucide-react';

const STEPS = [
    {
        icon: MessageSquare,
        title: 'AI Chat',
        description: 'Ask any question about what you\'re reading. The AI has full context of the open document — just type and it will explain, define, or summarize directly from the material.',
        tip: 'Try: "Explain this mechanism" or "Define the term on page 5"',
    },
    {
        icon: Scissors,
        title: 'Snip Tool',
        description: 'Click the scissors icon in the toolbar to activate snipping mode. Draw a rectangle over any diagram, table, or image — then send it directly to the AI for explanation.',
        tip: 'Perfect for complex diagrams or drug structure images.',
    },
    {
        icon: Highlighter,
        title: 'Text Highlights',
        description: 'Select any text on the page to reveal a quick action bar. You can ask the AI to explain or define the selected text, copy it, or save it as a note instantly.',
        tip: 'Long-press on mobile to select text.',
    },
    /* COMMENTED OUT: Notes feature hidden
    {
        icon: BookmarkPlus,
        title: 'Notes Panel',
        description: 'Save highlights, image snippets, and your own annotations to the Notes panel. Export all your notes as a PDF when you\'re ready to review.',
        tip: 'Click the Notes button in the top bar to open your notes.',
    },
    */
];

interface StudyModeTutorialProps {
    onClose: () => void;
}

export function StudyModeTutorial({ onClose }: StudyModeTutorialProps) {
    const [step, setStep] = useState(0);
    const current = STEPS[step];
    const Icon = current.icon;
    const isLast = step === STEPS.length - 1;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border rounded-2xl shadow-sm w-full max-w-sm relative animate-in slide-in-from-bottom-4 duration-300">

                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-border">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Study Mode Guide</p>
                    <h2 className="text-lg font-bold text-foreground">How to use the reader</h2>
                </div>

                {/* Step Content */}
                <div className="px-6 py-5">
                    <div className="w-12 h-12 rounded-xl bg-muted text-foreground flex items-center justify-center mb-4 border border-border">
                        <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-2">{current.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">{current.description}</p>
                    <div className="bg-muted/50 rounded-lg px-3 py-2 border border-border/50">
                        <p className="text-xs text-muted-foreground italic">{current.tip}</p>
                    </div>
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

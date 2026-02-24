import { BookOpen, Lightbulb, Brain, ChevronLeft, ChevronRight } from "lucide-react";

export function StudyModeMockup() {
    return (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {/* Header Bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Study Mode</span>
                </div>
                <div className="text-xs text-muted-foreground">PCH 405 - Pharmacokinetics</div>
            </div>

            {/* Content Area */}
            <div className="p-6 space-y-4">
                {/* Document Title */}
                <div className="pb-3 border-b border-border/50">
                    <h4 className="text-foreground font-semibold">Drug Metabolism & Biotransformation</h4>
                    <p className="text-xs text-muted-foreground mt-1">Prof. Adebayo's Lecture Notes</p>
                </div>

                {/* Reading Content with Highlighted Text */}
                <div className="text-sm text-foreground leading-relaxed space-y-3">
                    <p>
                        Drug metabolism involves the biochemical modification of pharmaceutical substances by living organisms, usually through specialized enzymatic systems.
                    </p>
                    <p>
                        The liver is the primary site of drug metabolism. Most drugs undergo{" "}
                        <span className="relative">
                            <span className="bg-primary/20 border-b-2 border-primary px-1 rounded">
                                Phase I and Phase II reactions
                            </span>
                            {/* Highlight Popup */}
                            <span className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card border border-border rounded-lg px-2 py-1.5 shadow-lg whitespace-nowrap z-10">
                                <button className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary transition-colors px-2 py-1 rounded hover:bg-muted">
                                    <Lightbulb className="w-3.5 h-3.5" />
                                    Explain
                                </button>
                                <span className="w-px h-4 bg-border"></span>
                                <button className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary transition-colors px-2 py-1 rounded hover:bg-muted">
                                    <Brain className="w-3.5 h-3.5" />
                                    Remember
                                </button>
                            </span>
                        </span>
                        {" "}to become more water-soluble for excretion.
                    </p>
                </div>
            </div>

            {/* Page Navigation Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <span className="text-xs text-muted-foreground">Page 3 of 12</span>
                <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
            </div>
        </div>
    );
}

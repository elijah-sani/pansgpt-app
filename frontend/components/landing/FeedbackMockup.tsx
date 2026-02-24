import { CheckCircle, Lightbulb, BookOpen } from "lucide-react";
import { Button } from "../ui/button";

export function FeedbackMockup() {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
      {/* Result Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h4 className="text-foreground">Correct Answer!</h4>
          <p className="text-sm text-muted-foreground">Great job understanding this concept</p>
        </div>
      </div>

      {/* Question Review */}
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Question:</p>
          <p className="text-foreground">
            Which phase of drug metabolism involves conjugation reactions?
          </p>
        </div>

        {/* Your Answer */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Your answer:</p>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/30">
            <CheckCircle className="w-4 h-4 text-primary" />
            <span className="text-foreground">Phase II metabolism</span>
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-primary" />
          <span className="text-sm text-primary">Why this is correct:</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Phase II metabolism involves conjugation reactions where the drug or its Phase I metabolite is coupled with an endogenous substance (like glucuronic acid, sulfate, or amino acids) to form a more water-soluble compound that can be easily excreted.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <BookOpen className="w-3 h-3 text-primary" />
          <span className="text-xs text-primary">Reference: PCH 302 - Drug Metabolism, Page 23</span>
        </div>
      </div>
    </div>
  );
}

import { CheckCircle, Circle, Sparkles } from "lucide-react";
import { Button } from "../ui/button";

export function QuizMockup() {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
      {/* Quiz Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary">AI-Generated Quiz</span>
          </div>
          <h4 className="text-foreground">Pharmacokinetics - Drug Metabolism</h4>
        </div>
        <div className="text-sm text-muted-foreground">
          Question 3 of 10
        </div>
      </div>

      {/* Question */}
      <div className="space-y-4">
        <p className="text-foreground">
          Which phase of drug metabolism involves conjugation reactions?
        </p>

        {/* Options */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer">
            <Circle className="w-5 h-5 text-muted-foreground" />
            <span className="text-foreground">Phase I metabolism</span>
          </div>
          
          <div className="flex items-center gap-3 p-4 rounded-lg border-2 border-primary/50 bg-primary/5">
            <CheckCircle className="w-5 h-5 text-primary" />
            <span className="text-foreground">Phase II metabolism</span>
          </div>
          
          <div className="flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer">
            <Circle className="w-5 h-5 text-muted-foreground" />
            <span className="text-foreground">Oxidation reactions</span>
          </div>
          
          <div className="flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer">
            <Circle className="w-5 h-5 text-muted-foreground" />
            <span className="text-foreground">Reduction reactions</span>
          </div>
        </div>
      </div>

      {/* Action Button */}
     
    </div>
  );
}

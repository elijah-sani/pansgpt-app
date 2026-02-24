import { Check, X } from "lucide-react";
import { Card } from "../ui/card";

interface ComparisonRow {
  feature: string;
  chatgpt: string;
  pansgpt: string;
  chatgptNegative?: boolean;
}

const comparisonData: ComparisonRow[] = [
  {
    feature: "Where it gets answers?",
    chatgpt: "The whole, random internet.",
    pansgpt: "Only your UJ Pharmacy notes.",
    chatgptNegative: true
  },
  {
    feature: "Are answers correct?",
    chatgpt: "Can be wrong or make things up.",
    pansgpt: "Accurate. Based 100% on your course materials.",
    chatgptNegative: true
  },
  {
    feature: "Is it specialized?",
    chatgpt: "No. It knows nothing about your lecturers or courses.",
    pansgpt: "Yes. It knows \"PCH 301\" and \"Dr. Audu's\" notes.",
    chatgptNegative: true
  },
  {
    feature: "What's the goal?",
    chatgpt: "To chat about anything.",
    pansgpt: "To help you pass your pharmacy exams.",
    chatgptNegative: true
  }
];

export function ComparisonTable() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="hidden md:block"></div>
        <Card className="bg-muted/30 border-border p-4 text-center">
          <p className="text-muted-foreground">Generic AI (like ChatGPT)</p>
        </Card>
        <Card className="bg-primary/10 border-primary/30 p-4 text-center">
          <p className="text-primary">PansGPT (Your Study Partner)</p>
        </Card>
      </div>

      {/* Comparison Rows */}
      <div className="space-y-4">
        {comparisonData.map((row, index) => (
          <Card key={index} className="bg-card border-border p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* Feature Name */}
              <div className="md:pr-4">
                <h4 className="text-foreground">{row.feature}</h4>
              </div>

              {/* ChatGPT */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border">
                {row.chatgptNegative && (
                  <X className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                )}
                <p className="text-muted-foreground text-sm">{row.chatgpt}</p>
              </div>

              {/* PansGPT */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/30">
                <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-foreground text-sm">{row.pansgpt}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

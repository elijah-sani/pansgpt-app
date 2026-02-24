import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface FeatureShowcaseProps {
  icon: LucideIcon;
  title: string;
  description: string;
  mockup: ReactNode;
  reverse?: boolean;
}

export function FeatureShowcase({ icon: Icon, title, description, mockup, reverse = false }: FeatureShowcaseProps) {
  return (
    <div className={`grid md:grid-cols-2 gap-8 md:gap-12 items-center ${reverse ? 'md:flex-row-reverse' : ''}`}>
      <div className={`space-y-6 ${reverse ? 'md:order-2' : ''}`}>
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary" />
        </div>
        <div className="space-y-3">
          <h3 className="text-2xl text-foreground">{title}</h3>
          <p className="text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
      
      <div className={`${reverse ? 'md:order-1' : ''}`}>
        {mockup}
      </div>
    </div>
  );
}

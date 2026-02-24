import { Card, CardContent } from "../ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "../ui/avatar";
import { Quote } from "lucide-react";

interface TestimonialCardProps {
  quote: string;
  name: string;
  role: string;
  imageUrl?: string;
}

export function TestimonialCard({ quote, name, role, imageUrl }: TestimonialCardProps) {
  // Generate initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2); // Take first 2 initials max
  };

  return (
    <Card className="bg-card border-border h-full">
      <CardContent className="p-6 space-y-4 h-full flex flex-col">
        <Quote className="w-8 h-8 text-primary/30" />
        <p className="text-foreground flex-grow">{quote}</p>
        <div className="flex items-center gap-4 pt-4 border-t border-border">
          <Avatar className="w-12 h-12">
            {imageUrl ? (
              <AvatarImage src={imageUrl} alt={name} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-foreground">{name}</p>
            <p className="text-muted-foreground text-sm">{role}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

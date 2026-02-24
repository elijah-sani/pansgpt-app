import { MessageSquare, Send } from "lucide-react";

export function ChatMockup() {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      {/* Chat Messages */}
      <div className="space-y-4">
        {/* User Message */}
        <div className="flex justify-end">
          <div className="bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
            <p className="text-sm text-foreground">Explain the mechanism of action for Metformin in simple terms</p>
          </div>
        </div>
        
        {/* AI Response */}
        <div className="flex justify-start">
          <div className="bg-muted/50 border border-border rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] space-y-2">
            <p className="text-sm text-foreground">
              Metformin works primarily by reducing glucose production in the liver. Here's how:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 pl-4">
              <li>• Decreases hepatic glucose output</li>
              <li>• Improves insulin sensitivity in peripheral tissues</li>
              <li>• Reduces intestinal glucose absorption</li>
            </ul>
            <div className="pt-2 border-t border-border/50 mt-3">
              <p className="text-xs text-primary">📄 Source: PCH 303 - Dr. Chime's Pharmacodynamics Notes, Page 45</p>
            </div>
          </div>
        </div>
      </div>

      {/* Input Field */}
      <div className="flex items-center gap-2 bg-muted/30 border border-border rounded-xl px-4 py-3">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <input 
          type="text" 
          placeholder="Ask anything from your course materials..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          disabled
        />
        <Send className="w-4 h-4 text-primary" />
      </div>
    </div>
  );
}

'use client'; // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
import { motion } from "framer-motion"; // [QUICK ACTION CARDS]
import { Layers, ClipboardList, ScanSearch, Sparkles, GraduationCap } from "lucide-react"; // [QUICK ACTION CARDS]
import type { LucideIcon } from "lucide-react"; // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
interface QuickActionCardConfig { // [QUICK ACTION CARDS]
  id: string; // [QUICK ACTION CARDS]
  title: string; // [QUICK ACTION CARDS]
  description: string; // [QUICK ACTION CARDS]
  icon: LucideIcon; // [QUICK ACTION CARDS]
  modalLabel: string; // [QUICK ACTION CARDS]
  hasCountSelector: boolean; // [QUICK ACTION CARDS]
  buildPrompt: (input: string, count?: number) => string; // [QUICK ACTION CARDS]
} // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
export const QUICK_ACTION_CARDS = [ // [QUICK ACTION CARDS]
  { // [QUICK ACTION CARDS]
    id: "break-it-down", // [QUICK ACTION CARDS]
    title: "Break down", // [QUICK ACTION CARDS]
    description: "Understand any drug or concept from first principles", // [QUICK ACTION CARDS]
    icon: Layers, // [QUICK ACTION CARDS]
    modalLabel: "What drug or concept?", // [QUICK ACTION CARDS]
    hasCountSelector: false, // [QUICK ACTION CARDS]
    buildPrompt: (input: string) => `Explain ${input} to me like I'm encountering it for the first time. Cover the mechanism, why it matters pharmacologically, and one thing students consistently get wrong about it. Calibrate the depth and any clinical context based on my current level.`, // [QUICK ACTION CARDS]
  }, // [QUICK ACTION CARDS]
  { // [QUICK ACTION CARDS]
    id: "quiz-me", // [QUICK ACTION CARDS]
    title: "Quiz me", // [QUICK ACTION CARDS]
    description: "Test your understanding with targeted MCQs", // [QUICK ACTION CARDS]
    icon: ClipboardList, // [QUICK ACTION CARDS]
    modalLabel: "What topic?", // [QUICK ACTION CARDS]
    hasCountSelector: true, // [QUICK ACTION CARDS]
    buildPrompt: (input: string, count: number = 5) => `Generate ${count} MCQs on ${input} that test understanding, not memorization. Present them one at a time. After I answer each one, explain the concept behind it fully - not just correct or incorrect.`, // [QUICK ACTION CARDS]
  }, // [QUICK ACTION CARDS]
  { // [QUICK ACTION CARDS]
    id: "weak-spot-finder", // [QUICK ACTION CARDS]
    title: "Weak spots", // [QUICK ACTION CARDS]
    description: "Find exactly where your understanding breaks down", // [QUICK ACTION CARDS]
    icon: ScanSearch, // [QUICK ACTION CARDS]
    modalLabel: "What topic do you think you understand?", // [QUICK ACTION CARDS]
    hasCountSelector: false, // [QUICK ACTION CARDS]
    buildPrompt: (input: string) => `Ask me 3 probing questions on ${input} one at a time. After I've answered all three, give me an honest breakdown of exactly where my understanding is solid and where the gaps are. Don't go easy on me.`, // [QUICK ACTION CARDS]
  }, // [QUICK ACTION CARDS]
  { // [QUICK ACTION CARDS]
    id: "mnemonics-memory", // [QUICK ACTION CARDS]
    title: "Mnemonics", // [QUICK ACTION CARDS]
    description: "Turn hard-to-remember facts into things that stick", // [QUICK ACTION CARDS]
    icon: Sparkles, // [QUICK ACTION CARDS]
    modalLabel: "What do you need to memorize?", // [QUICK ACTION CARDS]
    hasCountSelector: false, // [QUICK ACTION CARDS]
    buildPrompt: (input: string) => `Help me memorize ${input} using mnemonics, acronyms, patterns, or memorable stories. Focus especially on the things that are notoriously hard to retain in pharmacy.`, // [QUICK ACTION CARDS]
  }, // [QUICK ACTION CARDS]
  { // [QUICK ACTION CARDS]
    id: "teach-it-back", // [QUICK ACTION CARDS]
    title: "Teach back", // [QUICK ACTION CARDS]
    description: "Prove you really know it by teaching it to the AI", // [QUICK ACTION CARDS]
    icon: GraduationCap, // [QUICK ACTION CARDS]
    modalLabel: "What topic do you want to teach?", // [QUICK ACTION CARDS]
    hasCountSelector: false, // [QUICK ACTION CARDS]
    buildPrompt: (input: string) => `Play the role of a confused pharmacy student who just attended a lecture on ${input} and didn't fully understand it. Ask me genuine questions a struggling student would ask - one at a time. After I've explained it to you, evaluate my explanation honestly: what was accurate, what was missing, and what was wrong. End with a clear summary of my gaps.`, // [QUICK ACTION CARDS]
  }, // [QUICK ACTION CARDS]
] as const satisfies readonly QuickActionCardConfig[]; // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
export type QuickActionCard = typeof QUICK_ACTION_CARDS[number]; // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
interface QuickActionCardsProps { // [QUICK ACTION CARDS]
  onCardClick: (card: typeof QUICK_ACTION_CARDS[number]) => void; // [QUICK ACTION CARDS]
} // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
export function QuickActionCards({ onCardClick }: QuickActionCardsProps) {
  return (
    <div className="w-full px-0 pt-4 pb-1 sm:px-4 sm:pt-2">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-2">
        {QUICK_ACTION_CARDS.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.id}
              type="button"
              whileHover={{ scale: 1.01 }}
              transition={{ duration: 0.1 }}
              onClick={() => onCardClick(card)}
              className="group flex w-full items-center gap-4 rounded-xl bg-transparent px-2 py-3.5 text-left transition-colors hover:bg-muted/50 sm:inline-flex sm:h-8 sm:w-auto sm:items-center sm:gap-1.5 sm:rounded-[6px] sm:border sm:border-border/60 sm:bg-card sm:px-3 sm:text-sm sm:font-medium sm:shadow-sm sm:hover:bg-muted"
            >
              <Icon className="h-5 w-5 text-foreground/80 transition-colors group-hover:text-foreground sm:h-4 sm:w-4 sm:text-muted-foreground sm:group-hover:text-foreground" />
              <span className="text-[15px] font-medium text-foreground/90 transition-colors group-hover:text-foreground sm:text-sm sm:text-foreground">
                {card.title}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}


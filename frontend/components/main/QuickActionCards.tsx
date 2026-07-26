'use client';

import { motion } from "framer-motion";
import { ArrowUpRight, Layers, ScanSearch, Sparkles, GraduationCap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface QuickActionCardConfig {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  actionText: string;
  modalLabel: string;
  hasCountSelector: boolean;
  buildPrompt: (input: string, count?: number) => string;
}

export const QUICK_ACTION_CARDS = [
  {
    id: "break-it-down",
    title: "Break down",
    description: "Understand any drug or concept from first principles",
    icon: Layers,
    actionText: "Break down concept",
    modalLabel: "What drug or concept?",
    hasCountSelector: false,
    buildPrompt: (input: string) => `Explain ${input} to me like I'm encountering it for the first time. Cover the mechanism, why it matters pharmacologically, and one thing students consistently get wrong about it. Calibrate the depth and any clinical context based on my current level.`,
  },
  {
    id: "weak-spot-finder",
    title: "Weak spots",
    description: "Find exactly where your understanding breaks down",
    icon: ScanSearch,
    actionText: "Find weak spots",
    modalLabel: "What topic do you think you understand?",
    hasCountSelector: false,
    buildPrompt: (input: string) => `Ask me 3 probing questions on ${input} one at a time. After I've answered all three, give me an honest breakdown of exactly where my understanding is solid and where the gaps are. Don't go easy on me.`,
  },
  {
    id: "mnemonics-memory",
    title: "Mnemonics",
    description: "Turn hard-to-remember facts into things that stick",
    icon: Sparkles,
    actionText: "Create mnemonic",
    modalLabel: "What topic do you need a mnemonic for?",
    hasCountSelector: false,
    buildPrompt: (input: string) => `Generate a clear, effective mnemonic for ${input} using acronyms, word associations, patterns, or stories to help remember it easily. Explain how the mnemonic works and how to apply it.`,
  },
  {
    id: "teach-it-back",
    title: "Teach back",
    description: "Prove you really know it by teaching it to the AI",
    icon: GraduationCap,
    actionText: "Start teaching",
    modalLabel: "What topic do you want to teach?",
    hasCountSelector: false,
    buildPrompt: (input: string) => `Play the role of a confused pharmacy student who just attended a lecture on ${input} and didn't fully understand it. Ask me genuine questions a struggling student would ask - one at a time. After I've explained it to you, evaluate my explanation honestly: what was accurate, what was missing, and what was wrong. End with a clear summary of my gaps.`,
  },
] as const satisfies readonly QuickActionCardConfig[];

export type QuickActionCard = typeof QUICK_ACTION_CARDS[number];

interface QuickActionCardsProps {
  onCardClick: (card: typeof QUICK_ACTION_CARDS[number]) => void;
  layoutMode?: 'row' | 'grid';
}

export function QuickActionCards({ onCardClick, layoutMode = 'row' }: QuickActionCardsProps) {
  if (layoutMode === 'grid') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        {QUICK_ACTION_CARDS.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.id}
              type="button"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.08, ease: "easeOut" }}
              whileHover={{ y: -3, scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onCardClick(card)}
              className="group flex flex-col justify-between p-5 rounded-2xl border border-border/80 bg-card hover:bg-card hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 text-left transition-all duration-200 cursor-pointer relative overflow-hidden"
            >
              {/* Subtle top accent gradient glow on hover */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200 shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold text-primary/80 group-hover:text-primary transition-colors">
                    <span>{card.actionText}</span>
                    <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </div>

                <h4 className="font-bold text-base text-foreground group-hover:text-primary transition-colors mb-1">
                  {card.title}
                </h4>

                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {card.description}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full px-0 pt-4 pb-1 sm:px-4 sm:pt-2">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-2">
        {QUICK_ACTION_CARDS.map((card) => {
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

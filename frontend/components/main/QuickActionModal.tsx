'use client'; // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
import { AnimatePresence, motion } from "framer-motion"; // [QUICK ACTION CARDS]
import { X } from "lucide-react"; // [QUICK ACTION CARDS]
import { useEffect, useRef, useState } from "react"; // [QUICK ACTION CARDS]
import type { QuickActionCard } from "@/components/main/QuickActionCards"; // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
interface QuickActionModalProps { // [QUICK ACTION CARDS]
  isOpen: boolean; // [QUICK ACTION CARDS]
  onClose: () => void; // [QUICK ACTION CARDS]
  card: QuickActionCard | null; // [QUICK ACTION CARDS]
  onSubmit: (prompt: string) => void; // [QUICK ACTION CARDS]
} // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
export function QuickActionModal({ isOpen, onClose, card, onSubmit }: QuickActionModalProps) { // [QUICK ACTION CARDS]
  const [inputValue, setInputValue] = useState(""); // [QUICK ACTION CARDS]
  const [selectedCount, setSelectedCount] = useState(5); // [QUICK ACTION CARDS]
  const [showValidation, setShowValidation] = useState(false); // [QUICK ACTION CARDS]
  const inputRef = useRef<HTMLInputElement>(null); // [QUICK ACTION CARDS]
  const ActiveIcon = card?.icon; // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
  useEffect(() => { // [QUICK ACTION CARDS]
    if (isOpen) { // [QUICK ACTION CARDS]
      setInputValue(""); // [QUICK ACTION CARDS]
      setSelectedCount(5); // [QUICK ACTION CARDS]
      setShowValidation(false); // [QUICK ACTION CARDS]
      window.setTimeout(() => inputRef.current?.focus(), 0); // [QUICK ACTION CARDS]
    } // [QUICK ACTION CARDS]
  }, [isOpen]); // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
  const handleSubmit = () => { // [QUICK ACTION CARDS]
    if (!card) { // [QUICK ACTION CARDS]
      return; // [QUICK ACTION CARDS]
    } // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
    if (inputValue.trim() === "") { // [QUICK ACTION CARDS]
      setShowValidation(true); // [QUICK ACTION CARDS]
      return; // [QUICK ACTION CARDS]
    } // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
    const prompt = card.hasCountSelector ? card.buildPrompt(inputValue.trim(), selectedCount) : card.buildPrompt(inputValue.trim()); // [QUICK ACTION CARDS]
    onSubmit(prompt); // [QUICK ACTION CARDS]
    onClose(); // [QUICK ACTION CARDS]
  }; // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
  return ( // [QUICK ACTION CARDS]
    <AnimatePresence> {/* [QUICK ACTION CARDS] */}
      {isOpen && card ? ( // [QUICK ACTION CARDS]
        <motion.div // [QUICK ACTION CARDS]
          initial={{ opacity: 0, y: -6 }} // [QUICK ACTION CARDS]
          animate={{ opacity: 1, y: 0 }} // [QUICK ACTION CARDS]
          exit={{ opacity: 0, y: -6 }} // [QUICK ACTION CARDS]
          transition={{ duration: 0.15 }} // [QUICK ACTION CARDS]
          className="mx-auto mt-3 w-[90%] max-w-[43.2rem] rounded-xl border border-border/60 bg-card px-3 py-2 text-left shadow-sm" // [QUICK ACTION CARDS]
        > {/* [QUICK ACTION CARDS] */}
          <div className="mb-2 flex items-center justify-between gap-3"> {/* [QUICK ACTION CARDS] */}
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground"> {/* [QUICK ACTION CARDS] */}
              {ActiveIcon ? <ActiveIcon className="h-4 w-4 text-muted-foreground" /> : null} {/* [QUICK ACTION CARDS] */}
              <span>{card.title}</span> {/* [QUICK ACTION CARDS] */}
            </div> {/* [QUICK ACTION CARDS] */}
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"> {/* [QUICK ACTION CARDS] */}
              <X className="h-4 w-4" /> {/* [QUICK ACTION CARDS] */}
            </button> {/* [QUICK ACTION CARDS] */}
          </div> {/* [QUICK ACTION CARDS] */}
          <div className="flex items-center gap-2 border-t border-border/60 pt-2"> {/* [QUICK ACTION CARDS] */}
            <input // [QUICK ACTION CARDS]
              id="quick-action-input" // [QUICK ACTION CARDS]
              ref={inputRef} // [QUICK ACTION CARDS]
              value={inputValue} // [QUICK ACTION CARDS]
              onChange={(event) => { setInputValue(event.target.value); setShowValidation(false); }} // [QUICK ACTION CARDS]
              onKeyDown={(event) => { if (event.key === "Enter") handleSubmit(); if (event.key === "Escape") onClose(); }} // [QUICK ACTION CARDS]
              placeholder={card.modalLabel} // [QUICK ACTION CARDS]
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" // [QUICK ACTION CARDS]
            /> {/* [QUICK ACTION CARDS] */}
            <button type="button" onClick={handleSubmit} className="rounded-[6px] bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">Use</button> {/* [QUICK ACTION CARDS] */}
          </div> {/* [QUICK ACTION CARDS] */}
            {card.hasCountSelector ? ( // [QUICK ACTION CARDS]
              <div> {/* [QUICK ACTION CARDS] */}
                <p className="text-xs text-muted-foreground mt-3 mb-1">Number of questions</p> {/* [QUICK ACTION CARDS] */}
                <div className="flex gap-2"> {/* [QUICK ACTION CARDS] */}
                  {[5, 10, 15].map((count) => ( // [QUICK ACTION CARDS]
                    <button // [QUICK ACTION CARDS]
                      key={count} // [QUICK ACTION CARDS]
                      type="button" // [QUICK ACTION CARDS]
                      onClick={() => setSelectedCount(count)} // [QUICK ACTION CARDS]
                      className={`rounded-full px-4 py-1 text-sm font-medium transition-colors cursor-pointer ${selectedCount === count ? "bg-primary text-primary-foreground" : "border border-border/60 bg-card text-foreground hover:bg-muted"}`} // [QUICK ACTION CARDS]
                    > {/* [QUICK ACTION CARDS] */}
                      {count} {/* [QUICK ACTION CARDS] */}
                      {/* [QUICK ACTION CARDS] */}</button>
                  ))} {/* [QUICK ACTION CARDS] */}
                </div> {/* [QUICK ACTION CARDS] */}
                {/* [QUICK ACTION CARDS] */}</div>
            ) : null} {/* [QUICK ACTION CARDS] */}
            {showValidation ? <p className="text-xs text-destructive mt-1">Please enter a topic first</p> : null} {/* [QUICK ACTION CARDS] */}
          {/* [QUICK ACTION CARDS] */}</motion.div>
      ) : null} {/* [QUICK ACTION CARDS] */}
      {/* [QUICK ACTION CARDS] */}</AnimatePresence>
  ); // [QUICK ACTION CARDS]
} // [QUICK ACTION CARDS]

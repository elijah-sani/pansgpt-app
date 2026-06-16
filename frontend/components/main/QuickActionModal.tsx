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
  isInlineMobile?: boolean; // [QUICK ACTION CARDS]
} // [QUICK ACTION CARDS]
 // [QUICK ACTION CARDS]
export function QuickActionModal({ isOpen, onClose, card, onSubmit, isInlineMobile = false }: QuickActionModalProps) { // [QUICK ACTION CARDS]
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
      
      // Synchronous attempt if already in DOM
      if (inputRef.current) {
        inputRef.current.focus();
      }
      
      // Sequenced timeouts to catch mounting delays on mobile/desktop
      const t1 = window.setTimeout(() => inputRef.current?.focus(), 0);
      const t2 = window.setTimeout(() => inputRef.current?.focus(), 50);
      const t3 = window.setTimeout(() => inputRef.current?.focus(), 150);
      
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
      };
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
          initial={{ opacity: 0, y: isInlineMobile ? 12 : -6 }} // [QUICK ACTION CARDS]
          animate={{ opacity: 1, y: 0 }} // [QUICK ACTION CARDS]
          exit={{ opacity: 0, y: isInlineMobile ? 12 : -6 }} // [QUICK ACTION CARDS]
          transition={{ duration: 0.15 }} // [QUICK ACTION CARDS]
          className={
            isInlineMobile
              ? "w-full max-w-[43.2rem] mx-auto rounded-2xl border border-border/60 bg-card p-3 text-left shadow-sm" // [QUICK ACTION CARDS]
              : "mx-auto mt-3 w-[90%] max-w-[43.2rem] rounded-xl border border-border/60 bg-card px-3 py-2 text-left shadow-sm" // [QUICK ACTION CARDS]
          }
        > {/* [QUICK ACTION CARDS] */}
          <div className="mb-2 flex items-center justify-between gap-3"> {/* [QUICK ACTION CARDS] */}
            <div className="flex items-center gap-1.5 text-base font-medium text-foreground sm:text-sm"> {/* [QUICK ACTION CARDS] */}
              {ActiveIcon ? <ActiveIcon className="h-5 w-5 text-muted-foreground sm:h-4 sm:w-4" /> : null} {/* [QUICK ACTION CARDS] */}
              <span>{card.title}</span> {/* [QUICK ACTION CARDS] */}
            </div> {/* [QUICK ACTION CARDS] */}
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"> {/* [QUICK ACTION CARDS] */}
              <X className="h-5 w-5 sm:h-4 sm:w-4" /> {/* [QUICK ACTION CARDS] */}
            </button> {/* [QUICK ACTION CARDS] */}
          </div> {/* [QUICK ACTION CARDS] */}
          <div className="flex items-center gap-2 border-t border-border/60 pt-2"> {/* [QUICK ACTION CARDS] */}
            <input // [QUICK ACTION CARDS]
              id="quick-action-input" // [QUICK ACTION CARDS]
              ref={inputRef} // [QUICK ACTION CARDS]
              autoFocus // [QUICK ACTION CARDS]
              value={inputValue} // [QUICK ACTION CARDS]
              onChange={(event) => { setInputValue(event.target.value); setShowValidation(false); }} // [QUICK ACTION CARDS]
              onKeyDown={(event) => { if (event.key === "Enter") handleSubmit(); if (event.key === "Escape") onClose(); }} // [QUICK ACTION CARDS]
              placeholder={card.modalLabel} // [QUICK ACTION CARDS]
              className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground placeholder:text-[13px] sm:placeholder:text-sm focus:outline-none sm:h-9 sm:text-sm" // [QUICK ACTION CARDS]
            /> {/* [QUICK ACTION CARDS] */}
            <button type="button" onClick={handleSubmit} className="rounded-[6px] bg-primary px-3 py-2 text-base font-medium text-primary-foreground hover:opacity-90 transition-opacity sm:py-1.5 sm:text-sm">Use</button> {/* [QUICK ACTION CARDS] */}
          </div> {/* [QUICK ACTION CARDS] */}
            {card.hasCountSelector ? ( // [QUICK ACTION CARDS]
              <div> {/* [QUICK ACTION CARDS] */}
                <p className="mt-3 mb-2 text-sm text-muted-foreground sm:mb-1 sm:text-xs">Number of questions</p> {/* [QUICK ACTION CARDS] */}
                <div className="flex gap-2"> {/* [QUICK ACTION CARDS] */}
                  {[5, 10, 15].map((count) => ( // [QUICK ACTION CARDS]
                    <button // [QUICK ACTION CARDS]
                      key={count} // [QUICK ACTION CARDS]
                      type="button" // [QUICK ACTION CARDS]
                      onClick={() => setSelectedCount(count)} // [QUICK ACTION CARDS]
                      className={`rounded-full px-5 py-1.5 text-base font-medium transition-colors cursor-pointer sm:px-4 sm:py-1 sm:text-sm ${selectedCount === count ? "bg-primary text-primary-foreground" : "border border-border/60 bg-card text-foreground hover:bg-muted"}`} // [QUICK ACTION CARDS]
                    > {/* [QUICK ACTION CARDS] */}
                      {count} {/* [QUICK ACTION CARDS] */}
                      {/* [QUICK ACTION CARDS] */}</button>
                  ))} {/* [QUICK ACTION CARDS] */}
                </div> {/* [QUICK ACTION CARDS] */}
                {/* [QUICK ACTION CARDS] */}</div>
            ) : null} {/* [QUICK ACTION CARDS] */}
            {showValidation ? <p className="mt-2 text-sm text-destructive sm:mt-1 sm:text-xs">Please enter a topic first</p> : null} {/* [QUICK ACTION CARDS] */}
          {/* [QUICK ACTION CARDS] */}</motion.div>
      ) : null} {/* [QUICK ACTION CARDS] */}
      {/* [QUICK ACTION CARDS] */}</AnimatePresence>
  ); // [QUICK ACTION CARDS]
} // [QUICK ACTION CARDS]

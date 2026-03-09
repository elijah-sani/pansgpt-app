import { SlidersHorizontal, X } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { QuizFilters } from './types';

type QuizFilterModalProps = {
  applyFilters: () => void;
  clearFilters: () => void;
  draftFilters: QuizFilters;
  isOpen: boolean;
  setDraftFilters: Dispatch<SetStateAction<QuizFilters>>;
  onClose: () => void;
};

export function QuizFilterModal({
  applyFilters,
  clearFilters,
  draftFilters,
  isOpen,
  setDraftFilters,
  onClose,
}: QuizFilterModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:justify-start"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full sm:w-80 sm:ml-[76px] bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 animate-in slide-in-from-bottom-4 sm:slide-in-from-left-4 duration-250"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <SlidersHorizontal size={14} className="text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Filter History</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Course Code
          </label>
          <input
            type="text"
            value={draftFilters.courseCode}
            onChange={(event) => setDraftFilters((previous) => ({ ...previous, courseCode: event.target.value }))}
            placeholder="e.g. CSC 301"
            className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
        </div>

        <div className="mb-5">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Academic Level
          </label>
          <div className="grid grid-cols-3 gap-2">
            {['', '100', '200', '300', '400', '500', '600'].map((level) => (
              <button
                key={level}
                onClick={() => setDraftFilters((previous) => ({ ...previous, level }))}
                className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                  draftFilters.level === level
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background text-foreground border-border hover:border-primary/40 hover:bg-muted/40'
                }`}
              >
                {level === '' ? 'All' : level}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={clearFilters}
            className="flex-1 py-2.5 text-sm font-medium text-muted-foreground bg-muted/40 hover:bg-muted/70 rounded-xl border border-border transition-colors"
          >
            Clear
          </button>
          <button
            onClick={applyFilters}
            className="flex-1 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors shadow-sm"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

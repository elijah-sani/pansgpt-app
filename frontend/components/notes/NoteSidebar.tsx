"use client";

import React from "react";
import { PDFNote, NoteCategory } from "../../types/types";
import { PenSquare, Search, NotepadText, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface NoteSidebarProps {
  notes: PDFNote[];
  selectedNoteId: string | null;
  onSelectNote: (note: PDFNote) => void;
  onNewNote: () => void;
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (val: string) => void;
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  
  return date.toLocaleDateString();
}

const CATEGORY_COLORS: Record<NoteCategory, string> = {
  "Definition": "bg-blue-500",
  "Formula": "bg-purple-500",
  "Key Point": "bg-green-500",
  "Important": "bg-red-500",
};

export default function NoteSidebar({
  notes,
  selectedNoteId,
  onSelectNote,
  onNewNote,
  isLoading,
  searchQuery,
  onSearchChange,
}: NoteSidebarProps) {
  // Helper to extract text
  const extractPlainText = (content?: any[]) => {
    if (!content) return "";
    let text = "";
    for (const block of content) {
      if (block.content && Array.isArray(block.content)) {
        for (const item of block.content) {
          if (item.type === "text" && item.text) {
            text += item.text + " ";
          }
        }
      }
    }
    return text.trim().substring(0, 60);
  };

  const hasFilters = searchQuery !== "";

  return (
    <div className="w-full md:w-[280px] h-full flex flex-col bg-card border-l border-r border-border shrink-0">
      <div className="p-4 flex flex-col gap-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Notes</h2>
          <button 
            onClick={onNewNote}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            <PenSquare size={20} />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-accent text-sm text-foreground rounded-lg pl-9 pr-9 py-2 outline-none border border-transparent focus:border-border transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground hover:bg-accent/80 rounded-md transition-colors"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
        ) : notes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground gap-3">
            <NotepadText size={48} className="opacity-20" />
            <p className="text-sm">
              {hasFilters ? "No results found" : "No notes yet"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {notes.map(note => {
                const isActive = note.id === selectedNoteId;
                const snippet = extractPlainText(note.content as any[]) || note.user_annotation || "Empty note...";
                
                return (
                  <motion.button
                    key={note.id}
                    layout="position"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => onSelectNote(note)}
                    className={`w-full text-left p-3 rounded-xl transition-colors flex flex-col gap-1 ${
                      isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-medium truncate text-sm ${isActive ? "text-foreground" : ""}`}>
                        {note.title || "Untitled note"}
                      </span>
                      {note.category && (
                        <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_COLORS[note.category as NoteCategory] || "bg-gray-500"}`} />
                      )}
                    </div>
                    <p className="text-xs truncate opacity-70">
                      {snippet}
                    </p>
                    <span className="text-[10px] opacity-50 mt-1">
                      {formatRelativeTime(note.last_edited_at || note.created_at)}
                    </span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

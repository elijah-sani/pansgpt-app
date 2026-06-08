"use client";
import React from "react";
import { PanelLeft, Share2 } from "lucide-react";
import { useSidebarTrigger } from "@/lib/sidebar-controls";

export default function QuizResultsHeader() {
    const openSidebar = useSidebarTrigger();
    const toggleShareCard = () => {
        window.dispatchEvent(new Event('quiz-results-toggle-share'));
    };

    return (
        <div className="md:hidden flex items-center px-4 py-3 border-b border-border bg-card/95 backdrop-blur-sm sticky top-0 z-10">
            <button
                onClick={openSidebar}
                className="p-2 text-foreground hover:bg-accent rounded-lg transition-colors mr-2"
                aria-label="Open sidebar"
            >
                <PanelLeft size={20} />
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">Quiz Results</span>
            <button
                onClick={toggleShareCard}
                className="ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors active:bg-accent"
                aria-label="Share results"
            >
                <Share2 size={17} />
            </button>
        </div>
    );
}



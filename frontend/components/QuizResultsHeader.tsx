"use client";
import React from "react";
import { PanelLeft } from "lucide-react";
import { useSidebarTrigger } from "@/lib/sidebar-controls";

export default function QuizResultsHeader() {
    const openSidebar = useSidebarTrigger();
    return (
        <div className="md:hidden flex items-center px-4 py-3 border-b border-border bg-card/95 backdrop-blur-sm sticky top-0 z-10">
            <button
                onClick={openSidebar}
                className="p-2 text-foreground hover:bg-accent rounded-lg transition-colors mr-2"
            >
                <PanelLeft size={20} />
            </button>
            <span className="text-sm font-semibold">Quiz Results</span>
        </div>
    );
}



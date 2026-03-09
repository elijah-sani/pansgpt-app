"use client";
import React from "react";
import { PanelLeft } from "lucide-react";
import { useSidebarTrigger } from "@/app/(app)/layout";

export default function QuizResultsHeader() {
    const openSidebar = useSidebarTrigger();
    return (
        <div className="md:hidden flex items-center px-4 py-3 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-transparent sticky top-0 z-10">
            <button
                onClick={openSidebar}
                className="p-2 text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors mr-2"
            >
                <PanelLeft size={20} />
            </button>
            <span className="text-sm font-semibold">Quiz Results</span>
        </div>
    );
}

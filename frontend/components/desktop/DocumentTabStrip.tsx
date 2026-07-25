// [DESKTOP TABS] Horizontal document tab strip component
"use client";

import React from "react";
import { X, FileText } from "lucide-react";
import { useDocumentTabs } from "@/lib/DocumentTabsContext";

export function DocumentTabStrip() {
  const { openTabs, activeTabId, setActiveTabId, closeTab } = useDocumentTabs();

  if (!openTabs || openTabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/40 border-b border-border overflow-x-auto no-scrollbar select-none">
      {openTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 max-w-[220px] shrink-0 border ${
              isActive
                ? "bg-card text-foreground border-border shadow-xs ring-1 ring-primary/20"
                : "bg-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground border-transparent"
            }`}
            title={tab.title}
          >
            <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
            <span className="truncate flex-1">{tab.title}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="opacity-60 hover:opacity-100 p-0.5 rounded-md hover:bg-muted/80 transition-opacity"
              title="Close tab"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

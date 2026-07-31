"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import DesktopHomeContent from "@/components/desktop/DesktopHomeContent";
import { MainConversation } from "@/components/main/MainConversation";
import { useMainPageController } from "@/hooks/useMainPageController";
import { useDocumentTabs } from "@/lib/DocumentTabsContext"; // [DESKTOP TABS]

const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  ),
});

function DesktopStudyPageContent() {
  const { openTabs, activeTabId } = useDocumentTabs(); // [DESKTOP TABS]

  const isDocTabActive = Boolean(activeTabId && openTabs.some((t) => t.id === activeTabId));

  return (
    <div className="w-full h-full relative">
      {/* 1. Home / Library View - visible when no document tab is active */}
      <div className={!isDocTabActive ? "w-full h-full block" : "hidden"}>
        <DesktopHomeContent />
      </div>

      {/* 2. Open Document Tabs - Keep-alive PDFViewer instances for every open tab with CSS display toggle */}
      {openTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div 
            key={tab.id} 
            className={
              isActive 
                ? "w-full h-full relative z-10" 
                : "absolute inset-0 invisible pointer-events-none -z-10"
            }
          >
            <PDFViewer fileId={tab.drive_file_id} fileSize={tab.file_size?.toString()} />
          </div>
        );
      })}
    </div>
  );
}

export default function DesktopStudyPage() {
  return (
    <Suspense fallback={<div className="h-full bg-background" />}>
      <DesktopStudyPageContent />
    </Suspense>
  );
}

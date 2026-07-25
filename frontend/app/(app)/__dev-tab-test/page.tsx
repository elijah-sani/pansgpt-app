// [DESKTOP TABS] DEV-ONLY TEST SCAFFOLDING — Temporary test page for verifying document tabs persistence
"use client";

import React from "react";
import { DocumentTabsProvider, useDocumentTabs } from "@/lib/DocumentTabsContext";
import { DocumentTabStrip } from "@/components/desktop/DocumentTabStrip";
import { FileText, Plus, RefreshCw } from "lucide-react";

function TabTestController() {
  const { openTabs, activeTabId, openTab, closeTab, setActiveTabId, isLoadingPersistedTabs } = useDocumentTabs();

  const sampleDocs = [
    {
      id: "doc-pharm-101",
      title: "PHA 401 — General Pharmacology Notes",
      drive_file_id: "drive-pha-401-file-id",
      course_code: "PHA 401",
      lecturer_name: "Dr. Ojonugwa",
      topic: "Pharmacokinetics & Dynamics",
    },
    {
      id: "doc-chem-202",
      title: "PCH 402 — Medicinal Chemistry Lecture",
      drive_file_id: "drive-pch-402-file-id",
      course_code: "PCH 402",
      lecturer_name: "Prof. Elijah",
      topic: "Structure Activity Relationships",
    },
    {
      id: "doc-cog-303",
      title: "PCG 403 — Pharmacognosy & Herbal Drugs",
      drive_file_id: "drive-pcg-403-file-id",
      course_code: "PCG 403",
      lecturer_name: "Dr. Sani",
      topic: "Alkaloid Extraction & Assay",
    },
  ];

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col p-6 space-y-6">
      <div className="border border-amber-500/40 bg-amber-500/10 rounded-xl p-4 text-amber-200 text-xs">
        ⚠️ <strong>DEV-ONLY SCAFFOLDING PAGE</strong> (`/__dev-tab-test`): This page is created strictly for verifying
        DocumentTabsContext, DocumentTabStrip, and Electron IPC persistence (`open-tabs.json`).
      </div>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Document Tabs System — Dev Test Page
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Status: {isLoadingPersistedTabs ? "Loading persisted tabs..." : `${openTabs.length} tabs open`}
          </p>
        </div>
      </header>

      {/* Tab Strip UI */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="bg-muted/30 px-3 py-1 border-b border-border text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
          Tab Strip Component
        </div>
        <DocumentTabStrip />
        <div className="p-6 text-sm">
          {activeTab ? (
            <div className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border">
              <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> {activeTab.title}
              </h2>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div><strong>Tab ID:</strong> {activeTab.id}</div>
                <div><strong>Drive File ID:</strong> {activeTab.drive_file_id}</div>
                <div><strong>Course Code:</strong> {activeTab.course_code || "N/A"}</div>
                <div><strong>Lecturer:</strong> {activeTab.lecturer_name || "N/A"}</div>
                <div><strong>Topic:</strong> {activeTab.topic || "N/A"}</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground text-xs">
              No document active. Click a button below to open a tab!
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="border border-border rounded-xl p-5 bg-card space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" /> Test Controls — Open Sample Documents
        </h3>
        <div className="flex flex-wrap gap-3">
          {sampleDocs.map((doc) => {
            const isOpen = openTabs.some((t) => t.id === doc.id);
            return (
              <button
                key={doc.id}
                onClick={() => openTab(doc)}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-2 ${
                  isOpen
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-background hover:bg-muted text-foreground border-border"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                {isOpen ? `Switch to ${doc.course_code}` : `Open ${doc.course_code}`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DevTabTestPage() {
  return (
    <DocumentTabsProvider>
      <TabTestController />
    </DocumentTabsProvider>
  );
}

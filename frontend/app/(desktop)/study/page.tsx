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
  const controller = useMainPageController();
  const { user, activeSessionId, setPendingAttachments } = controller;
  const { openTabs, activeTabId } = useDocumentTabs(); // [DESKTOP TABS]

  const studentFirstName = user?.name ? user.name.trim().split(/\s+/)[0] || 'there' : 'there';
  const isDocTabActive = Boolean(activeTabId && openTabs.some((t) => t.id === activeTabId));

  return (
    <div className="w-full h-full relative">
      {activeSessionId ? (
        <MainConversation
          activeSessionId={controller.activeSessionId}
          chatEndRef={controller.chatEndRef}
          chatError={controller.chatError}
          chatScrollRef={controller.chatScrollRef}
          editDraft={controller.editDraft}
          editingMessageId={controller.editingMessageId}
          expandedMessages={controller.expandedMessages}
          fileInputRef={controller.fileInputRef}
          handleEditMessage={controller.handleEditMessage}
          handleFileUpload={controller.handleFileUpload}
          handleLoadOlderMessages={controller.handleLoadOlderMessages}
          handlePaste={controller.handlePaste}
          handleRegenerate={controller.handleRegenerate}
          handleRetryFailure={controller.handleRetryFailure}
          onScrollStateChange={controller.handleScrollStateChange}
          handleSendMessage={controller.handleSendMessage}
          handleStopGeneration={controller.handleStopGeneration}
          handleVoiceToggle={controller.handleVoiceToggle}
          hasMessages={controller.hasMessages}
          hasOlderMessages={controller.hasOlderMessages}
          inputMessage={controller.inputMessage}
          isError={controller.isError}
          isListening={controller.isListening}
          isLoading={controller.isLoading}
          isLoadingChat={controller.isLoadingChat}
          isLoadingOlder={controller.isLoadingOlder}
          isProcessing={controller.isProcessing}
          isStarting={controller.isStarting}
          isWebSearchEnabled={controller.isWebSearchEnabled}
          maxImages={controller.maxImages}
          messages={controller.messages}
          onDropImage={(base64: string) => setPendingAttachments((previous) => [...previous, base64])}
          pendingAttachments={controller.pendingAttachments}
          removeAttachment={controller.removeAttachment}
          selectedImageSetter={controller.setSelectedImage}
          setEditDraft={controller.setEditDraft}
          setEditingMessageId={controller.setEditingMessageId}
          setInputMessage={controller.setInputMessage}
          setWebSearchEnabled={controller.setWebSearchEnabled}
          textareaRef={controller.textareaRef}
          toggleExpand={controller.toggleExpand}
          volume={controller.volume}
          webSearchAvailable={controller.webSearchAvailable}
          webSearchUsage={controller.webSearchUsage}
          queuedMessageCount={controller.queuedMessageCount}
          thinkingMode={controller.thinkingMode}
          onThinkingModeChange={controller.setThinkingMode}
          thinkingText={controller.thinkingText}
          isThinking={controller.isThinking}
          studentFirstName={studentFirstName}
        />
      ) : (
        <div className="w-full h-full relative">
          {/* 1. Home / Library View - visible when no document tab is active */}
          <div className={!isDocTabActive ? "w-full h-full block" : "hidden"}>
            <DesktopHomeContent />
          </div>

          {/* 2. Open Document Tabs - Keep-alive PDFViewer instances for every open tab with CSS display toggle */}
          {openTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div key={tab.id} className={isActive ? "w-full h-full block" : "hidden"}>
                <PDFViewer fileId={tab.drive_file_id} fileSize={tab.file_size?.toString()} />
              </div>
            );
          })}
        </div>
      )}
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

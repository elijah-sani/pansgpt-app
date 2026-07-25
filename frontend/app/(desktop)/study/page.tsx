// [DESKTOP UI]
"use client";

import React from "react";
import DesktopHomeContent from "@/components/desktop/DesktopHomeContent";
import { DesktopMainConversation } from "@/components/desktop/DesktopMainConversation";
import { useMainPageController } from "@/hooks/useMainPageController";

export default function DesktopStudyPage() {
  const controller = useMainPageController();
  const { user, activeSessionId, setPendingAttachments } = controller;

  const studentFirstName = user?.name ? user.name.trim().split(/\s+/)[0] || 'there' : 'there';

  return (
    <div className="w-full h-full">
      {activeSessionId ? (
        <DesktopMainConversation
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
        <DesktopHomeContent />
      )}
    </div>
  );
}

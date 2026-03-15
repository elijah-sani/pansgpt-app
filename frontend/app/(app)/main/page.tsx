'use client';

import PersonalInformationModal from '@/components/PersonalInformationModal';
import QuizPerformanceModal from '@/components/QuizPerformanceModal';
import WeeklyTimetableModal from '@/components/WeeklyTimetableModal';
import WelcomeModal from '@/components/WelcomeModal';
import ImageLightbox from '@/components/shared/ImageLightbox';
import { MainConversation } from '@/components/main/MainConversation';
import { MainHeader } from '@/components/main/MainHeader';
import { MainProfileSidebar } from '@/components/main/MainProfileSidebar';
import { useSidebarTrigger } from '@/app/(app)/layout';
import { useMainPageController } from '@/hooks/useMainPageController';

export default function MainPage() {
  const openSidebar = useSidebarTrigger();
  const {
    activeSessionId,
    authLoading,
    chatEndRef,
    chatError,
    chatScrollRef,
    editDraft,
    editingMessageId,
    expandedMessages,
    fileInputRef,
    handleEditMessage,
    handleFileUpload,
    handleLoadOlderMessages,
    handleNewChat,
    handlePaste,
    handleRegenerate,
    handleRetryFailure,
    handleScrollStateChange,
    handleSendMessage,
    handleStopGeneration,
    handleVoiceToggle,
    hasMessages,
    hasOlderMessages,
    inputMessage,
    isAdmin,
    isError,
    isListening,
    isLoading,
    isLoadingChat,
    isLoadingOlder,
    isPersonalInfoOpen,
    isProcessing,
    isProfileOpen,
    isQuizPerformanceOpen,
    isStarting,
    isWebSearchEnabled,
    isWeeklyTimetableOpen,
    maxImages,
    messages,
    pendingAttachments,
    removeAttachment,
    selectedImage,
    sessions,
    setEditDraft,
    setEditingMessageId,
    setInputMessage,
    setIsPersonalInfoOpen,
    setIsProfileOpen,
    setIsQuizPerformanceOpen,
    setIsWeeklyTimetableOpen,
    setPendingAttachments,
    setSelectedImage,
    setShowWelcomeModal,
    setWebSearchEnabled,
    showWelcomeModal,
    textareaRef,
    toggleExpand,
    toggleProfile,
    updateUserProfile,
    user,
    volume,
    webSearchAvailable,
    webSearchUsage,
  } = useMainPageController();

  if (authLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin border-primary" />
          <p className="text-lg text-primary font-medium">Loading PansGPT...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="h-full min-h-0 flex overflow-hidden bg-background text-foreground">
      <div className="flex-1 w-full min-w-0 min-h-0 relative flex flex-col bg-background">
        <MainHeader
          activeSessionId={activeSessionId}
          isProfileOpen={isProfileOpen}
          onNewChat={handleNewChat}
          onOpenProfile={toggleProfile}
          onOpenSidebar={openSidebar}
          sessions={sessions}
          user={user}
        />
        <MainConversation
          activeSessionId={activeSessionId}
          chatEndRef={chatEndRef}
          chatError={chatError}
          chatScrollRef={chatScrollRef}
          editDraft={editDraft}
          editingMessageId={editingMessageId}
          expandedMessages={expandedMessages}
          fileInputRef={fileInputRef}
          handleEditMessage={handleEditMessage}
          handleFileUpload={handleFileUpload}
          handleLoadOlderMessages={handleLoadOlderMessages}
          handlePaste={handlePaste}
          handleRegenerate={handleRegenerate}
          handleRetryFailure={handleRetryFailure}
          onScrollStateChange={handleScrollStateChange}
          handleSendMessage={handleSendMessage}
          handleStopGeneration={handleStopGeneration}
          handleVoiceToggle={handleVoiceToggle}
          hasMessages={hasMessages}
          hasOlderMessages={hasOlderMessages}
          inputMessage={inputMessage}
          isError={isError}
          isListening={isListening}
          isLoading={isLoading}
          isLoadingChat={isLoadingChat}
          isLoadingOlder={isLoadingOlder}
          isProcessing={isProcessing}
          isStarting={isStarting}
          isWebSearchEnabled={isWebSearchEnabled}
          maxImages={maxImages}
          messages={messages}
          onDropImage={(base64) => setPendingAttachments((previous) => [...previous, base64])}
          pendingAttachments={pendingAttachments}
          removeAttachment={removeAttachment}
          selectedImageSetter={setSelectedImage}
          setEditDraft={setEditDraft}
          setEditingMessageId={setEditingMessageId}
          setInputMessage={setInputMessage}
          setWebSearchEnabled={setWebSearchEnabled}
          textareaRef={textareaRef}
          toggleExpand={toggleExpand}
          volume={volume}
          webSearchAvailable={webSearchAvailable}
          webSearchUsage={webSearchUsage}
        />
      </div>

      <MainProfileSidebar
        isAdmin={isAdmin}
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onOpenPersonalInfo={() => setIsPersonalInfoOpen(true)}
        onOpenQuizPerformance={() => setIsQuizPerformanceOpen(true)}
        onOpenTimetable={() => setIsWeeklyTimetableOpen(true)}
        user={user}
      />

      <ImageLightbox image={selectedImage} onClose={() => setSelectedImage(null)} />

      <WeeklyTimetableModal
        isOpen={isWeeklyTimetableOpen}
        onClose={() => setIsWeeklyTimetableOpen(false)}
      />
      <PersonalInformationModal
        isOpen={isPersonalInfoOpen}
        onClose={() => setIsPersonalInfoOpen(false)}
        user={user}
        onAvatarChange={(url) => {
          updateUserProfile({ avatarUrl: url });
        }}
        onSave={(data) => {
          updateUserProfile({
            name: data.name,
            level: data.level,
            university: data.university,
            avatarUrl: (data as { avatarUrl?: string }).avatarUrl,
          });
        }}
      />
      <QuizPerformanceModal
        isOpen={isQuizPerformanceOpen}
        onClose={() => setIsQuizPerformanceOpen(false)}
      />
      <WelcomeModal
        isOpen={showWelcomeModal}
        firstName={user.name.split(' ')[0] || 'there'}
        onClose={() => setShowWelcomeModal(false)}
      />
    </div>
  );
}

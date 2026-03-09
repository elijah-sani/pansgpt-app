'use client';

import React, { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Globe, ImageIcon, Loader2, Mic, Paperclip, Send, Square, X } from 'lucide-react';
import { InlineWaveform } from '@/components/InlineWaveform';

type ChatInputProps = {
  pendingAttachments: string[];
  maxImages: number;
  inputMessage: string;
  isListening: boolean;
  isStarting: boolean;
  isProcessing: boolean;
  isLoading: boolean;
  isWebSearchEnabled: boolean;
  webSearchAvailable?: boolean;
  webSearchUsage?: { used: number; limit: number; remaining: number } | null;
  volume: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onInputMessageChange: (value: string) => void;
  onRemoveAttachment: (index: number) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onToggleWebSearch: () => void;
  onVoiceToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onStopGeneration: () => void;
  onSendMessage: () => void;
  onDropImage: (base64: string) => void;
};

export default function ChatInput({
  pendingAttachments,
  maxImages,
  inputMessage,
  isListening,
  isStarting,
  isProcessing,
  isLoading,
  isWebSearchEnabled,
  webSearchAvailable,
  webSearchUsage,
  volume,
  textareaRef,
  fileInputRef,
  onInputMessageChange,
  onRemoveAttachment,
  onFileUpload,
  onPaste,
  onToggleWebSearch,
  onVoiceToggle,
  onStopGeneration,
  onSendMessage,
  onDropImage,
}: ChatInputProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);
  const isWebSearchQuotaExhausted = (webSearchUsage?.remaining ?? 1) <= 0;

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounter.current += 1;
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);

    const newSelectedFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    const remainingSlots = Math.max(0, maxImages - pendingAttachments.length);
    if (newSelectedFiles.length > remainingSlots) {
      alert('You can only attach up to 4 images per message.');
    }

    newSelectedFiles.slice(0, remainingSlots).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = (reader.result as string).split(',')[1];
        onDropImage(result);
      };
      reader.readAsDataURL(file);
    });
  }, [maxImages, onDropImage, pendingAttachments.length]);

  return (
    <div
      className="relative w-full max-w-3xl mx-auto px-4 pb-6"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {pendingAttachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
          {pendingAttachments.map((att, idx) => (
            <div key={idx} className="relative group flex-shrink-0">
              <img
                src={`data:image/png;base64,${att}`}
                alt={`Attachment ${idx + 1}`}
                className="h-20 w-20 object-cover rounded-xl border border-border shadow-lg bg-card"
              />
              <button
                onClick={() => onRemoveAttachment(idx)}
                className="absolute top-1 right-1 bg-destructive/90 text-destructive-foreground rounded-full p-1 shadow-sm hover:bg-destructive transition-colors z-10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative flex flex-col bg-card border border-border rounded-2xl p-3 shadow-lg">
        {isListening ? (
          <div className="w-full flex items-center justify-center py-3 px-4">
            <InlineWaveform volume={volume} />
          </div>
        ) : isProcessing ? (
          <div className="flex items-center gap-2 py-3 px-2 text-muted-foreground animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Transcribing...</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={inputMessage}
            onChange={(e) => onInputMessageChange(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSendMessage();
              }
            }}
            className="w-full bg-transparent text-foreground placeholder-muted-foreground resize-none outline-none min-h-[44px] max-h-[200px] py-3 px-2"
            placeholder="Ask anything..."
            rows={1}
            autoFocus
          />
        )}

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            {!isListening && !isProcessing && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pendingAttachments.length >= maxImages}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  title="Attach image"
                >
                  <Paperclip size={20} />
                </button>
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={onFileUpload}
                  disabled={pendingAttachments.length >= maxImages}
                />
              </>
            )}
            {!isListening && !isProcessing && webSearchAvailable !== false && (
              <div className="relative">
                <button
                  type="button"
                  onClick={onToggleWebSearch}
                  disabled={isWebSearchQuotaExhausted}
                  title={
                    isWebSearchQuotaExhausted
                      ? 'No searches left today. Resets at midnight.'
                      : isWebSearchEnabled
                        ? webSearchUsage
                          ? `You have ${webSearchUsage.remaining} remaining web searches`
                          : 'Web Search'
                        : 'Web Search'
                  }
                  className={`flex items-center gap-1.5 rounded-full transition-all duration-300 border ${
                    isWebSearchQuotaExhausted
                      ? 'bg-muted text-muted-foreground border-border px-3 py-1.5 opacity-60 cursor-not-allowed'
                      : isWebSearchEnabled
                        ? 'bg-primary/10 text-primary border-primary/30 px-3 py-1.5'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent border-border p-2'
                  }`}
                >
                  <Globe size={16} className="shrink-0" />
                  {(isWebSearchEnabled || isWebSearchQuotaExhausted) && webSearchUsage && (
                    <span className="text-xs font-semibold whitespace-nowrap">
                      {webSearchUsage.remaining}/{webSearchUsage.limit}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <button
                type="button"
                onClick={onStopGeneration}
                className="p-2.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-all shadow-md flex items-center justify-center aspect-square animate-in zoom-in duration-200"
                title="Stop generation"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : isProcessing ? (
              <div className="w-10 h-10" />
            ) : isListening ? (
              <button
                type="button"
                onClick={onVoiceToggle}
                className="p-2.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-all shadow-md flex items-center justify-center aspect-square animate-in zoom-in duration-200"
                title="Stop recording"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : !inputMessage.trim() && pendingAttachments.length === 0 ? (
              <button
                type="button"
                onClick={onVoiceToggle}
                disabled={isStarting}
                className={`p-2.5 rounded-full transition-colors text-muted-foreground ${isStarting ? 'opacity-50 cursor-not-allowed' : 'hover:text-foreground hover:bg-accent'
                  }`}
                title="Voice input"
              >
                <Mic className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSendMessage}
                className="p-2.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-all shadow-md flex items-center justify-center aspect-square animate-in zoom-in duration-200"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary"
          >
            <div className="flex flex-col items-center gap-2 text-primary">
              <ImageIcon className="w-7 h-7" />
              <p className="text-sm font-semibold">Drop diagram to analyze</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-center mt-4">
        <p className="text-xs text-muted-foreground">PansGPT can make mistakes. Verify important information.</p>
      </div>
    </div>
  );
}

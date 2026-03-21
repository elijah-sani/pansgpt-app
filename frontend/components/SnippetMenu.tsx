import React from 'react';
import { Sparkles, MessageSquarePlus, Loader2, BookmarkPlus } from 'lucide-react';

interface SnippetMenuProps {
    imageBlob: Blob | string;
    isLoading?: boolean;
    isSaving?: boolean;
    onClose: () => void;
    onSend: (data: { text: string; attachments: string[]; systemInstruction?: string }) => void;
    onAddToInput: (image: string) => void;
    onSaveNote: (image: string) => void;
}

const SnippetMenu: React.FC<SnippetMenuProps> = ({
    imageBlob,
    isLoading,
    isSaving,
    onClose,
    onSend,
    onAddToInput,
    onSaveNote
}) => {

    const handleAskAI = () => {
        const attachment = typeof imageBlob === 'string' ? imageBlob : '';
        if (!attachment) return;

        const userVisibleText = "Can you explain this snippet for me?";
        const hiddenPrompt = `
      [SYSTEM: PHARMACY_VISUAL_ANALYSIS]
      Analyze the attached image.
      Goal: Provide a smooth, academic explanation of what is shown.
      - Do NOT use prefixes like "Identify:", "Context:", or numbered lists for metadata.
      - Weave identification and clinical context into a single, flowing explanation.
      - If it is a diagram, trace the pathway naturally.
      - Conclude with why this is clinically relevant.
      - Keep it concise (under 2 paragraphs).
    `;

        onSend({
            text: userVisibleText,
            attachments: [attachment],
            systemInstruction: hiddenPrompt
        });
        onClose();
    };

    const handleAddToChat = () => {
        const attachment = typeof imageBlob === 'string' ? imageBlob : '';
        if (attachment) {
            onAddToInput(attachment);
        }
        onClose();
    };

    return (
        <div
            className="flex items-center gap-1 p-1.5 bg-zinc-900 border border-zinc-700/50 rounded-full shadow-2xl animate-in fade-in zoom-in duration-200 backdrop-blur-md"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{ pointerEvents: 'auto' }}
        >
            {/* ASK AI */}
            <button
                onClick={handleAskAI}
                disabled={isLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all group active:scale-95 ${isLoading ? 'opacity-50 cursor-not-allowed bg-zinc-800' : 'hover:bg-zinc-800'}`}
            >
                {isLoading ? (
                    <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                ) : (
                    <Sparkles className="w-4 h-4 text-[#53d22d] transition-colors" />
                )}
                <span className={`text-sm font-medium whitespace-nowrap ${isLoading ? 'text-zinc-400' : 'text-zinc-100 group-hover:text-white'}`}>
                    {isLoading ? 'Thinking...' : 'Ask AI'}
                </span>
            </button>

            <div className="w-px h-5 bg-zinc-700 mx-1" />

            {/* ADD TO CHAT */}
            <button
                onClick={handleAddToChat}
                className="p-2 aspect-square rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all relative group flex items-center justify-center active:scale-95"
                title="Add to chat input"
            >
                <MessageSquarePlus className="w-4 h-4" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-xs text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg border border-zinc-800">
                    Add to chat
                </span>
            </button>

            <div className="w-px h-5 bg-zinc-700 mx-1" />

            {/* ADD TO NOTES */}
            <button
                onClick={() => {
                    const attachment = typeof imageBlob === 'string' ? imageBlob : '';
                    if (attachment) onSaveNote(attachment);
                    onClose();
                }}
                disabled={isSaving}
                className="relative group p-2 aspect-square rounded-full text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-all flex items-center justify-center active:scale-95 disabled:opacity-60"
                title="Add to notes"
            >
                {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <BookmarkPlus className="w-4 h-4" />
                )}
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-xs text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg border border-zinc-800">
                    Add to notes
                </span>
            </button>
        </div>
    );
};

export default SnippetMenu;

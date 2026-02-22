import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Trash2, Loader2, MoreVertical } from 'lucide-react';
import { ChatSession } from '../hooks/useChatHistory';

interface ChatSessionItemProps {
    chat: ChatSession;
    onLoadSession: (id: string) => void;
    setIsHistoryOpen: (open: boolean) => void;
    onDeleteClick?: () => void;
    isDeleting?: boolean;
}

export default function ChatSessionItem({
    chat,
    onLoadSession,
    setIsHistoryOpen,
    onDeleteClick,
    isDeleting
}: ChatSessionItemProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                isMenuOpen &&
                menuRef.current &&
                !menuRef.current.contains(event.target as Node) &&
                menuButtonRef.current &&
                !menuButtonRef.current.contains(event.target as Node)
            ) {
                setIsMenuOpen(false);
            }
        };

        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen]);

    return (
        <div
            onClick={() => {
                onLoadSession(chat.id);
                setIsHistoryOpen(false);
            }}
            className="p-3 hover:bg-muted/50 rounded-lg cursor-pointer text-sm font-medium transition-colors flex items-center gap-2 group w-full justify-between relative"
        >
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <MessageSquare className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                <span className="truncate flex-1 min-w-0 text-left">{chat.title}</span>
            </div>

            <div className="flex items-center gap-1 shrink-0 relative">
                {onDeleteClick && (
                    isDeleting ? (
                        <div className="p-1">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            <button
                                ref={menuButtonRef}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsMenuOpen(!isMenuOpen);
                                }}
                                className={`text-gray-400 p-1 transition-opacity hover:text-foreground ${isMenuOpen ? 'opacity-100 text-foreground' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}
                                title="Chat Options"
                            >
                                <MoreVertical className="w-4 h-4" />
                            </button>

                            {isMenuOpen && (
                                <div
                                    ref={menuRef}
                                    className="absolute right-0 top-full mt-1 w-36 bg-background text-foreground rounded-md shadow-lg border border-border z-[100] overflow-hidden"
                                >
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsMenuOpen(false);
                                            onDeleteClick();
                                        }}
                                        className="w-full flex items-center px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                    </button>
                                </div>
                            )}
                        </>
                    )
                )}
            </div>
        </div>
    );
}

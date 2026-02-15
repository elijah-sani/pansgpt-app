'use client';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Document, Page, pdfjs } from 'react-pdf';
import { X, Sparkles, BookOpen, Lightbulb, Brain, Loader2, Send, FileText, MessageSquare, ZoomIn, ZoomOut, Scissors, Image as ImageIcon, Copy, ListChecks, MoreHorizontal, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useSimulatedProgress } from '../hooks/useSimulatedProgress';
import { LoadingState } from './LoadingState';
import { cropImageFromCanvas } from '../lib/pdf-utils';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import SnippetMenu from './SnippetMenu';
import ChatInterface from './ChatInterface';
import { useChatHistory } from '../hooks/useChatHistory';
import { api } from '../lib/api';

// Critical Fix: Use CDN for worker to prevent Next.js bundling issues
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
// Silence noisy worker warnings (like TT font parsing) by forcing verbosity to ERRORS (0)
(pdfjs.GlobalWorkerOptions as any).verbosity = 0;

interface PDFViewerProps {
    fileId: string;
    fileSize?: string;
}

interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
    id?: string;
    session_id?: string;
    imageBase64?: string; // For vision messages: thumbnail of snipped area
}

interface SnipSelection {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    pageElement: HTMLElement; // The page container where the snip was drawn
}

export default function PDFViewer({ fileId, fileSize }: PDFViewerProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const [numPages, setNumPages] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number | null>(null);

    // Responsive State
    const [activeTab, setActiveTab] = useState<'document' | 'chat'>('document');
    const [containerWidth, setContainerWidth] = useState<number>(600); // Default
    const [zoomLevel, setZoomLevel] = useState<number>(100);
    const [baseScale, setBaseScale] = useState<number>(1.0);
    const pdfWrapperRef = useRef<HTMLDivElement>(null);
    const [unreadMessages, setUnreadMessages] = useState(false);

    // Load saved zoom on mount
    useEffect(() => {
        if (isMounted) {
            const saved = localStorage.getItem('pansgpt-pdf-zoom');
            if (saved) setZoomLevel(parseInt(saved, 10));
        }
    }, [isMounted]);

    // Persist zoomLevel to localStorage
    useEffect(() => {
        if (isMounted) {
            localStorage.setItem('pansgpt-pdf-zoom', zoomLevel.toString());
        }
    }, [zoomLevel, isMounted]);

    // Responsive baseScale logic
    useEffect(() => {
        const updateScale = () => {
            const width = window.innerWidth;
            if (width < 640) {
                // Mobile: Fit to screen (assuming standard PDF width is ~600px)
                setBaseScale((width - 32) / 600);
            } else if (width < 1024) {
                // Tablet
                setBaseScale(1.2);
            } else {
                // Desktop: Make the default massive (visually 200%)
                setBaseScale(2.0);
            }
        };

        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, []);

    // AI & Selection State
    const [selectedText, setSelectedText] = useState<string | null>(null);
    const [selectionMenu, setSelectionMenu] = useState<{
        visible: boolean;
        x: number;
        y: number;
        text: string;
    } | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Snipping State
    const [isSnippingMode, setIsSnippingMode] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [snipRect, setSnipRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [snipStart, setSnipStart] = useState<{ x: number; y: number } | null>(null);
    const [snipPopup, setSnipPopup] = useState<{ x: number; y: number; imageBase64: string } | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const snipOverlayRef = useRef<HTMLDivElement>(null);

    // Chat State
    const [chatHistory, setChatHistory] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [inputMessage, setInputMessage] = useState("");

    const [pendingAttachments, setPendingAttachments] = useState<string[]>([]); // Array of base64 images
    const chatEndRef = useRef<HTMLDivElement>(null);
    const selectionTimer = useRef<NodeJS.Timeout | null>(null);

    // --- SESSION MANAGEMENT ---
    const { sessions, isLoadingHistory, fetchHistory, loadSession, createSession, clearHistory, deleteSession, deletingId } = useChatHistory();
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

    // Load history on mount
    // Load history on mount (scoped to file)
    useEffect(() => {
        if (fileId) fetchHistory(fileId);
    }, [fileId, fetchHistory]);

    // --- CACHING & DOWNLOAD LOGIC ---
    const [pdfContent, setPdfContent] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    // Use our new hook for smooth progress
    const displayProgress = useSimulatedProgress(downloadProgress);

    useEffect(() => {
        // if (!process.env.NEXT_PUBLIC_API_URL || !process.env.NEXT_PUBLIC_API_KEY) return;
        // Centralized API client handles valid config checks internally (mostly)

        const CACHE_NAME = 'pans-library-v1';
        // Use relative path for api handling
        const streamEndpoint = `/documents/${fileId}/stream${fileSize ? `?size=${fileSize}` : ''}`;
        // Full URL for Cache API (undici/fetch native cache specific)
        const cacheUrl = `${process.env.NEXT_PUBLIC_API_URL}${streamEndpoint}`;

        let active = true;

        const loadPDF = async () => {
            try {
                // 1. Check Cache (Safari on iOS disables Cache API in insecure contexts)
                const canUseCache = typeof window !== 'undefined' && 'caches' in window;
                let cache = null;

                if (canUseCache) {
                    try {
                        cache = await caches.open(CACHE_NAME);
                        const cachedResponse = await cache.match(cacheUrl);

                        if (cachedResponse) {
                            console.log("⚡ Cache Hit! Loading instantly.");
                            const blob = await cachedResponse.blob();
                            if (active) {
                                setPdfContent(URL.createObjectURL(blob));
                                setDownloadProgress(100); // Instant 100%
                            }
                            return;
                        }
                    } catch (cacheErr) {
                        console.warn("⚠️ Cache API check failed:", cacheErr);
                    }
                } else {
                    console.log("🔒 Cache API not available (likely insecure context). Skipping cache lookup.");
                }

                // 2. Network Fetch (Cache Miss or No Cache) - Use API Client for Auth
                console.log("🌐 Fetching from network...");
                // Note: api.fetch returns the response, which we can clone/stream
                const response = await api.fetch(streamEndpoint);

                if (!response.ok) throw new Error(`Stream Error: ${response.status}`);
                if (!response.body) throw new Error("ReadableStream not supported");

                // 3. Stream Cloning (Split stream)
                // Branch A: Clone for Cache (Background) - ONLY if cache is available
                if (canUseCache && cache) {
                    const cacheClone = response.clone();
                    cache.put(cacheUrl, cacheClone).catch(e => console.error("Cache Save Failed:", e));
                }

                // Branch B: Reader Loop (UI Progress)
                const reader = response.body.getReader();
                const contentLength = +(response.headers.get('Content-Length') || fileSize || 0);

                let receivedLength = 0;
                const chunks = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    chunks.push(value);
                    receivedLength += value.length;

                    // Update Progress
                    if (contentLength && active) {
                        setDownloadProgress((receivedLength / contentLength) * 100);
                    }
                }

                if (active) {
                    const blob = new Blob(chunks, { type: 'application/pdf' });
                    setPdfContent(URL.createObjectURL(blob));
                    setDownloadProgress(100); // Finish
                }

            } catch (err) {
                console.error("PDF Load Error:", err);
                if (active) setError("Failed to load document.");
            }
        };

        loadPDF();

        return () => { active = false; };
    }, [fileId, fileSize]);

    // ... (rest of code)

    // Fetch Metadata
    const [meta, setMeta] = useState<{ topic?: string; lecturer?: string; filename: string }>({ filename: "Document" });
    const [showMoreMenu, setShowMoreMenu] = useState(false);

    useEffect(() => {
        // if (!process.env.NEXT_PUBLIC_API_URL || !process.env.NEXT_PUBLIC_API_KEY) return;

        api.fetch(`/documents/${fileId}`)
            .then(res => res.json())
            .then(data => {
                setMeta({
                    filename: data.name ? data.name.replace('.pdf', '') : "Document",
                    topic: data.topic,
                    lecturer: data.lecturer_name
                });
            })
            .catch(err => console.error("Metadata Fetch Error:", err));
    }, [fileId]);

    // --- TEXT SELECTION LISTENER (RESTORED) ---
    useEffect(() => {
        const handleSelectionChange = () => {
            if (selectionTimer.current) clearTimeout(selectionTimer.current);

            selectionTimer.current = setTimeout(() => {
                const selection = window.getSelection();

                // Clear menu if no selection or empty
                if (!selection || selection.isCollapsed || !selection.toString().trim()) {
                    setSelectionMenu(null);
                    setShowMoreMenu(false);
                    return;
                }

                const text = selection.toString().trim();
                // Basic validation: ignore if too short
                if (text.length < 2) {
                    setSelectionMenu(null);
                    return;
                }

                // Check if selection is within the PDF container
                if (pdfWrapperRef.current && pdfWrapperRef.current.contains(selection.anchorNode)) {
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();

                    // Show menu above the selection
                    setSelectionMenu({
                        visible: true,
                        x: rect.left + rect.width / 2,
                        y: rect.top - 10, // 10px above
                        text: text
                    });
                } else {
                    // Clicked outside PDF (e.g. Chat or Header) -> Hide
                    setSelectionMenu(null);
                }
            }, 300); // Debounce 300ms
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
            if (selectionTimer.current) clearTimeout(selectionTimer.current);
        };
    }, []);



    // Retry Helper (Updated to use relative endpoint logic if needed, but we can simplify)
    // Actually, let's just use api.post for chat and let it fail naturally or add simple retry if critical.
    // For now, removing complex retry to rely on api.ts robustness and simple error handling.

    const handleAIRequest = async (mode: string) => {
        const textToProcess = selectionMenu?.text || selectedText;
        if (!textToProcess) return;

        // Clear browser selection to prevent menu from re-appearing on mouseup
        window.getSelection()?.removeAllRanges();

        setSelectedText(textToProcess);

        // Mobile: Switch to Chat tab
        if (window.innerWidth < 768) {
            setActiveTab('chat');
        } else {
            setIsSidebarOpen(true);
        }

        setSelectionMenu(null);
        setShowMoreMenu(false);

        setSelectionMenu(null);

        // Construct Prompt & System Instruction
        let prompt = "";
        let sysPrompt: string | undefined = undefined;

        switch (mode) {
            case "explain":
                prompt = `Explain this concept: "${textToProcess}"`;
                sysPrompt = "You are a helpful tutor. Explain the concept clearly and concisely.";
                break;
            case "define":
                prompt = `Give a short, simple definition for this term: "${textToProcess}"`;
                sysPrompt = "Provide a precise and easy-to-understand definition.";
                break;
            case "example":
                prompt = `Give me a practical example to help understand this: "${textToProcess}"`;
                sysPrompt = "You are a helpful tutor. Provide a clear, real-world example.";
                break;
            case "summarize":
                prompt = `Summarize this text in short, simple bullet points:\n\n"${textToProcess}"`;
                sysPrompt = "Capture the key points in a concise bulleted list.";
                break;
            case "answer":
                prompt = `Answer this question based on the context: "${textToProcess}"`;
                sysPrompt = "Provide a direct and accurate answer to the question.";
                break;
            case "memory":
                prompt = `Create a mnemonic or memory aid to help me remember this: "${textToProcess}"`;
                sysPrompt = "You are a study assistant. Create a catchy mnemonic or memory trick.";
                break;
            default:
                prompt = textToProcess;
        }

        // Send via centralized handler
        await sendMessage(prompt, [], sysPrompt);
    };

    const handleCopyText = () => {
        const text = selectionMenu?.text || selectedText;
        if (text) {
            navigator.clipboard.writeText(text);
            setSelectionMenu(null);
            window.getSelection()?.removeAllRanges();
            setShowMoreMenu(false);
            // Optional: Show toast
        }
    };

    // ... (snipping handlers)

    // --- SNIPPING HANDLERS ---
    // Store the screen-space start for accurate cropping
    const snipScreenStart = useRef<{ x: number; y: number } | null>(null);

    const handleSnipMouseDown = (e: React.MouseEvent) => {
        if (!snipOverlayRef.current) return;
        const rect = snipOverlayRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setIsDrawing(true);
        setSnipStart({ x, y });
        snipScreenStart.current = { x: e.clientX, y: e.clientY };
        setSnipRect({ x, y, w: 0, h: 0 });
        setSnipPopup(null);
    };

    const handleSnipMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing || !snipStart || !snipOverlayRef.current) return;
        const rect = snipOverlayRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const x = Math.min(currentX, snipStart.x);
        const y = Math.min(currentY, snipStart.y);
        const w = Math.abs(currentX - snipStart.x);
        const h = Math.abs(currentY - snipStart.y);

        setSnipRect({ x, y, w, h });
    };

    const handleSnipMouseUp = async (e: React.MouseEvent) => {
        setIsDrawing(false);
        if (!snipRect || snipRect.w < 10 || snipRect.h < 10) {
            setSnipRect(null);
            return;
        }

        if (pdfWrapperRef.current && snipRect && snipScreenStart.current) {
            // Use screen coordinates directly from mouse events for accuracy
            const startScreenX = snipScreenStart.current.x;
            const startScreenY = snipScreenStart.current.y;
            const endScreenX = e.clientX;
            const endScreenY = e.clientY;

            const screenRect = {
                left: Math.min(startScreenX, endScreenX),
                top: Math.min(startScreenY, endScreenY),
                width: Math.abs(endScreenX - startScreenX),
                height: Math.abs(endScreenY - startScreenY)
            };

            const imageBase64 = cropImageFromCanvas(pdfWrapperRef.current, screenRect);

            if (imageBase64) {
                setSnipPopup({
                    x: snipRect.x + snipRect.w,
                    y: snipRect.y + snipRect.h,
                    imageBase64
                });
            }
        }
    };

    const sendMessage = async (text: string, attachments: string[] = [], systemInstruction?: string) => {
        // Build user message
        const newUserMsg: Message = {
            role: 'user',
            content: text,
            ...(attachments.length > 0 && { imageBase64: attachments[0] }),
        };
        const updatedHistory = [...chatHistory, newUserMsg];

        setChatHistory(updatedHistory);
        setIsLoading(true);

        try {
            // Ensure Session ID exists
            let activeSessionId = currentSessionId;
            if (!activeSessionId) {
                // Set title to "New Chat" to trigger backend AI auto-naming
                const title = "New Chat";
                // Create session with Context ID (fileId)
                const newSession = await createSession(title, fileId);

                if (!newSession) {
                    console.error("Failed to create session");
                    setIsLoading(false);
                    return;
                }

                activeSessionId = newSession.id;
                setCurrentSessionId(activeSessionId);
            }

            // USE API.POST HERE
            const response = await api.post('/chat', {
                text: text,
                mode: "chat",
                messages: updatedHistory,
                document_id: fileId,
                images: attachments, // Send array
                ...(attachments.length > 0 && { image_base64: attachments[0] }), // Backward compat
                ...(systemInstruction && { system_instruction: systemInstruction }),
                session_id: activeSessionId, // Persist message to session
            });

            const data = await response.json();
            const assistantMessage = data.choices[0].message;
            setChatHistory(prev => [...prev, assistantMessage]);

            // Refresh sidebar if this was the first message (new session created)
            if (!currentSessionId && activeSessionId) {
                await fetchHistory(fileId);
            }

        } catch (err) {
            console.error("Chat Error:", err);
            setChatHistory(prev => [...prev, { role: 'assistant', content: "Sorry, connection error." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendMessage = async () => {
        const hasText = inputMessage.trim().length > 0;
        const hasImages = pendingAttachments.length > 0;
        if ((!hasText && !hasImages) || isLoading) return;

        const messageText = hasText ? inputMessage.trim() : 'Explain these images.';
        const attachments = [...pendingAttachments];

        // Clear UI states before sending
        setInputMessage("");
        setPendingAttachments([]);

        await sendMessage(messageText, attachments);
    };

    // --- NEW HANDLERS FOR SNIPPET MENU ---

    const handleMenuSend = async ({ text, attachments, systemInstruction }: { text: string; attachments: string[], systemInstruction?: string }) => {
        // 1. Open Sidebar
        if (window.innerWidth < 768) setActiveTab('chat');
        else setIsSidebarOpen(true);

        // 2. Clear Snip UI
        setIsSnippingMode(false);
        setSnipRect(null);
        setSnipPopup(null);

        // 3. Send Immediately
        await sendMessage(text, attachments, systemInstruction);
    };

    const handleMenuAddToInput = (image: string) => {
        // 1. Open Sidebar
        if (window.innerWidth < 768) setActiveTab('chat');
        else setIsSidebarOpen(true);

        // 2. Clear Snip UI
        setIsSnippingMode(false);
        setSnipRect(null);
        setSnipPopup(null);

        // 3. Set Input State
        // Append if less than 3, otherwise replace
        setPendingAttachments(prev => {
            if (prev.length < 5) return [...prev, image];
            return [image];
        });
    };

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
        setError(null);
    }

    function onDocumentLoadError(err: Error) {
        console.error("PDF Load Error:", err);
        setError("Failed to load document. Check API Key or Backend connection.");
    }

    // --- SESSION HANDLERS ---

    const handleLoadSession = async (sessionId: string) => {
        try {
            // Don't trigger "Thinking" bubble. Just load data.
            const msgs = await loadSession(sessionId);
            setChatHistory(msgs as Message[]);
            setCurrentSessionId(sessionId);
            setPendingAttachments([]);
        } catch (err) {
            console.error("Failed to load session UI:", err);
            setChatHistory([]);
        }
    };

    const handleNewChat = () => {
        // Reset Logic: synchronously clear state
        setIsLoading(false);
        setChatHistory([]);
        setInputMessage('');
        setPendingAttachments([]);
        setCurrentSessionId(null);
    };

    const handleClearHistory = async () => {
        if (window.confirm("Are you sure you want to delete all chat history? This cannot be undone.")) {
            await clearHistory();
            setChatHistory([]);
            setCurrentSessionId(null);
            setPendingAttachments([]);
        }
    };

    // --- RENDER HELPERS ---

    const renderChatUI = (isMobile = false) => (
        <ChatInterface
            messages={chatHistory}
            isLoading={isLoading}
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            onSendMessage={handleSendMessage}
            pendingAttachments={pendingAttachments}
            setPendingAttachments={setPendingAttachments}
            isMobile={isMobile}
            onCloseSidebar={() => setIsSidebarOpen(false)}
            onNewChat={handleNewChat}

            // Session Props
            sessions={sessions}
            isLoadingHistory={isLoadingHistory}
            onLoadSession={handleLoadSession}
            onClearHistory={handleClearHistory}
            onDeleteSession={(id) => {
                deleteSession(id);
                if (currentSessionId === id) handleNewChat();
            }}
            deletingId={deletingId}
            contextId={fileId}
            onRegenerate={async () => {
                // Regenerate Logic (Backend-driven):
                if (!currentSessionId) return;

                // 1. Optimistic UI Update: Remove last assistant message and show loading
                setChatHistory(prev => {
                    if (prev.length === 0) return prev;
                    const last = prev[prev.length - 1];
                    // Check for both 'assistant' (groq) and 'ai' (supabase) roles
                    if (last.role === 'assistant' || (last.role as any) === 'ai') {
                        return prev.slice(0, -1);
                    }
                    return prev;
                });
                setIsLoading(true);

                try {
                    // 2. Call Backend Regenerate Endpoint
                    const res = await api.post(`/chat/${currentSessionId}/regenerate`, {});
                    const data = await res.json();

                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        const newMsg = data.choices[0].message;
                        setChatHistory(prev => [...prev, newMsg]);
                    }
                } catch (err) {
                    console.error("Regenerate failed:", err);
                    // Warn user
                    setChatHistory(prev => [...prev, { role: 'assistant', content: "Sorry, failed to regenerate." }]);
                } finally {
                    setIsLoading(false);
                }
            }}
        />
    );

    const InitialLoading = () => (
        <div className="flex flex-col items-center justify-center h-full w-full bg-background gap-4 animate-in fade-in duration-500">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-muted-foreground font-medium">Initializing PDF Viewer...</p>
        </div>
    );



    return (
        <div
            className="flex flex-col h-screen bg-background relative overflow-hidden font-sans"
            onContextMenu={(e) => e.preventDefault()}
            onTouchStart={() => setSelectionMenu(null)}
        >
            {!isMounted ? (
                <InitialLoading />
            ) : (
                <>


                    <div className="md:hidden fixed top-0 w-full h-14 bg-background/80 backdrop-blur-md border-b border-border z-50 flex items-center justify-around shadow-sm">
                        <button
                            onClick={() => { setActiveTab('document'); }}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'document' ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                            <FileText className="w-4 h-4" />
                            Document
                        </button>
                        <div className="flex items-center gap-2">
                            {/* Mobile Snip Button */}
                            <button
                                onClick={() => {
                                    setIsSnippingMode(!isSnippingMode);
                                    setSnipRect(null);
                                    setSnipPopup(null);
                                    if (!isSnippingMode) setActiveTab('document');
                                }}
                                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${isSnippingMode ? 'text-amber-600' : 'text-muted-foreground'}`}
                            >
                                <Scissors className="w-4 h-4" />
                                Snip
                            </button>
                            <button
                                onClick={() => { setActiveTab('chat'); setUnreadMessages(false); }}
                                className={`relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'chat' ? 'text-primary' : 'text-muted-foreground'}`}
                            >
                                <MessageSquare className="w-4 h-4" />
                                Chat
                                {unreadMessages && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                            </button>
                        </div>
                    </div>



                    {/* Desktop Header */}
                    <div className="hidden md:flex fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-30 items-center justify-between px-6 shadow-sm">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => {
                                    const course = searchParams.get('course');
                                    if (course) {
                                        router.push(`/?course=${course}`);
                                    } else {
                                        router.back();
                                    }
                                }}
                                className="p-2 hover:bg-muted/50 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                                title="Go Back"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                            </button>
                            <div className="h-6 w-px bg-border" />
                            <h1 className="text-lg font-semibold text-foreground truncate max-w-md">
                                {meta.topic ? (
                                    <span>
                                        {meta.topic}
                                        <span className="text-muted-foreground font-normal ml-2 opacity-75">
                                            • {meta.lecturer}
                                        </span>
                                    </span>
                                ) : (
                                    meta.filename
                                )}
                            </h1>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Zoom Controls */}
                            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border border-border">
                                <button
                                    onClick={() => setZoomLevel(z => Math.max(25, z - 25))}
                                    className="p-1.5 hover:bg-background rounded-md text-muted-foreground hover:text-foreground transition-all"
                                    title="Zoom Out"
                                >
                                    <ZoomOut className="w-4 h-4" />
                                </button>
                                <span className="text-xs font-medium w-12 text-center text-muted-foreground">
                                    {zoomLevel}%
                                </span>
                                <button
                                    onClick={() => setZoomLevel(z => Math.min(300, z + 25))}
                                    className="p-1.5 hover:bg-background rounded-md text-muted-foreground hover:text-foreground transition-all"
                                    title="Zoom In"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Snip Button */}
                            <button
                                onClick={() => {
                                    setIsSnippingMode(!isSnippingMode);
                                    setSnipRect(null);
                                    setSnipPopup(null);
                                }}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${isSnippingMode
                                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 shadow-lg shadow-amber-500/10'
                                    : 'bg-card hover:bg-muted/50 text-muted-foreground border-border shadow-sm'
                                    }`}
                                title={isSnippingMode ? 'Exit Snipping Mode' : 'Snip & Ask AI (Alt+Drag)'}
                            >
                                <Scissors className="w-4 h-4" />
                                <span className="hidden lg:inline">{isSnippingMode ? 'Cancel Snip' : 'Snip'}</span>
                            </button>

                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${isSidebarOpen
                                    ? 'bg-card text-primary border-primary/20 shadow-lg shadow-black/5'
                                    : 'bg-card hover:bg-muted/50 text-muted-foreground border-border shadow-sm'
                                    }`}
                            >
                                <Sparkles className="w-4 h-4" />
                                AI Assistant
                            </button>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className={`flex-1 flex pt-14 md:pt-16 h-full overflow-hidden`}>

                        {/* PDF Container */}
                        <div
                            ref={pdfWrapperRef}
                            className={`flex-1 min-w-0 overflow-auto bg-background transition-all duration-300 relative
                        ${activeTab === 'document' ? 'block' : 'hidden md:block'
                                }
                        ${isSnippingMode ? 'cursor-crosshair' : ''
                                }
                    `}
                        >
                            {/* Snipping Mode Banner */}
                            {isSnippingMode && (
                                <div className="sticky top-0 z-20 bg-[#253920] border-b border-white/10 px-4 py-3 flex items-center justify-center gap-3 text-white shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
                                    <Scissors className="w-5 h-5 text-green-400" />
                                    <span className="font-medium tracking-wide">Draw a rectangle to snip</span>
                                    <button
                                        onClick={() => { setIsSnippingMode(false); setSnipRect(null); setSnipPopup(null); }}
                                        className="ml-4 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-xs font-bold transition-all border border-white/10 uppercase tracking-wider"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                            <div className="flex justify-center p-4 md:p-8">
                                <div className="relative">
                                    {error ? (
                                        <div className="p-8 text-center text-destructive bg-destructive/10 border border-destructive/20 rounded-xl">{error}</div>
                                    ) : !pdfContent ? (
                                        <div className="flex h-[60vh] items-center justify-center w-full">
                                            <LoadingState progress={displayProgress} />
                                        </div>
                                    ) : (
                                        <Document
                                            file={pdfContent}
                                            onLoadSuccess={onDocumentLoadSuccess}
                                            onLoadError={onDocumentLoadError}
                                            loading={
                                                <div className="flex h-[60vh] items-center justify-center w-full">
                                                    <LoadingState progress={100} />
                                                </div>
                                            }
                                            className="flex flex-col items-center w-full"
                                        >
                                            {Array.from(new Array(numPages), (el, index) => (
                                                <div
                                                    key={`page_${index + 1}`}
                                                    id={`page-container-${index + 1}`}
                                                    data-page-number={index + 1}
                                                    className="mb-6 shadow-2xl rounded-sm w-full flex justify-center transition-transform duration-200"
                                                >
                                                    <Page
                                                        pageNumber={index + 1}
                                                        renderTextLayer={!isSnippingMode}
                                                        renderAnnotationLayer={false}
                                                        width={Math.min(containerWidth - 48, 800) * ((zoomLevel / 100) * baseScale)}
                                                        className="bg-card"
                                                        loading={<div className="h-[800px] w-full bg-card animate-pulse" />}
                                                        error={<div className="p-4 text-destructive text-sm">Failed to load page</div>}
                                                    />
                                                </div>
                                            ))}
                                        </Document>
                                    )}



                                    {/* Snipping Overlay */}
                                    {isSnippingMode && pdfContent && (
                                        <div
                                            ref={snipOverlayRef}
                                            className="absolute inset-0 z-10"
                                            style={{ cursor: 'crosshair' }}
                                            onMouseDown={handleSnipMouseDown}
                                            onMouseMove={handleSnipMouseMove}
                                            onMouseUp={handleSnipMouseUp}
                                        >
                                            {/* Selection Rectangle */}
                                            {snipRect && (
                                                <div
                                                    className="absolute border-2 border-amber-500 bg-amber-500/15 rounded-sm"
                                                    style={{
                                                        left: snipRect.x,
                                                        top: snipRect.y,
                                                        width: snipRect.w,
                                                        height: snipRect.h,
                                                        pointerEvents: 'none',
                                                    }}
                                                >
                                                    {/* Corner handles */}
                                                    <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />
                                                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />
                                                    <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />
                                                    <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />
                                                </div>
                                            )}

                                            {/* Snippet Action Menu */}
                                            {snipPopup && (
                                                <div
                                                    className="absolute z-20"
                                                    style={{
                                                        left: snipPopup.x + 8,
                                                        top: snipPopup.y + 12,
                                                    }}
                                                >
                                                    <SnippetMenu
                                                        imageBlob={snipPopup.imageBase64}
                                                        onClose={() => setSnipPopup(null)}
                                                        onSend={handleMenuSend}
                                                        onAddToInput={handleMenuAddToInput}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Smart Context Menu (text selection) */}
                                    {selectionMenu && selectionMenu.visible && !isSnippingMode && (
                                        <div
                                            className="context-menu-popup fixed z-50 flex flex-row items-center gap-1 bg-zinc-900 border border-zinc-700/50 p-1 rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200 backdrop-blur-md"
                                            style={{
                                                left: selectionMenu.x,
                                                top: selectionMenu.y,
                                                transform: 'translate(-50%, -100%)', // Keeps it centered above selection
                                                position: 'fixed'
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        >
                                            {/* Primary Actions (Horizontal) */}
                                            <button
                                                onClick={() => handleAIRequest('explain')}
                                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors group"
                                            >
                                                <Sparkles className="w-4 h-4 text-[#53d22d]" />
                                                <span>Explain</span>
                                            </button>

                                            <div className="w-px h-4 bg-zinc-700 mx-1" />

                                            <button
                                                onClick={handleCopyText}
                                                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                                                title="Copy"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>

                                            <div className="w-px h-4 bg-zinc-700 mx-1" />

                                            <button
                                                onClick={() => setShowMoreMenu(!showMoreMenu)}
                                                className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors ${showMoreMenu ? 'bg-zinc-800 text-white' : ''}`}
                                            >
                                                <span className="font-medium">More</span>
                                                {showMoreMenu ? <ChevronDown className="w-4 h-4" /> : <MoreHorizontal className="w-4 h-4" />}
                                            </button>

                                            {/* Secondary Dropdown (Vertical) */}
                                            {showMoreMenu && (
                                                <div className="absolute top-full mt-2 left-0 w-48 flex flex-col p-1 bg-zinc-900 border border-zinc-700/50 rounded-lg shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 backdrop-blur-md">
                                                    <button
                                                        onClick={() => handleAIRequest('define')}
                                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors group"
                                                    >
                                                        <BookOpen className="w-4 h-4 text-zinc-400 group-hover:text-blue-400" />
                                                        <span>Define</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleAIRequest('example')}
                                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors group"
                                                    >
                                                        <Lightbulb className="w-4 h-4 text-zinc-400 group-hover:text-yellow-400" />
                                                        <span>Example</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleAIRequest('summarize')}
                                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors group"
                                                    >
                                                        <ListChecks className="w-4 h-4 text-zinc-400 group-hover:text-orange-400" />
                                                        <span>Summarize</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleAIRequest('answer')}
                                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors group"
                                                    >
                                                        <MessageSquare className="w-4 h-4 text-zinc-400 group-hover:text-purple-400" />
                                                        <span>Answer</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleAIRequest('memory')}
                                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors group"
                                                    >
                                                        <Brain className="w-4 h-4 text-zinc-400 group-hover:text-pink-400" />
                                                        <span>Memory Aid</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Chat Container (Mobile) */}
                        <div className={`flex-1 h-full bg-background ${activeTab === 'chat' ? 'block' : 'hidden'} md:hidden`}>
                            {renderChatUI(true)}
                        </div>

                        {/* Chat Sidebar (Desktop) - flex-based, pushes PDF */}
                        {isSidebarOpen && (
                            <div className="hidden md:flex w-96 flex-shrink-0 h-full border-l border-border bg-card animate-in slide-in-from-right duration-300">
                                {renderChatUI(false)}
                            </div>
                        )}
                    </div>
                    {/* Full Screen Image Viewer Modal */}
                    {selectedImage && (
                        <div
                            className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
                            onClick={() => setSelectedImage(null)}
                        >
                            <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center">
                                <button
                                    onClick={() => setSelectedImage(null)}
                                    className="absolute -top-12 right-0 p-2 text-foreground/80 hover:text-foreground bg-background/50 hover:bg-background rounded-full transition-all"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                                <img
                                    src={`data:image/png;base64,${selectedImage}`}
                                    alt="Full screen snip"
                                    className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-border bg-white"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

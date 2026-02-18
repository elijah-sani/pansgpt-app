'use client';
import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Document, Page, pdfjs } from 'react-pdf';
import { X, Sparkles, BookOpen, Lightbulb, Brain, Loader2, FileText, MessageSquare, ZoomIn, ZoomOut, Scissors, Copy, ListChecks, MoreHorizontal, ChevronDown } from 'lucide-react';
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
(pdfjs.GlobalWorkerOptions as unknown as { verbosity: number }).verbosity = 0;

interface PDFViewerProps {
    fileId: string;
    fileSize?: string;
}

interface Message {
    role: 'system' | 'user' | 'assistant' | 'ai';
    content: string;
    id?: string;
    session_id?: string;
    imageBase64?: string; // For vision messages: thumbnail of snipped area
    isThinking?: boolean;
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

    // Responsive State
    const [activeTab, setActiveTab] = useState<'document' | 'chat'>('document');
    const [containerWidth] = useState<number>(600);
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
    const [isError, setIsError] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const streamFullTextRef = useRef('');
    const streamDisplayedLenRef = useRef(0);
    const streamNetworkDoneRef = useRef(false);
    const streamIntervalRef = useRef<number | null>(null);
    const [activeStreamingAssistantId, setActiveStreamingAssistantId] = useState<string | null>(null);
    const typingSpanRef = useRef<HTMLSpanElement | null>(null);

    const [pendingAttachments, setPendingAttachments] = useState<string[]>([]); // Array of base64 images
    const selectionTimer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            if (streamIntervalRef.current !== null) {
                window.clearInterval(streamIntervalRef.current);
            }
        };
    }, []);

    const stopTypewriterPainter = () => {
        if (streamIntervalRef.current !== null) {
            window.clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
        }
        setActiveStreamingAssistantId(null);
    };

    const startTypewriterPainter = (assistantId: string) => {
        setActiveStreamingAssistantId(assistantId);
        streamDisplayedLenRef.current = 0;
        streamNetworkDoneRef.current = false;
        streamFullTextRef.current = '';
        if (typingSpanRef.current) {
            typingSpanRef.current.textContent = '';
        }

        if (streamIntervalRef.current !== null) {
            window.clearInterval(streamIntervalRef.current);
        }

        streamIntervalRef.current = window.setInterval(() => {
            const span = typingSpanRef.current;
            if (!span) {
                return;
            }
            const targetText = streamFullTextRef.current;
            const currentText = span.textContent ?? '';
            if (currentText.length < targetText.length) {
                span.textContent = currentText + targetText.charAt(currentText.length);
            }
            streamDisplayedLenRef.current = span.textContent?.length ?? 0;

            if (
                streamNetworkDoneRef.current &&
                streamDisplayedLenRef.current >= streamFullTextRef.current.length
            ) {
                if (streamIntervalRef.current !== null) {
                    window.clearInterval(streamIntervalRef.current);
                    streamIntervalRef.current = null;
                }
            }
        }, 4);
    };

    const waitForTypewriterFlush = async () => {
        while (
            !streamNetworkDoneRef.current ||
            streamDisplayedLenRef.current < streamFullTextRef.current.length
        ) {
            if (!typingSpanRef.current && streamNetworkDoneRef.current) {
                streamDisplayedLenRef.current = streamFullTextRef.current.length;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };

    const consumeSSEStream = async (
        response: Response,
        assistantTempId: string,
        onUserMessageId?: (id: string) => void
    ): Promise<string | null> => {
        if (!response.body) {
            throw new Error('Streaming not supported by response body');
        }

        startTypewriterPainter(assistantTempId);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalAssistantMessageId: string | null = null;
        let firstTokenReceived = false;

        const markThinkingComplete = () => {
            setChatHistory(prev =>
                prev.map(msg =>
                    String(msg.id) === assistantTempId ? { ...msg, isThinking: false } : msg
                )
            );
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            let eventBoundary = buffer.indexOf('\n\n');

            while (eventBoundary !== -1) {
                const rawEvent = buffer.slice(0, eventBoundary).trim();
                buffer = buffer.slice(eventBoundary + 2);

                if (rawEvent) {
                    const dataLines = rawEvent
                        .split('\n')
                        .filter(line => line.startsWith('data:'))
                        .map(line => line.slice(5).trim());

                    const payload = dataLines.join('\n');
                    if (payload && payload !== '[DONE]') {
                        try {
                            const parsed = JSON.parse(payload);

                            if (parsed?.user_message_id && onUserMessageId) {
                                onUserMessageId(String(parsed.user_message_id));
                            }

                            if (typeof parsed?.delta === 'string' && parsed.delta.length > 0) {
                                if (!firstTokenReceived) {
                                    firstTokenReceived = true;
                                    markThinkingComplete();
                                }
                                streamFullTextRef.current += parsed.delta;
                            }

                            if (parsed?.message_id) {
                                finalAssistantMessageId = String(parsed.message_id);
                            }
                        } catch {
                            if (!firstTokenReceived && payload.length > 0) {
                                firstTokenReceived = true;
                                markThinkingComplete();
                            }
                            streamFullTextRef.current += payload;
                        }
                    }
                }

                eventBoundary = buffer.indexOf('\n\n');
            }
        }

        streamNetworkDoneRef.current = true;
        await waitForTypewriterFlush();
        const finalAssistantText = streamFullTextRef.current;
        setChatHistory(prev =>
            prev.map(msg =>
                String(msg.id) === assistantTempId ? { ...msg, content: finalAssistantText, isThinking: false } : msg
            )
        );
        stopTypewriterPainter();
        return finalAssistantMessageId;
    };

    // --- SESSION MANAGEMENT ---
    const { sessions, isLoadingHistory, fetchHistory, loadSession, createSession, clearHistory, deleteSession, deletingId } = useChatHistory();
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

    // Reset error state when switching chat sessions
    useEffect(() => {
        setIsError(false);
    }, [currentSessionId]);

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
                            console.log("âš¡ Cache Hit! Loading instantly.");
                            const blob = await cachedResponse.blob();
                            if (active) {
                                setPdfContent(URL.createObjectURL(blob));
                                setDownloadProgress(100); // Instant 100%
                            }
                            return;
                        }
                    } catch (cacheErr) {
                        console.warn("âš ï¸ Cache API check failed:", cacheErr);
                    }
                } else {
                    console.log("ðŸ”’ Cache API not available (likely insecure context). Skipping cache lookup.");
                }

                // 2. Network Fetch (Cache Miss or No Cache) - Use API Client for Auth
                console.log("ðŸŒ Fetching from network...");
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
                    x: snipRect.x + (snipRect.w / 2),
                    y: snipRect.y + (snipRect.h / 2),
                    imageBase64
                });
            }
        }
    };

    // --- TOUCH HANDLERS FOR SNIPPING (New) ---

    // Since we need to use the same logic as the mouse handlers, we'll duplicate the logic but adapted for TouchEvent
    // Ideally we'd abstract this, but duplication is safer for now to avoid breaking existing mouse logic.

    const handleSnipTouchStart = (e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault(); // Prevent scrolling
        if (!snipOverlayRef.current) return;

        const touch = e.touches[0];
        const rect = snipOverlayRef.current.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        setIsDrawing(true);
        setSnipStart({ x, y });
        snipScreenStart.current = { x: touch.clientX, y: touch.clientY };
        setSnipRect({ x, y, w: 0, h: 0 });
        setSnipPopup(null);
    };

    const handleSnipTouchMove = (e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();
        if (!isDrawing || !snipStart || !snipOverlayRef.current) return;

        const touch = e.touches[0];
        const rect = snipOverlayRef.current.getBoundingClientRect();
        const currentX = touch.clientX - rect.left;
        const currentY = touch.clientY - rect.top;

        const x = Math.min(currentX, snipStart.x);
        const y = Math.min(currentY, snipStart.y);
        const w = Math.abs(currentX - snipStart.x);
        const h = Math.abs(currentY - snipStart.y);

        setSnipRect({ x, y, w, h });
    };

    const handleSnipTouchEnd = async (e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();
        setIsDrawing(false);

        if (!snipRect || snipRect.w < 10 || snipRect.h < 10) {
            setSnipRect(null);
            return;
        }

        if (pdfWrapperRef.current && snipRect && snipScreenStart.current) {
            const touch = e.changedTouches[0];

            const startScreenX = snipScreenStart.current.x;
            const startScreenY = snipScreenStart.current.y;
            const endScreenX = touch.clientX;
            const endScreenY = touch.clientY;

            const screenRect = {
                left: Math.min(startScreenX, endScreenX),
                top: Math.min(startScreenY, endScreenY),
                width: Math.abs(endScreenX - startScreenX),
                height: Math.abs(endScreenY - startScreenY)
            };

            const imageBase64 = cropImageFromCanvas(pdfWrapperRef.current, screenRect);

            if (imageBase64) {
                setSnipPopup({
                    x: snipRect.x + (snipRect.w / 2),
                    y: snipRect.y + (snipRect.h / 2),
                    imageBase64
                });
            }
        }
    };

    const sendMessage = async (text: string, attachments: string[] = [], systemInstruction?: string, isRetry: boolean = false) => {
        setIsLoading(true);
        setIsError(false);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const tempUserId = `temp-user-${Date.now()}`;
        const tempAssistantId = `temp-assistant-${Date.now()}`;

        try {
            let activeSessionId = currentSessionId;
            if (!activeSessionId) {
                const title = "New Chat";
                const newSession = await createSession(title, fileId);

                if (!newSession) {
                    console.error("Failed to create session");
                    setIsLoading(false);
                    return;
                }

                activeSessionId = newSession.id;
                setCurrentSessionId(activeSessionId);
            }

            const newUserMsg: Message = {
                id: tempUserId,
                role: 'user',
                content: text,
                session_id: activeSessionId || undefined,
                ...(attachments.length > 0 && { imageBase64: attachments[0] }),
            };
            const assistantPlaceholder: Message = {
                id: tempAssistantId,
                role: 'assistant',
                content: '',
                session_id: activeSessionId || undefined,
                isThinking: true
            };

            const updatedHistory = isRetry ? [...chatHistory] : [...chatHistory, newUserMsg];
            setChatHistory(prev => (isRetry ? [...prev, assistantPlaceholder] : [...prev, newUserMsg, assistantPlaceholder]));

            const response = await api.fetch('/chat', {
                method: 'POST',
                signal: controller.signal,
                body: JSON.stringify({
                    text: text,
                    mode: 'chat',
                    messages: updatedHistory,
                    document_id: fileId,
                    images: attachments,
                    ...(attachments.length > 0 && { image_base64: attachments[0] }),
                    ...(systemInstruction && { system_instruction: systemInstruction }),
                    session_id: activeSessionId,
                    is_retry: isRetry,
                }),
            });

            if (!response.ok) {
                let detail = `API error: ${response.status}`;
                try {
                    const errData = await response.json();
                    detail = errData?.detail || detail;
                } catch {
                    // Keep default detail
                }
                throw new Error(detail);
            }

            const finalAssistantMessageId = await consumeSSEStream(
                response,
                tempAssistantId,
                !isRetry
                    ? (userMessageId: string) => {
                        setChatHistory(prev =>
                            prev.map(msg =>
                                String(msg.id) === tempUserId ? { ...msg, id: userMessageId } : msg
                            )
                        );
                    }
                    : undefined
            );
            if (finalAssistantMessageId) {
                setChatHistory(prev =>
                    prev.map(msg =>
                        String(msg.id) === tempAssistantId ? { ...msg, id: finalAssistantMessageId } : msg
                    )
                );
            }

        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                streamNetworkDoneRef.current = true;
                setChatHistory(prev =>
                    prev.map(msg =>
                        String(msg.id) === tempAssistantId ? { ...msg, content: '_You stopped this response._', isThinking: false } : msg
                    )
                );
                stopTypewriterPainter();
            } else {
                console.error('Chat Error:', err);
                streamNetworkDoneRef.current = true;
                setChatHistory(prev =>
                    prev.map(msg =>
                        String(msg.id) === tempAssistantId ? { ...msg, isThinking: false } : msg
                    )
                );
                stopTypewriterPainter();
                setIsError(true);
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    };
    const stopGeneration = () => {
        abortControllerRef.current?.abort();
    };

    const handleRetry = async () => {
        // Find the last user message by scanning backwards
        let lastUserMsg: Message | null = null;

        for (let i = chatHistory.length - 1; i >= 0; i--) {
            if (chatHistory[i].role === 'user') {
                lastUserMsg = chatHistory[i];
                break;
            }
        }

        if (!lastUserMsg || !lastUserMsg.content) return;

        // Reset error state
        setIsError(false);

        // Smart Retry Logic --------------------------------------------------
        const rawId = lastUserMsg.id;
        const numericId = Number(rawId);
        // Valid if: not NaN, > 0, and not a massive timestamp like Date.now() (which are > 1 trillion)
        const isRealDbId = rawId !== undefined && !isNaN(numericId) && numericId > 0 && numericId < 1000000000;

        console.log('[Retry] Triggered - ID:', rawId, 'Numeric:', numericId, 'IsRealDB:', isRealDbId);

        const images = lastUserMsg.imageBase64 ? [lastUserMsg.imageBase64] : [];

        if (isRealDbId) {
            console.log('[Retry] Path A: Attempting /chat/edit with ID:', rawId);
            await handleEditMessage(String(rawId), lastUserMsg.content);
        } else {
            // Path B: NETWORK ERROR (Message never reached DB or has Temp ID)
            console.log('[Retry] Path B: Network error / temporary ID â€” Resending fresh');
            // Leave the existing bubble on screen â€” sendMessage with isRetry=true won't add another
            sendMessage(lastUserMsg.content, images, undefined, true);
        }
    };

    const handleEditMessage = async (messageId: string, newText: string) => {
        if (!currentSessionId) return;
        const tempAssistantId = `temp-assistant-edit-${Date.now()}`;

        // Safety log: what ID is being sent to the backend?
        console.log('[Edit] Editing Message ID:', messageId, 'Type:', typeof messageId);

        // --- OPTIMISTIC UI UPDATE (instant feedback) ---
        // Find the index of the message being edited
        const editIndex = chatHistory.findIndex(m => String(m.id) === String(messageId));
        if (editIndex !== -1) {
            // Slice off everything after this message, update its content
            const optimisticMessages = chatHistory.slice(0, editIndex + 1);
            optimisticMessages[editIndex] = {
                ...optimisticMessages[editIndex],
                content: newText,
            };
            optimisticMessages.push({
                id: tempAssistantId,
                role: 'assistant',
                content: '',
                session_id: currentSessionId,
                isThinking: true
            });
            setChatHistory(optimisticMessages);
        }

        setIsLoading(true);
        setIsError(false);

        try {
            const response = await api.fetch('/chat/edit', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: currentSessionId,
                    message_id: messageId,
                    new_text: newText,
                }),
            });

            if (!response.ok) {
                throw new Error(`Edit failed: ${response.status}`);
            }

            const finalAssistantMessageId = await consumeSSEStream(response, tempAssistantId);
            if (finalAssistantMessageId) {
                setChatHistory(prev =>
                    prev.map(msg =>
                        String(msg.id) === tempAssistantId
                            ? { ...msg, id: String(finalAssistantMessageId) }
                            : msg
                    )
                );
            }

        } catch (err) {
            console.error("Edit Error:", err);
            streamNetworkDoneRef.current = true;
            setChatHistory(prev =>
                prev.map(msg =>
                    String(msg.id) === tempAssistantId ? { ...msg, isThinking: false } : msg
                )
            );
            stopTypewriterPainter();
            setIsError(true);
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
        streamNetworkDoneRef.current = true;
        stopTypewriterPainter();
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

            // Premium UX Props
            isError={isError}
            onRetry={handleRetry}
            onStopGeneration={stopGeneration}
            onEditMessage={handleEditMessage}

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
            activeStreamingAssistantId={activeStreamingAssistantId}
            typingSpanRef={typingSpanRef}
            onRegenerate={async () => {
                // Regenerate Logic (Backend-driven):
                if (!currentSessionId) return;
                const tempAssistantId = `temp-assistant-regen-${Date.now()}`;

                // 1. Optimistic UI Update: Remove last assistant message and add placeholder
                setChatHistory(prev => {
                    if (prev.length === 0) return prev;
                    const last = prev[prev.length - 1];
                    const base = (last.role === 'assistant' || last.role === 'ai') ? prev.slice(0, -1) : prev;
                    return [...base, { id: tempAssistantId, role: 'assistant', content: '', session_id: currentSessionId, isThinking: true }];
                });
                setIsLoading(true);

                try {
                    // 2. Call Backend Regenerate Endpoint (SSE stream)
                    const res = await api.fetch(`/chat/${currentSessionId}/regenerate`, {
                        method: 'POST',
                        body: JSON.stringify({})
                    });

                    if (!res.ok) {
                        throw new Error(`Regenerate failed: ${res.status}`);
                    }
                    const finalAssistantMessageId = await consumeSSEStream(res, tempAssistantId);
                    if (finalAssistantMessageId) {
                        setChatHistory(prev =>
                            prev.map(msg =>
                                String(msg.id) === tempAssistantId
                                    ? { ...msg, id: String(finalAssistantMessageId) }
                                    : msg
                            )
                        );
                    }
                } catch (err) {
                    console.error("Regenerate failed:", err);
                    streamNetworkDoneRef.current = true;
                    stopTypewriterPainter();
                    setChatHistory(prev =>
                        prev.map(msg =>
                            String(msg.id) === tempAssistantId
                                ? { ...msg, content: "Sorry, failed to regenerate.", isThinking: false }
                                : msg
                        )
                    );
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
            className="flex flex-col h-[100dvh] bg-background relative overflow-hidden font-sans"
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
                                            â€¢ {meta.lecturer}
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
                                            // Touch Events
                                            onTouchStart={handleSnipTouchStart}
                                            onTouchMove={handleSnipTouchMove}
                                            onTouchEnd={handleSnipTouchEnd}
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
                                                        left: snipPopup.x,
                                                        top: snipPopup.y,
                                                        transform: 'translate(-50%, -50%)'
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onTouchStart={(e) => e.stopPropagation()}
                                                    onTouchEnd={(e) => e.stopPropagation()}
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
                                            onTouchStart={(e) => e.stopPropagation()}
                                            onTouchEnd={(e) => e.stopPropagation()}
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
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setShowMoreMenu(!showMoreMenu);
                                                }}
                                                onTouchEnd={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setShowMoreMenu(!showMoreMenu);
                                                }}
                                                className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors ${showMoreMenu ? 'bg-zinc-800 text-white' : ''}`}
                                            >
                                                <span className="font-medium">More</span>
                                                {showMoreMenu ? <ChevronDown className="w-4 h-4" /> : <MoreHorizontal className="w-4 h-4" />}
                                            </button>

                                            {/* Secondary Dropdown (Vertical) */}
                                            {showMoreMenu && (
                                                <div
                                                    className="absolute top-full mt-2 left-0 w-48 flex flex-col p-1 bg-zinc-900 border border-zinc-700/50 rounded-lg shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 backdrop-blur-md"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onTouchStart={(e) => e.stopPropagation()}
                                                    onTouchEnd={(e) => e.stopPropagation()}
                                                >
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

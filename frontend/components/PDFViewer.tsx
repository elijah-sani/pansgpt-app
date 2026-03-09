'use client';
import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Document, Page, pdfjs } from 'react-pdf';
import { X, Sparkles, BookmarkPlus, BookOpen, Lightbulb, Brain, Loader2, FileText, MessageSquare, ZoomIn, ZoomOut, Scissors, Copy, Trash2, ListChecks, MoreHorizontal, ChevronDown, RefreshCw, Download, Send, Pencil, Check } from 'lucide-react';
import { useSimulatedProgress } from '../hooks/useSimulatedProgress';
import { LoadingState } from './LoadingState';
import { cropImageFromCanvas } from '../lib/pdf-utils';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import SnippetMenu from './SnippetMenu';
import ChatInterface from './ChatInterface';
import { useChatHistory } from '../hooks/useChatHistory';
import { api } from '../lib/api';
import { PDFViewerNotesPanel } from './pdf/PDFViewerNotesPanel';
import { PDFViewerSelectedImageModal } from './pdf/PDFViewerSelectedImageModal';
import type { PDFNote } from './pdf/types';

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

const extractApiErrorMessage = (errorBody: unknown, fallback: string): string => {
    if (!errorBody || typeof errorBody !== 'object') return fallback;
    const payload = errorBody as Record<string, unknown>;
    if (typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
        return payload.detail;
    }
    if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
        return payload.message;
    }
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
        return payload.error;
    }
    return fallback;
};

export default function PDFViewer({ fileId, fileSize }: PDFViewerProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1); // Tracks the most-visible page for progress sync
    const [error, setError] = useState<string | null>(null);

    // Responsive State
    const [activeTab, setActiveTab] = useState<'document' | 'chat'>('document');
    const [containerWidth] = useState<number>(600);
    const [zoomLevel, setZoomLevel] = useState<number>(100);
    const [baseScale, setBaseScale] = useState<number>(1.0);
    const pdfWrapperRef = useRef<HTMLDivElement>(null);
    const [unreadMessages, setUnreadMessages] = useState(false);
    const [notesOpen, setNotesOpen] = useState(false);
    const [notes, setNotes] = useState<PDFNote[]>([]);
    const [isLoadingNotes, setIsLoadingNotes] = useState(false);
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [noteSavedFlash, setNoteSavedFlash] = useState(false);
    // Mobile floating pill visibility
    const [showMobilePill, setShowMobilePill] = useState(false);
    const mobilePillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Notes UI state
    const [copiedNotes, setCopiedNotes] = useState(false);
    const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

    const toggleNoteExpanded = (id: string) => {
        setExpandedNotes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const triggerMobilePill = () => {
        setShowMobilePill(true);
        if (mobilePillTimer.current) clearTimeout(mobilePillTimer.current);
        mobilePillTimer.current = setTimeout(() => setShowMobilePill(false), 3000);
    };

    // Personal note textarea
    const [personalNote, setPersonalNote] = useState('');
    const [isSavingPersonal, setIsSavingPersonal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    // Inline note editing
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

    const handleUpdateNote = async (noteId: string) => {
        const text = editingText.trim();
        if (!text) return;
        setIsSavingEdit(true);
        try {
            await api.fetch(`/notes/${noteId}`, {
                method: 'PATCH',
                body: JSON.stringify({ user_annotation: text }),
            });
            setNotes(prev => prev.map(n => String(n.id) === noteId ? { ...n, user_annotation: text } : n));
            setEditingNoteId(null);
        } catch (e) {
            console.error('Update note failed', e);
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleSavePersonalNote = async () => {
        const text = personalNote.trim();
        if (!text) return;
        setIsSavingPersonal(true);
        await handleSaveTextNote(text);
        setPersonalNote('');
        setIsSavingPersonal(false);
    };

    const exportNotesPDF = async () => {
        if (isExporting) return;
        setIsExporting(true);

        const docTitle = meta.topic || meta.filename;
        const catColor = (cat: string) =>
            cat === 'Definition' ? '#3b82f6' : cat === 'Formula' ? '#f59e0b' : cat === 'Important' ? '#ef4444' : '#10b981';

        // Convert plain-text newlines and dash-lists to HTML
        const formatText = (raw: string) =>
            raw.split('\n').map(line => {
                const trimmed = line.trimStart();
                if (trimmed.startsWith('- ') || trimmed.startsWith('* '))
                    return `&bull;&nbsp;${trimmed.slice(2)}`;
                return line;
            }).join('<br/>');

        const noteRows = notes.map(n => {
            const cc = catColor(n.category || '');
            const text = n.user_annotation || n.ai_explanation || '';
            const img = n.image_base64
                ? `<img src="data:image/png;base64,${n.image_base64}" style="max-width:100%;border-radius:8px;margin-top:8px;border:1px solid #e5e7eb;" crossorigin="anonymous"/>`
                : '';
            return `<div style="margin-bottom:18px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;page-break-inside:avoid;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${cc};background:${cc}18;padding:2px 10px;border-radius:999px;line-height:1.8;">${n.category || 'Key Point'}</span>
                    ${n.page_number ? `<span style="color:#9ca3af;font-size:11px;">Page ${n.page_number}</span>` : ''}
                </div>
                ${img}
                ${text ? `<p style="color:#374151;font-size:13px;line-height:1.6;margin:${img ? '10px' : '0'} 0 0;">${formatText(text)}</p>` : ''}
            </div>`;
        }).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${docTitle} — Notes</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; margin: 0; padding: 40px; }
  @media print { body { background: #fff; padding: 24px; } @page { margin: 1.5cm; } }
</style></head><body>
<div style="max-width:700px;margin:0 auto;">
  <div style="margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #e5e7eb;">
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0;">${docTitle}</h1>
    ${meta.lecturer ? `<p style="color:#6b7280;font-size:13px;margin:4px 0 0;">Lecturer: ${meta.lecturer}</p>` : ''}
    <p style="color:#9ca3af;font-size:12px;margin:6px 0 0;">${notes.length} note${notes.length !== 1 ? 's' : ''} &bull; Exported ${new Date().toLocaleDateString()}</p>
  </div>
  ${noteRows}
</div></body></html>`;

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        if (!isMobile) {
            // Desktop: open new tab + print — gives real selectable text in PDF
            const win = window.open('', '_blank');
            if (win) {
                win.document.write(html);
                win.document.close();
                win.focus();
                setTimeout(() => { win.print(); setIsExporting(false); }, 400);
                return;
            }
        }

        // Mobile (or popup blocked): render each note card individually → jsPDF
        // This avoids slicing cards mid-content by placing each card as its own image.
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: html2canvas } = await import('html2canvas');

            const SCALE = 2;
            const CARD_WIDTH_PX = 714; // rendered width of each card
            const MARGIN = 24; // px margin inside PDF page (each side)

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4', compress: true });
            const pw = pdf.internal.pageSize.getWidth();
            const ph = pdf.internal.pageSize.getHeight();

            // Helper: create an off-screen container for a single block of HTML
            const renderBlock = async (innerHtml: string): Promise<HTMLCanvasElement> => {
                const el = document.createElement('div');
                el.style.cssText = `position:fixed;top:0;left:0;width:${CARD_WIDTH_PX}px;background:#ffffff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;z-index:-9999;pointer-events:none;padding:0;margin:0;`;
                el.innerHTML = innerHtml;
                document.body.appendChild(el);
                try {
                    return await html2canvas(el, { scale: SCALE, useCORS: true, backgroundColor: '#ffffff', logging: false });
                } finally {
                    document.body.removeChild(el);
                }
            };

            // Scale factor: how many PDF px does 1 canvas pixel map to?
            const canvasToPdfX = (pw - MARGIN * 2) / (CARD_WIDTH_PX * SCALE);

            let cursorY = MARGIN;
            let firstPage = true;

            // --- Header block ---
            const headerHtml = `
              <div style="margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #e5e7eb;">
                <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0;">${docTitle}</h1>
                ${meta.lecturer ? `<p style="color:#6b7280;font-size:13px;margin:4px 0 0;">Lecturer: ${meta.lecturer}</p>` : ''}
                <p style="color:#9ca3af;font-size:12px;margin:6px 0 0;">${notes.length} note${notes.length !== 1 ? 's' : ''} &bull; Exported ${new Date().toLocaleDateString()}</p>
              </div>`;
            const headerCanvas = await renderBlock(headerHtml);
            const headerH = headerCanvas.height * canvasToPdfX;
            pdf.addImage(headerCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, cursorY, pw - MARGIN * 2, headerH);
            cursorY += headerH + 10;
            firstPage = true;

            // --- Note cards ---
            for (const n of notes) {
                const cc = catColor(n.category || '');
                const text = n.user_annotation || n.ai_explanation || '';
                const imgTag = n.image_base64
                    ? `<img src="data:image/png;base64,${n.image_base64}" style="max-width:100%;border-radius:8px;margin-top:8px;border:1px solid #e5e7eb;" crossorigin="anonymous"/>`
                    : '';
                const cardHtml = `
                  <div style="padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                      <span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${cc};background:${cc}18;padding:2px 10px;border-radius:999px;line-height:1.8;">${n.category || 'Key Point'}</span>
                      ${n.page_number ? `<span style="color:#9ca3af;font-size:11px;">Page ${n.page_number}</span>` : ''}
                    </div>
                    ${imgTag}
                    ${text ? `<p style="color:#374151;font-size:13px;line-height:1.6;margin:${imgTag ? '10px' : '0'} 0 0;">${formatText(text)}</p>` : ''}
                  </div>`;

                const cardCanvas = await renderBlock(cardHtml);
                const cardH = cardCanvas.height * canvasToPdfX;
                const gap = firstPage ? 0 : 12;

                // If card won't fit in remaining space on this page, start a new page
                if (!firstPage && cursorY + gap + cardH > ph - MARGIN) {
                    pdf.addPage();
                    cursorY = MARGIN;
                }

                pdf.addImage(cardCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, cursorY + (firstPage ? 0 : gap), pw - MARGIN * 2, cardH);
                cursorY += cardH + (firstPage ? 0 : gap);
                firstPage = false;
            }

            pdf.save(`${docTitle} - Notes.pdf`);
        } finally {
            setIsExporting(false);
        }
    };

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
    const [isSnipActive, setIsSnipActive] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [snipRect, setSnipRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [snipStart, setSnipStart] = useState<{ x: number; y: number } | null>(null);
    const [snipPopup, setSnipPopup] = useState<{ x: number; y: number; imageBase64: string } | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const snipOverlayRef = useRef<HTMLDivElement>(null);

    // Chat State
    const [chatHistory, setChatHistory] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    const [inputMessage, setInputMessage] = useState("");
    const [isError, setIsError] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const streamFullTextRef = useRef('');

    const [pendingAttachments, setPendingAttachments] = useState<string[]>([]); // Array of base64 images
    const selectionTimer = useRef<NodeJS.Timeout | null>(null);
    const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // Debounce ref for progress saves
    const progressRestoredRef = useRef(false); // Guard: only auto-scroll once per document load

    useEffect(() => {
        return () => {
            if (progressSaveTimer.current) {
                clearTimeout(progressSaveTimer.current);
            }
        };
    }, []);


    const consumeSSEStream = async (
        response: Response,
        assistantTempId: string,
        onUserMessageId?: (id: string) => void
    ): Promise<string | null> => {
        if (!response.body) {
            throw new Error('Streaming not supported by response body');
        }

        streamFullTextRef.current = '';

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalAssistantMessageId: string | null = null;
        let firstTokenReceived = false;

        const updateUIWithChunk = (newText: string) => {
            streamFullTextRef.current += newText;
            setChatHistory(prev =>
                prev.map(msg =>
                    String(msg.id) === assistantTempId
                        ? { ...msg, content: streamFullTextRef.current, isThinking: false }
                        : msg
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
                                firstTokenReceived = true;
                                updateUIWithChunk(parsed.delta);
                            }

                            if (parsed?.message_id) {
                                finalAssistantMessageId = String(parsed.message_id);
                            }
                        } catch {
                            firstTokenReceived = true;
                            updateUIWithChunk(payload);
                        }
                    }
                }

                eventBoundary = buffer.indexOf('\n\n');
            }
        }

        // Final sync
        const finalAssistantText = streamFullTextRef.current;
        setChatHistory(prev =>
            prev.map(msg =>
                String(msg.id) === assistantTempId ? { ...msg, content: finalAssistantText, isThinking: false } : msg
            )
        );

        return finalAssistantMessageId;
    };

    // --- SESSION MANAGEMENT ---
    const { sessions, isLoadingHistory, fetchHistory, loadSession, createSession, clearHistory, deleteSession, deletingId } = useChatHistory();
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

    // Reset error state when switching chat sessions
    useEffect(() => {
        setIsError(false);
        setChatError(null);
    }, [currentSessionId]);

    // --- PAGE VISIBILITY TRACKING (IntersectionObserver) ---
    // Observes each rendered page-container div and records which one is most visible in the viewport.
    useEffect(() => {
        if (!numPages) return;

        const observers: IntersectionObserver[] = [];
        const visibilityMap = new Map<number, number>(); // pageNum -> intersectionRatio

        for (let i = 1; i <= numPages; i++) {
            const el = document.getElementById(`page-container-${i}`);
            if (!el) continue;

            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        visibilityMap.set(i, entry.intersectionRatio);
                    });
                    // Track the page with the largest visible portion
                    let maxRatio = 0;
                    let mostVisiblePage = 1;
                    visibilityMap.forEach((ratio, page) => {
                        if (ratio > maxRatio) {
                            maxRatio = ratio;
                            mostVisiblePage = page;
                        }
                    });
                    if (maxRatio > 0) {
                        setCurrentPage(mostVisiblePage);
                    }
                },
                { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0] }
            );

            observer.observe(el);
            observers.push(observer);
        }

        return () => observers.forEach(obs => obs.disconnect());
    }, [numPages]);

    // --- FETCH SAVED PROGRESS & AUTO-RESUME ---
    // Once the PDF finishes loading (numPages > 0), fetch the user's last-saved page
    // and smoothly scroll to it. The guard ref ensures this only runs once per document.
    useEffect(() => {
        if (!numPages || !fileId || progressRestoredRef.current) return;
        progressRestoredRef.current = true;

        const restoreProgress = async () => {
            try {
                const res = await api.fetch(`/admin/documents/${fileId}/progress`);
                if (!res.ok) return; // Silently fail (e.g. unauthenticated)

                const data = await res.json();
                const savedPage: number = data?.current_page ?? 1;

                if (savedPage > 1) {
                    // Brief delay so react-pdf finishes painting pages before we scroll
                    setTimeout(() => {
                        const target = document.getElementById(`page-container-${savedPage}`);
                        if (target) {
                            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 400);
                }
            } catch {
                // Network failure — non-fatal, user starts at page 1
            }
        };

        restoreProgress();
    }, [numPages, fileId]);

    // --- DEBOUNCED PROGRESS SAVE ---
    // After the user stops scrolling for 2.5s, saves currentPage to the backend.
    // Resets the timer on every page change to prevent flooding the database.
    useEffect(() => {
        if (!numPages || !fileId) return;

        if (progressSaveTimer.current) {
            clearTimeout(progressSaveTimer.current);
        }

        progressSaveTimer.current = setTimeout(async () => {
            try {
                await api.fetch(`/admin/documents/${fileId}/progress`, {
                    method: 'POST',
                    body: JSON.stringify({
                        current_page: currentPage,
                        total_pages: numPages,
                    }),
                });
            } catch {
                // Non-fatal — user simply loses this progress tick
            }
        }, 2500);

        return () => {
            if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
        };
    }, [currentPage, numPages, fileId]);

    // Load history on mount (scoped to file)
    useEffect(() => {
        if (fileId) fetchHistory(fileId);
    }, [fileId, fetchHistory]);

    // --- CACHING & DOWNLOAD LOGIC ---
    const [pdfContent, setPdfContent] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [isRetrying, setIsRetrying] = useState(false);
    // Use our new hook for smooth progress
    const displayProgress = useSimulatedProgress(downloadProgress);

    const CACHE_NAME = 'pans-library-v1';
    const streamEndpoint = `/documents/${fileId}/stream${fileSize ? `?size=${fileSize}` : ''}`;
    const cacheUrl = `${process.env.NEXT_PUBLIC_API_URL}${streamEndpoint}`;

    const loadPDF = async (forceNetwork = false) => {
        try {
            // Reset state for retry
            setError(null);
            setDownloadProgress(null);
            setPdfContent(null);

            // 1. Check Cache (Safari on iOS disables Cache API in insecure contexts)
            const canUseCache = typeof window !== 'undefined' && 'caches' in window;
            let cache: Cache | null = null;

            if (canUseCache) {
                try {
                    cache = await caches.open(CACHE_NAME);

                    // If forcing a network fetch, delete the existing cache entry first
                    if (forceNetwork) {
                        console.log("Force network: deleting cached entry...");
                        await cache.delete(cacheUrl);
                    } else {
                        const cachedResponse = await cache.match(cacheUrl);

                        if (cachedResponse) {
                            const blob = await cachedResponse.blob();

                            // Task 2: Cache Invalidation - validate blob before using
                            if (blob.size > 0) {
                                console.log("Cache Hit! Loading instantly.");
                                setPdfContent(URL.createObjectURL(blob));
                                setDownloadProgress(100);
                                return;
                            } else {
                                // Corrupted/empty cache entry - purge and fall through to network
                                console.warn("Corrupted cache entry (0 bytes). Deleting and re-fetching...");
                                await cache.delete(cacheUrl);
                            }
                        }
                    }
                } catch (cacheErr) {
                    console.warn("Cache API check failed:", cacheErr);
                }
            } else {
                console.log("Cache API not available (likely insecure context). Skipping cache lookup.");
            }

            // 2. Network Fetch (Cache Miss, Force Network, or No Cache)
            console.log("Fetching from network...");
            const response = await api.fetch(streamEndpoint);

            if (!response.ok) throw new Error(`Stream Error: ${response.status}`);
            if (!response.body) throw new Error("ReadableStream not supported");

            // 3. Stream the response for progress tracking
            const reader = response.body.getReader();
            const contentLength = +(response.headers.get('Content-Length') || fileSize || 0);

            let receivedLength = 0;
            const chunks: Uint8Array[] = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedLength += value.length;

                if (contentLength) {
                    setDownloadProgress((receivedLength / contentLength) * 100);
                }
            }

            // Build one concrete ArrayBuffer-backed chunk for Blob typing compatibility.
            const merged = new Uint8Array(receivedLength);
            let offset = 0;
            for (const chunk of chunks) {
                merged.set(chunk, offset);
                offset += chunk.length;
            }
            const blob = new Blob([merged], { type: 'application/pdf' });

            // Task 1: Strict Cache Validation - only save after successful, non-empty download
            if (canUseCache && cache && blob.size > 0) {
                cache.put(
                    cacheUrl,
                    new Response(blob.slice(), {
                        headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(blob.size) },
                    })
                ).catch(e => console.error("Cache Save Failed:", e));
                console.log("Cached successfully (", blob.size, "bytes)");
            } else if (blob.size === 0) {
                console.warn("Downloaded blob is empty - NOT caching.");
            }

            setPdfContent(URL.createObjectURL(blob));
            setDownloadProgress(100);

        } catch (err) {
            console.error("PDF Load Error:", err);
            setError("Failed to load document.");
        }
    };

    // Task 3: Retry handler - bypasses cache completely
    const handleRetryDownload = async () => {
        setIsRetrying(true);
        await loadPDF(true);
        setIsRetrying(false);
    };

    useEffect(() => {
        loadPDF();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fileId, fileSize]);

    // ... (rest of code)

    // Fetch Metadata
    const [meta, setMeta] = useState<{ topic?: string; lecturer?: string; filename: string; documentId?: string }>({ filename: "Document" });
    const [showMoreMenu, setShowMoreMenu] = useState(false);

    useEffect(() => {
        // if (!process.env.NEXT_PUBLIC_API_URL || !process.env.NEXT_PUBLIC_API_KEY) return;

        api.fetch(`/documents/${fileId}`)
            .then(res => res.json())
            .then(data => {
                setMeta({
                    filename: data.name ? data.name.replace('.pdf', '') : "Document",
                    topic: data.topic,
                    lecturer: data.lecturer_name,
                    documentId: data.id,
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
        if (isLoading) return; // Prevent new requests while generating
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
        if (isLoading) return;
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

        setIsSnipActive(true);
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
            setIsSnipActive(false);
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
        setIsSnipActive(false);
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

        setIsSnipActive(true);
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
            setIsSnipActive(false);
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
        setIsSnipActive(false);
    };

    const sendMessage = async (text: string, attachments: string[] = [], systemInstruction?: string, isRetry: boolean = false) => {
        setIsLoading(true);
        setIsError(false);
        setChatError(null);
        setChatError(null);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const tempUserId = `temp-user-${Date.now()}`;
        const tempAssistantId = `temp-assistant-${Date.now()}`;

        let isNewSession = false;

        try {
            // --- Optimistic UI: show messages immediately, create session in background ---
            const newUserMsg: Message = {
                id: tempUserId,
                role: 'user',
                content: text,
                session_id: currentSessionId || undefined,
                ...(attachments.length > 0 && { imageBase64: attachments[0] }),
            };
            const assistantPlaceholder: Message = {
                id: tempAssistantId,
                role: 'assistant',
                content: '',
                session_id: currentSessionId || undefined,
                isThinking: true
            };

            const updatedHistory = isRetry ? [...chatHistory] : [...chatHistory, newUserMsg];
            setChatHistory(prev => (isRetry ? [...prev, assistantPlaceholder] : [...prev, newUserMsg, assistantPlaceholder]));

            let activeSessionId = currentSessionId;
            if (!activeSessionId) {
                isNewSession = true;
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

            const payload: Record<string, unknown> = {
                text: text,
                mode: 'chat',
                messages: updatedHistory,
                document_id: fileId,
                images: attachments.map((base64Data) => base64Data),
                image_base64: attachments.length > 0 ? attachments[0] : null,
                session_id: activeSessionId,
                is_retry: isRetry,
            };
            if (systemInstruction) {
                payload.system_instruction = systemInstruction;
            }

            const response = await api.fetch('/chat', {
                method: 'POST',
                signal: controller.signal,
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                let detail = `API error: ${response.status}`;
                try {
                    const errData = await response.json();
                    detail = extractApiErrorMessage(errData, detail);
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
                setChatHistory(prev =>
                    prev.map(msg =>
                        String(msg.id) === tempAssistantId
                            ? { ...msg, content: streamFullTextRef.current, isThinking: false, isStopped: true }
                            : msg
                    )
                );
            } else {
                console.error('Chat Error:', err);
                setChatHistory(prev => prev.filter(msg => String(msg.id) !== tempAssistantId));
                setIsError(true);
                setChatError(err instanceof Error ? err.message : "Network Error: Please try again.");
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;

            // Sync the history list (to re-sort the active session to the top)
            fetchHistory(fileId || undefined);
        }
    };
    const stopGeneration = () => {
        setIsLoading(false);
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
        setChatError(null);

        const images = lastUserMsg.imageBase64 ? [lastUserMsg.imageBase64] : [];
        setChatHistory(prev => prev.filter(msg => !String(msg.id || '').startsWith('temp-assistant')));
        await sendMessage(lastUserMsg.content, images, undefined, true);
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

            const finalAssistantMessageId = await consumeSSEStream(
                response,
                tempAssistantId,
                (newUserMsgId: string) => {
                    setChatHistory(prev =>
                        prev.map(msg =>
                            String(msg.id) === String(messageId) ? { ...msg, id: newUserMsgId } : msg
                        )
                    );
                }
            );
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
            setChatHistory(prev => prev.filter(msg => String(msg.id) !== tempAssistantId));
            setIsError(true);
            setChatError(err instanceof Error ? err.message : "Edit failed. Please try again.");
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
        setIsSnipActive(false);
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
        setIsSnipActive(false);
        setSnipRect(null);
        setSnipPopup(null);

        // 3. Set Input State
        // Append if less than 3, otherwise replace
        setPendingAttachments(prev => {
            if (prev.length < 5) return [...prev, image];
            return [image];
        });
    };

    const fetchNotes = async () => {
        if (!meta.documentId) return;
        setIsLoadingNotes(true);
        try {
            const res = await api.fetch(`/notes/${meta.documentId}`);
            if (res.ok) {
                const data = await res.json();
                setNotes(data.notes || []);
            }
        } catch {
            // Ignore silently for now.
        } finally {
            setIsLoadingNotes(false);
        }
    };

    const handleSaveNote = async (image: string, sourceText?: string) => {
        if (!meta.documentId) return;
        setIsSavingNote(true);
        try {
            const res = await api.fetch('/notes', {
                method: 'POST',
                body: JSON.stringify({
                    document_id: meta.documentId,
                    image_base64: image,
                    page_number: currentPage ?? null,
                    user_annotation: sourceText || null,
                }),
            });
            if (res.ok) {
                setNoteSavedFlash(true);
                setTimeout(() => setNoteSavedFlash(false), 2000);
                // Always open notes panel and refresh list after saving
                setNotesOpen(true);
                void fetchNotes();
            }
        } catch {
            // Ignore silently for now.
        } finally {
            setIsSavingNote(false);
        }
    };

    const handleSaveTextNote = async (text: string) => {
        if (!meta.documentId) return;
        setIsSavingNote(true);
        try {
            const res = await api.fetch('/notes', {
                method: 'POST',
                body: JSON.stringify({
                    document_id: meta.documentId,
                    image_base64: '',
                    page_number: currentPage ?? null,
                    user_annotation: text,
                }),
            });
            if (res.ok) {
                setNoteSavedFlash(true);
                setTimeout(() => setNoteSavedFlash(false), 2000);
                // Always open notes panel and refresh list after saving
                setNotesOpen(true);
                void fetchNotes();
            }
        } catch {
            // Ignore silently for now.
        } finally {
            setIsSavingNote(false);
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        setDeletingNoteId(noteId);
        try {
            await api.fetch(`/notes/${noteId}`, { method: 'DELETE' });
            setNotes(prev => prev.filter(n => String(n.id) !== noteId));
        } catch {
            // Ignore silently for now.
        } finally {
            setDeletingNoteId(current => (current === noteId ? null : current));
        }
    };

    const toggleNotesPanel = () => {
        setNotesOpen(prev => !prev);
        if (!notesOpen) void fetchNotes();
    };

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
        progressRestoredRef.current = false; // Reset so auto-resume runs for this newly-loaded doc
        setError(null);
    }

    function onDocumentLoadError(err: Error) {
        console.error("PDF Load Error:", err);
        setError("Failed to load document. Check API Key or Backend connection.");
    }

    // --- SESSION HANDLERS ---

    const handleLoadSession = async (sessionId: string) => {
        setIsLoadingChat(true);
        try {
            // Don't trigger "Thinking" bubble. Just load data.
            const msgs = await loadSession(sessionId);
            setChatHistory(msgs as Message[]);
            setCurrentSessionId(sessionId);
            setPendingAttachments([]);
            setIsError(false);
            setChatError(null);
        } catch (err) {
            console.error("Failed to load session UI:", err);
            setChatHistory([]);
            setIsError(true);
            setChatError("Failed to load chat history.");
        } finally {
            setIsLoadingChat(false);
        }
    };

    const handleNewChat = () => {
        // Reset Logic: synchronously clear state
        setIsLoading(false);
        setIsError(false);
        setChatError(null);
        setChatHistory([]);
        setInputMessage('');
        setPendingAttachments([]);
        setCurrentSessionId(null);
    };

    const handleClearHistory = async () => {
        if (window.confirm("Are you sure you want to delete all chat history? This cannot be undone.")) {
            await clearHistory();
            setIsError(false);
            setChatError(null);
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
            isLoadingChat={isLoadingChat}
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
            chatError={chatError}
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
            contextId={fileId}
            onNoteAdded={async () => {
                setNotesOpen(true);
                await fetchNotes();
            }}
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
                    setChatHistory(prev => prev.filter(msg => String(msg.id) !== tempAssistantId));
                    setIsError(true);
                    setChatError(err instanceof Error ? err.message : "Regenerate failed. Please try again.");
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


                    <div className="lg:hidden fixed top-0 w-full h-14 bg-background/80 backdrop-blur-md border-b border-border z-50 flex items-center justify-around shadow-sm">
                        <button
                            onClick={() => { setActiveTab('document'); }}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'document' ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                            <FileText className="w-4 h-4" />
                            Document
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



                    {/* Desktop Header */}
                    <div className="hidden lg:flex fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-30 items-center justify-between px-6 shadow-sm">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => {
                                    const course = searchParams.get('course');
                                    if (course) {
                                        router.push(`/reader?course=${course}`);
                                    } else {
                                        router.push('/reader');
                                    }
                                }}
                                className="p-2 hover:bg-muted/50 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                                title="Go Back"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                            </button>
                            <div className="h-6 w-px bg-border" />
                            <div className="flex flex-col justify-center min-w-0">
                                <h1 className="text-sm font-semibold text-foreground leading-tight truncate max-w-sm">{meta.topic || meta.filename}</h1>
                                {meta.lecturer && <p className="text-xs text-muted-foreground truncate max-w-sm">{meta.lecturer}</p>}
                            </div>
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
                                    const nextSnipMode = !isSnippingMode;
                                    setIsSnippingMode(nextSnipMode);
                                    setIsSnipActive(nextSnipMode);
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
                                onClick={toggleNotesPanel}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${notesOpen
                                        ? 'bg-card text-primary border-primary/20 shadow-lg shadow-black/5'
                                        : 'bg-card hover:bg-muted/50 text-muted-foreground border-border shadow-sm'
                                    }`}
                                title="My Notes"
                            >
                                <BookOpen className="w-4 h-4" />
                                <span className="hidden lg:inline">Notes</span>
                                {notes.length > 0 && (
                                    <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{notes.length}</span>
                                )}
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
                    <div className={`flex-1 flex pt-14 lg:pt-16 h-full overflow-hidden`}>

                        {/* PDF Container */}
                        <div
                            ref={pdfWrapperRef}
                            className={`flex-1 min-w-0 overflow-y-auto bg-background transition-all duration-300 relative
                        ${activeTab === 'document' ? 'block' : 'hidden lg:block'
                                }
                        ${isSnippingMode ? 'cursor-crosshair' : ''
                                }
                        ${isSnipActive ? 'sm:overflow-y-auto overflow-hidden touch-none sm:touch-auto' : ''}
                    `}
                            onTouchStart={() => triggerMobilePill()}
                        >
                            {/* Snipping Mode Banner */}
                            {/* ─── Reading Progress Bar ─────────────────────────────── */}
                            {numPages > 0 && (
                                <div
                                    className="fixed bottom-0 left-0 right-0 z-50"
                                >
                                    {/* Always-visible page indicator */}
                                    <div className="hidden lg:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-card/90 text-foreground text-xs font-medium whitespace-nowrap shadow-lg border border-border pointer-events-none">
                                        Page {currentPage} of {numPages}
                                    </div>
                                    {/* Track */}
                                    <div className="w-full h-[3px] bg-border/50">
                                        {/* Fill */}
                                        <div
                                            className="h-full bg-gradient-to-r from-primary via-green-400 to-emerald-400 transition-all duration-500 ease-out"
                                            style={{ width: `${(currentPage / numPages) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {isSnippingMode && (
                                <div className="sticky top-0 z-20 bg-[#253920] border-b border-white/10 px-4 py-3 flex items-center justify-center gap-3 text-white shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
                                    <Scissors className="w-5 h-5 text-green-400" />
                                    <span className="font-medium tracking-wide">Draw a rectangle to snip</span>
                                    <button
                                        onClick={() => { setIsSnippingMode(false); setIsSnipActive(false); setSnipRect(null); setSnipPopup(null); }}
                                        className="ml-4 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-xs font-bold transition-all border border-white/10 uppercase tracking-wider"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                            <div className="flex justify-center p-4 md:p-8">
                                <div className="relative">
                                    {error ? (
                                        <div className="p-8 text-center bg-destructive/10 border border-destructive/20 rounded-xl flex flex-col items-center gap-4">
                                            <p className="text-destructive font-medium">{error}</p>
                                            <button
                                                onClick={handleRetryDownload}
                                                disabled={isRetrying}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                                                {isRetrying ? 'Retrying…' : 'Retry Download'}
                                            </button>
                                        </div>
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
                                                        isLoading={isLoading}
                                                        isSaving={isSavingNote}
                                                        onClose={() => { setSnipPopup(null); setIsSnipActive(false); }}
                                                        onSend={handleMenuSend}
                                                        onAddToInput={handleMenuAddToInput}
                                                        onSaveNote={handleSaveNote}
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
                                                disabled={isLoading}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors group ${isLoading ? 'opacity-50 cursor-not-allowed text-zinc-500' : 'text-zinc-200 hover:text-white hover:bg-zinc-800'}`}
                                            >
                                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : <Sparkles className="w-4 h-4 text-[#53d22d]" />}
                                                <span>Explain</span>
                                            </button>

                                            <div className="w-px h-4 bg-zinc-700 mx-1" />

                                            <button
                                                onClick={handleCopyText}
                                                disabled={isLoading}
                                                className={`p-1.5 rounded-md transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed text-zinc-500' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                                                title="Copy"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>

                                            <div className="w-px h-4 bg-zinc-700 mx-1" />

                                            <button
                                                onClick={() => {
                                                    const text = selectionMenu?.text || '';
                                                    if (text) void handleSaveTextNote(text);
                                                    setSelectionMenu(null);
                                                    setShowMoreMenu(false);
                                                }}
                                                disabled={isSavingNote}
                                                className="relative group p-1.5 rounded-md transition-colors text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 disabled:opacity-60"
                                                title="Add to notes"
                                            >
                                                {isSavingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                                                <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-xs text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg border border-zinc-800">
                                                    Add to notes
                                                </span>
                                            </button>

                                            <div className="w-px h-4 bg-zinc-700 mx-1" />

                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (!isLoading) setShowMoreMenu(!showMoreMenu);
                                                }}
                                                onTouchEnd={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (!isLoading) setShowMoreMenu(!showMoreMenu);
                                                }}
                                                disabled={isLoading}
                                                className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed text-zinc-500' : showMoreMenu ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
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
                                                        disabled={isLoading}
                                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group ${isLoading ? 'opacity-50 cursor-not-allowed text-zinc-500' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}
                                                    >
                                                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : <BookOpen className="w-4 h-4 text-zinc-400 group-hover:text-blue-400" />}
                                                        <span>Define</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleAIRequest('example')}
                                                        disabled={isLoading}
                                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group ${isLoading ? 'opacity-50 cursor-not-allowed text-zinc-500' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}
                                                    >
                                                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : <Lightbulb className="w-4 h-4 text-zinc-400 group-hover:text-yellow-400" />}
                                                        <span>Example</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleAIRequest('summarize')}
                                                        disabled={isLoading}
                                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group ${isLoading ? 'opacity-50 cursor-not-allowed text-zinc-500' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}
                                                    >
                                                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : <ListChecks className="w-4 h-4 text-zinc-400 group-hover:text-orange-400" />}
                                                        <span>Summarize</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleAIRequest('answer')}
                                                        disabled={isLoading}
                                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group ${isLoading ? 'opacity-50 cursor-not-allowed text-zinc-500' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}
                                                    >
                                                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : <MessageSquare className="w-4 h-4 text-zinc-400 group-hover:text-purple-400" />}
                                                        <span>Answer</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleAIRequest('memory')}
                                                        disabled={isLoading}
                                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group ${isLoading ? 'opacity-50 cursor-not-allowed text-zinc-500' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}
                                                    >
                                                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : <Brain className="w-4 h-4 text-zinc-400 group-hover:text-pink-400" />}
                                                        <span>Memory Aid</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {noteSavedFlash && (
                                        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2 flex items-center gap-2">
                                            <BookmarkPlus className="w-3.5 h-3.5" />
                                            Note saved
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Chat Container (Mobile) */}
                        <div className={`flex-1 h-full bg-background ${activeTab === 'chat' ? 'block' : 'hidden'} lg:hidden`}>
                            {renderChatUI(true)}
                        </div>

                        {/* Chat Sidebar (Desktop) - flex-based, pushes PDF */}
                        {isSidebarOpen && (
                            <div className="hidden lg:flex w-96 flex-shrink-0 h-full border-l border-border bg-card animate-in slide-in-from-right duration-300">
                                {renderChatUI(false)}
                            </div>
                        )}

                        {/* Mobile Floating Pill — Snip & Notes (appears on tap, fades after 3s) */}
                        {activeTab === 'document' && (
                            <div
                                className={`lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40 transition-all duration-500 ${showMobilePill ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
                            >
                                <div className="flex items-center gap-1 p-1.5 bg-card border border-border rounded-full shadow-xl">
                                    {/* Page number chip */}
                                    {numPages > 0 && (
                                        <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                                            <FileText className="w-3.5 h-3.5" />
                                            {currentPage}/{numPages}
                                        </span>
                                    )}
                                    <div className="w-px h-5 bg-border mx-0.5" />
                                    <button
                                        onClick={() => {
                                            const nextSnipMode = !isSnippingMode;
                                            setIsSnippingMode(nextSnipMode);
                                            setIsSnipActive(nextSnipMode);
                                            setSnipRect(null);
                                            setSnipPopup(null);
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${isSnippingMode
                                            ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                                            : 'text-foreground hover:bg-muted'
                                            }`}
                                    >
                                        <Scissors className="w-4 h-4" />
                                        {isSnippingMode ? 'Cancel' : 'Snip'}
                                    </button>
                                    <div className="w-px h-5 bg-border mx-0.5" />
                                    <button
                                        onClick={() => {
                                            toggleNotesPanel();
                                            setShowMobilePill(false);
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${notesOpen
                                            ? 'bg-primary/10 text-primary border border-primary/20'
                                            : 'text-foreground hover:bg-muted'
                                            }`}
                                    >
                                        <BookOpen className="w-4 h-4" />
                                        Notes
                                        {notes.length > 0 && (
                                            <span className="ml-0.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{notes.length}</span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        <PDFViewerNotesPanel
                            copiedNotes={copiedNotes}
                            deletingNoteId={deletingNoteId}
                            editingNoteId={editingNoteId}
                            editingText={editingText}
                            expandedNotes={expandedNotes}
                            isExporting={isExporting}
                            isLoadingNotes={isLoadingNotes}
                            isOpen={notesOpen}
                            isSavingEdit={isSavingEdit}
                            isSavingNote={isSavingNote}
                            isSavingPersonal={isSavingPersonal}
                            notes={notes}
                            onClose={() => setNotesOpen(false)}
                            onCopyNotes={() => {
                                const text = notes
                                    .map(
                                        (note) =>
                                            `[${note.category || 'Key Point'}] ${note.ai_explanation || note.user_annotation || ''}${note.page_number ? ` (p.${note.page_number})` : ''}`
                                    )
                                    .join('\n\n');
                                navigator.clipboard.writeText(text).then(() => {
                                    setCopiedNotes(true);
                                    setTimeout(() => setCopiedNotes(false), 2000);
                                });
                            }}
                            onDeleteNote={(noteId) => {
                                void handleDeleteNote(String(noteId));
                            }}
                            onEditingTextChange={setEditingText}
                            onExportPdf={exportNotesPDF}
                            onPersonalNoteChange={setPersonalNote}
                            onSaveEdit={(noteId) => handleUpdateNote(noteId)}
                            onSavePersonalNote={handleSavePersonalNote}
                            onSetEditingNoteId={setEditingNoteId}
                            onSetEditingText={setEditingText}
                            onStartEdit={(note) => {
                                setEditingNoteId(String(note.id));
                                setEditingText(note.user_annotation || '');
                            }}
                            onToggleExpanded={toggleNoteExpanded}
                            personalNote={personalNote}
                        />
                    </div>
                    <PDFViewerSelectedImageModal
                        image={selectedImage}
                        onClose={() => setSelectedImage(null)}
                    />
                </>
            )}
        </div>
    );
}

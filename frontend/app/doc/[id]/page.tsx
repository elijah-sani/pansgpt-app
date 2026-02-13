"use client";

import { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import SlideRenderer, { SlideData } from '@/components/SlideRenderer';

interface DocumentPageProps {
    params: Promise<{
        id: string;
    }>;
}

// --- TYPE DEFINITIONS FOR JSON STRUCTURE ---
interface DocumentJSON {
    metadata?: {
        filename: string;
        subject: string;
        total_pages: number;
        processed_at: string;
    };
    pages: SlideData[];
}

export default function DocumentPage({ params }: DocumentPageProps) {
    const { id } = use(params);

    const [doc, setDoc] = useState<any>(null);
    const [slides, setSlides] = useState<SlideData[]>([]);
    const [metadata, setMetadata] = useState<DocumentJSON['metadata'] | null>(null);
    const [loading, setLoading] = useState(true);
    const [parseError, setParseError] = useState<string | null>(null);

    // Flashcard State (for Desktop)
    const [currentSlide, setCurrentSlide] = useState(0);

    // --- 1. FETCH & PARSE JSON ---
    useEffect(() => {
        const fetchDoc = async () => {
            const { data, error } = await supabase
                .from('documents')
                .select('*')
                .eq('id', id)
                .single();

            if (data) {
                setDoc(data);

                // Try to parse as JSON (Hybrid Layout format)
                try {
                    const parsed: DocumentJSON = JSON.parse(data.content);

                    if (parsed.pages && Array.isArray(parsed.pages)) {
                        setSlides(parsed.pages);
                        setMetadata(parsed.metadata || null);
                    } else {
                        // Fallback: Treat as single slide with raw content
                        setSlides([{
                            page_number: 1,
                            heading: data.filename || 'Document',
                            slots: { slot_1: data.content },
                        }]);
                    }
                } catch (e) {
                    // Legacy format: Create a single standard slide
                    setSlides([{
                        page_number: 1,
                        heading: data.filename?.replace('.pdf', '') || 'Document',
                        raw_text: [data.content],
                    }]);
                    setParseError("Legacy format - displaying as single page");
                }
            }
            setLoading(false);
        };

        fetchDoc();
    }, [id]);

    // --- 2. KEYBOARD NAVIGATION (Desktop Flashcard Mode) ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (slides.length === 0) return;

            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                nextSlide();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                prevSlide();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentSlide, slides.length]);

    const nextSlide = () => {
        if (currentSlide < slides.length - 1) {
            setCurrentSlide(prev => prev + 1);
        }
    };

    const prevSlide = () => {
        if (currentSlide > 0) {
            setCurrentSlide(prev => prev - 1);
        }
    };

    // --- LOADING STATE ---
    if (loading) return (
        <div className="flex min-h-screen items-center justify-center bg-white">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
        </div>
    );

    if (!doc) return (
        <div className="flex min-h-screen items-center justify-center bg-white">
            <p className="text-gray-900">Document not found</p>
        </div>
    );

    if (slides.length === 0) return (
        <div className="flex min-h-screen items-center justify-center bg-white">
            <p className="text-gray-900">No content available</p>
        </div>
    );

    return (
        <div className="flex min-h-screen flex-col bg-white font-sans">

            {/* HEADER */}
            <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                    <Link href="/" className="rounded-full p-2 text-gray-500 hover:bg-gray-100 transition-colors">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div>
                        <h1 className="max-w-[200px] truncate text-sm font-bold text-gray-900 sm:max-w-md sm:text-base">
                            {metadata?.filename?.replace('.pdf', '') || doc.filename?.replace('.pdf', '') || 'Document'}
                        </h1>
                        <p className="text-xs text-gray-500">{metadata?.subject || doc.subject || 'General'}</p>
                    </div>
                </div>

                {/* Page count badge */}
                <div className="hidden sm:flex items-center gap-2">
                    {parseError && (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">Legacy</span>
                    )}
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                        {slides.length} {slides.length === 1 ? 'page' : 'pages'}
                    </span>
                </div>
            </header>

            {/* --- MOBILE LAYOUT (Vertical Scroll Mode) --- */}
            <div className="block md:hidden">
                <main className="flex flex-col items-center p-4 bg-white">
                    {slides.map((slide, index) => (
                        <div key={index} className="mb-8 w-full max-w-3xl">
                            {/* Page Number Badge */}
                            <div className="mb-2 flex items-center gap-2 pl-2">
                                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    Page {slide.page_number || index + 1}
                                </span>
                            </div>

                            {/* Slide Card */}
                            <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-gray-200">
                                <div className="min-h-[40vh] p-6">
                                    <SlideRenderer slide={slide} />
                                </div>
                            </div>
                        </div>
                    ))}

                    <div className="pb-10 pt-4 text-center text-sm text-gray-400">
                        End of Document
                    </div>
                </main>
            </div>

            {/* --- DESKTOP LAYOUT (Flashcard Mode) --- */}
            <div className="hidden min-h-[calc(100vh-64px)] w-full flex-col items-center justify-start p-8 md:flex bg-gray-50">

                {/* Slide Container with Fixed Min Height */}
                <div className="relative w-full max-w-5xl">
                    {/* Main Card - Fixed Min Height */}
                    <div className="min-h-[60vh] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-200">
                        <div className="p-8 md:p-12">
                            <SlideRenderer slide={slides[currentSlide]} />
                        </div>
                    </div>
                </div>

                {/* Previous Button */}
                <button
                    onClick={prevSlide}
                    disabled={currentSlide === 0}
                    className="fixed left-4 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white p-4 text-gray-700 shadow-lg transition-all hover:scale-110 hover:bg-gray-50 hover:text-indigo-600 disabled:pointer-events-none disabled:opacity-0"
                    aria-label="Previous page"
                >
                    <ChevronLeft className="h-8 w-8" />
                </button>

                {/* Next Button */}
                <button
                    onClick={nextSlide}
                    disabled={currentSlide === slides.length - 1}
                    className="fixed right-4 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white p-4 text-gray-700 shadow-lg transition-all hover:scale-110 hover:bg-gray-50 hover:text-indigo-600 disabled:pointer-events-none disabled:opacity-0"
                    aria-label="Next page"
                >
                    <ChevronRight className="h-8 w-8" />
                </button>

                {/* Progress Badge */}
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-6 py-2 text-sm font-medium text-white shadow-lg">
                    Page {currentSlide + 1} of {slides.length}
                </div>

            </div>

        </div>
    );
}


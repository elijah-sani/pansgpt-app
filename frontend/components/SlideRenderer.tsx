"use client";

import React, { useState } from 'react';
import { X, Maximize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// --- TYPE DEFINITIONS ---
interface Block {
    type: 'heading' | 'text' | 'bullets' | 'image' | 'image_grid' | 'table' | 'fallback_image' | 'title';
    content?: string;
    items?: string[];
    url?: string;
    urls?: string[];  // For image_grid
    caption?: string;
}

interface RawImage {
    url: string;
    index?: number;
}

interface SlideData {
    page_number: number;
    page_image_url?: string;
    blocks?: Block[];
    // Legacy support
    heading?: string;
    slots?: { slot_1?: string; slot_2?: string };
    raw_text?: string[];
    raw_images?: RawImage[];
    error?: string;
}

interface SlideRendererProps {
    slide: SlideData;
}

// --- IMAGE MODAL (POP-UP ZOOM) ---
const ImageModal = ({
    imageUrl,
    onClose,
    title
}: {
    imageUrl: string;
    onClose: () => void;
    title?: string;
}) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
        />
        <div className="relative max-h-[90vh] max-w-5xl animate-in zoom-in-95 duration-200">
            <button
                onClick={onClose}
                className="absolute -right-3 -top-3 z-10 rounded-full bg-white p-2 shadow-xl hover:bg-gray-100"
            >
                <X className="h-5 w-5 text-gray-700" />
            </button>
            {title && (
                <div className="absolute -top-10 left-0 right-0 text-center text-sm font-medium text-white">
                    {title}
                </div>
            )}
            <img
                src={imageUrl}
                alt="Zoomed slide"
                className="max-h-[85vh] w-auto rounded-xl shadow-2xl"
            />
        </div>
    </div>
);

// --- VIEW ORIGINAL SLIDE - COMPACT THUMBNAIL (just the image, tooltip on hover) ---
const OriginalSlideThumbnail = ({ imageUrl, pageNumber }: { imageUrl: string; pageNumber: number }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <div
                onClick={() => setIsOpen(true)}
                title={`View Original Slide - Page ${pageNumber}`}
                className="group relative h-12 w-16 cursor-pointer overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-50 shadow-sm transition-all hover:border-indigo-400 hover:shadow-md"
            >
                <img
                    src={imageUrl}
                    alt={`Original slide ${pageNumber}`}
                    className="h-full w-full object-cover object-top"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                    <Maximize2 className="h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                {/* Tooltip on hover */}
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                    View Original
                </div>
            </div>

            {isOpen && (
                <ImageModal
                    imageUrl={imageUrl}
                    onClose={() => setIsOpen(false)}
                    title={`Original Slide - Page ${pageNumber}`}
                />
            )}
        </>
    );
};

// --- SLIDE CARD (INTERACTIVE POP-UP IMAGE) ---
const SlideCard = ({ imageUrl, caption, compact = false }: { imageUrl: string; caption?: string; compact?: boolean }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <div
                onClick={() => setIsOpen(true)}
                className={`group relative cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition-all hover:border-indigo-300 hover:shadow-lg ${compact ? 'p-2' : ''}`}
            >
                <img
                    src={imageUrl}
                    alt={caption || "Slide image"}
                    className={`mx-auto w-auto transition-transform duration-300 group-hover:scale-[1.02] ${compact ? 'max-h-[200px]' : 'max-h-[400px] p-3'}`}
                />
                <div className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-3 w-3 text-indigo-600" />
                </div>
            </div>
            {caption && (
                <p className="mt-1 text-center text-xs text-gray-500">{caption}</p>
            )}
            {isOpen && <ImageModal imageUrl={imageUrl} onClose={() => setIsOpen(false)} />}
        </>
    );
};

// --- MARKDOWN RENDERER (with Math & Tables support) - LARGER FONTS ---
const MarkdownContent = ({ content }: { content: string }) => (
    <div className="prose prose-xl max-w-none text-gray-900 
                    prose-p:text-lg prose-p:leading-relaxed
                    prose-table:border prose-table:border-gray-300
                    prose-th:border prose-th:border-gray-300 prose-th:bg-gray-100 prose-th:p-2
                    prose-td:border prose-td:border-gray-300 prose-td:p-2">
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
        >
            {content}
        </ReactMarkdown>
    </div>
);

// --- BLOCK RENDERERS ---

// Title Block - CENTERED horizontally and vertically (for title slides)
const TitleBlock = ({ content }: { content: string }) => (
    <div className="flex min-h-[40vh] items-center justify-center text-center">
        <h1 className="text-3xl font-bold text-gray-900 md:text-4xl lg:text-5xl">
            {content}
        </h1>
    </div>
);

// Heading Block - Larger typography
const HeadingBlock = ({ content }: { content: string }) => (
    <h2 className="text-2xl font-bold text-gray-900 md:text-3xl lg:text-4xl">
        {content}
    </h2>
);

// Text Block - Larger prose styling
const TextBlock = ({ content }: { content: string }) => (
    <MarkdownContent content={content} />
);

// Bullets Block - Larger, tighter spacing
const BulletsBlock = ({ items }: { items: string[] }) => (
    <ul className="space-y-2 pl-1">
        {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-3 text-gray-900">
                <span className="mt-2.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-indigo-500" />
                <span className="text-lg leading-relaxed md:text-xl">{item}</span>
            </li>
        ))}
    </ul>
);

// Image Block - Single image
const ImageBlock = ({ url, caption }: { url: string; caption?: string }) => (
    <SlideCard imageUrl={url} caption={caption} />
);

// Image Grid Block - Multiple small images in a responsive grid
const ImageGridBlock = ({ urls, caption }: { urls: string[]; caption?: string }) => {
    // Determine grid columns based on number of images
    const gridCols = urls.length <= 2 ? 'grid-cols-2' : urls.length <= 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3';

    return (
        <div>
            <div className={`grid gap-3 ${gridCols}`}>
                {urls.map((url, idx) => (
                    <SlideCard key={idx} imageUrl={url} compact={true} />
                ))}
            </div>
            {caption && (
                <p className="mt-2 text-center text-sm text-gray-500">{caption}</p>
            )}
        </div>
    );
};

// Table Block - Full markdown table
const TableBlock = ({ content }: { content: string }) => (
    <div className="overflow-x-auto">
        <MarkdownContent content={content} />
    </div>
);

// --- RENDER A SINGLE BLOCK ---
const BlockRenderer = ({ block }: { block: Block }) => {
    switch (block.type) {
        case 'title':
            return block.content ? <TitleBlock content={block.content} /> : null;

        case 'heading':
            return block.content ? <HeadingBlock content={block.content} /> : null;

        case 'text':
            return block.content ? <TextBlock content={block.content} /> : null;

        case 'bullets':
            return block.items && block.items.length > 0 ? <BulletsBlock items={block.items} /> : null;

        case 'image':
            return block.url ? <ImageBlock url={block.url} caption={block.caption} /> : null;

        case 'image_grid':
            return block.urls && block.urls.length > 0 ? <ImageGridBlock urls={block.urls} caption={block.caption} /> : null;

        case 'table':
            return block.content ? <TableBlock content={block.content} /> : null;

        case 'fallback_image':
            // Handled by View Original button
            return null;

        default:
            return null;
    }
};

// --- LEGACY FALLBACK (for old format without blocks) ---
const LegacyContent = ({ slide }: { slide: SlideData }) => {
    const textContent = slide.slots?.slot_1 || slide.raw_text?.join('\n') || '';

    return (
        <>
            {slide.heading && (
                <h2 className="text-2xl font-bold text-gray-900 md:text-3xl">{slide.heading}</h2>
            )}

            {textContent && <MarkdownContent content={textContent} />}

            {slide.raw_images && slide.raw_images.length > 0 && (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
                    {slide.raw_images.map((img, idx) => (
                        <SlideCard key={idx} imageUrl={img.url} compact={true} />
                    ))}
                </div>
            )}
        </>
    );
};

// --- MAIN SLIDE RENDERER ---
export default function SlideRenderer({ slide }: SlideRendererProps) {
    const hasBlocks = slide.blocks && Array.isArray(slide.blocks) && slide.blocks.length > 0;

    // Check if this is a title-only slide (centered)
    const isTitleSlide = hasBlocks &&
        slide.blocks!.length === 1 &&
        (slide.blocks![0].type === 'title' || slide.blocks![0].type === 'heading');

    return (
        <div className={`flex flex-col gap-4 ${isTitleSlide ? 'justify-center min-h-[50vh]' : ''}`}>
            {/* Main content */}
            {hasBlocks ? (
                slide.blocks!.map((block, idx) => (
                    <BlockRenderer key={idx} block={block} />
                ))
            ) : (
                <LegacyContent slide={slide} />
            )}

            {/* View Original Slide - compact thumbnail in corner */}
            {slide.page_image_url && (
                <div className="mt-2 flex justify-end">
                    <OriginalSlideThumbnail
                        imageUrl={slide.page_image_url}
                        pageNumber={slide.page_number}
                    />
                </div>
            )}
        </div>
    );
}

// Export types and components
export { SlideCard };
export type { SlideData, Block, RawImage };

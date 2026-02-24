import React, { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

interface MarkdownWithMathProps {
  content: string;
  role?: 'user' | 'system' | 'model';
}

// Slide image token structure
interface SlideImageData {
  url: string;
  caption: string;
  context: string;
}

// Component to render a slide image with caption and expandable context
function SlideImage({ url, caption, context }: SlideImageData) {
  const [expanded, setExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
      {/* Image */}
      <div className="relative bg-gray-100 dark:bg-black/20">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-pulse text-gray-400 dark:text-white/30">Loading image...</div>
          </div>
        )}
        {imageError ? (
          <div className="flex items-center justify-center p-8 text-gray-400 dark:text-white/30">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <p className="text-sm">Image unavailable</p>
            </div>
          </div>
        ) : (
          <img
            src={url}
            alt={caption}
            className={`w-full max-h-96 object-contain ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}
      </div>

      {/* Caption and Context */}
      <div className="p-3">
        <p className="text-sm font-medium text-gray-700 dark:text-white/80">{caption}</p>

        {context && context.length > 0 && !context.includes('[AI analysis') && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
            >
              {expanded ? '▼ Hide' : '▶ View'} AI Description
            </button>

            {expanded && (
              <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-xs text-gray-600 dark:text-white/60 leading-relaxed">
                {context}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Parse slide image tokens from content
function parseSlideImageTokens(content: string): { parts: (string | SlideImageData)[]; hasImages: boolean } {
  // More flexible regex to handle multi-line context
  const tokenRegex = /<<SLIDE_IMAGE:\s*url="([^"]+)"\s*caption="([^"]+)"\s*context="([\s\S]*?)">>/g;
  const parts: (string | SlideImageData)[] = [];
  let lastIndex = 0;
  let match;
  let hasImages = false;

  while ((match = tokenRegex.exec(content)) !== null) {
    hasImages = true;

    // Add text before this token
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    // Clean up the context - remove markdown headers and "Image Analysis:" prefix
    let cleanedContext = (match[3] || '')
      .replace(/^#+\s*.*/gm, '')  // Remove markdown headers entirely
      .replace(/Image Analysis:\s*/gi, '')  // Remove "Image Analysis:" prefix
      .replace(/Analysis of.*?Image\s*/gi, '')  // Remove "Analysis of X Image" prefix  
      .replace(/Pharmacy Slide Image\s*/gi, '')  // Remove specific phrases
      .trim();

    // Add the image data
    parts.push({
      url: match[1],
      caption: match[2],
      context: cleanedContext,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return { parts, hasImages };
}


// Auto-convert <sub>...</sub> and <sup>...</sup> to LaTeX math
function htmlSubSupToLatex(markdown: string): string {
  // Replace <sub>...</sub> with _{...} inside $...$
  markdown = markdown.replace(/([A-Za-z0-9\)\]\-\+])<sub>(.*?)<\/sub>/g, '$$$1_{$2}$$');
  // Replace <sup>...</sup> with ^{...} inside $...$
  markdown = markdown.replace(/([A-Za-z0-9\)\]\-\+])<sup>(.*?)<\/sup>/g, '$$$1^{$2}$$');
  // Collapse multiple adjacent $...$ into one (for inline math)
  markdown = markdown.replace(/\$\$([^\$]+)\$\$\s*\$\$([^\$]+)\$\$/g, '$$$1 $2$$');
  return markdown;
}

// Strip AI-generated headers from text content (for existing documents)
function stripAIHeaders(text: string): string {
  return text
    .replace(/^\*\*Image Analysis:\*\*.*$/gm, '')  // **Image Analysis:** headers
    .replace(/^>\s*\*\*Image Analysis:\*\*.*$/gm, '')  // > **Image Analysis:** blockquotes
    .replace(/^Image Analysis:\s*##.*$/gm, '')  // Image Analysis: ## headers
    .replace(/^## (Analysis of|Transcribed Content).*$/gm, '')  // ## Analysis headers
    .replace(/^### (Transcription|Image Content).*$/gm, '')  // ### sub-headers
    .replace(/\n{3,}/g, '\n\n')  // Clean up extra blank lines
    .trim();
}


const MarkdownWithMath: React.FC<MarkdownWithMathProps> = React.memo(({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // First, parse out any slide image tokens
  const { parts, hasImages } = parseSlideImageTokens(content);

  // If no images, use the simple path
  if (!hasImages) {
    let processedContent = stripAIHeaders(content);
    // Unescape any doubly-escaped backslashes (from JSON serialization)
    processedContent = processedContent.replace(/\\\\/g, '\\');
    processedContent = htmlSubSupToLatex(processedContent);
    processedContent = processedContent.replace(/<br\s*\/?>/gi, '\n');

    return (
      <div className="markdown-math text-sm sm:text-base" ref={containerRef}>
        <ReactMarkdown
          remarkPlugins={[[remarkMath, { singleDollarTextMath: true }], remarkGfm]}
          rehypePlugins={[rehypeKatex]}
          skipHtml={false}
          components={{
            table: ({ children }) => (
              <div className="table-wrapper">
                <table className="w-full">{children}</table>
              </div>
            ),
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    );
  }

  // Render with images
  return (
    <div className="markdown-math text-sm sm:text-base" ref={containerRef}>
      {parts.map((part, index) => {
        if (typeof part === 'string') {
          // Text part - render as markdown
          let processedContent = stripAIHeaders(part);
          // Unescape any doubly-escaped backslashes (from JSON serialization)
          processedContent = processedContent.replace(/\\\\/g, '\\');
          processedContent = htmlSubSupToLatex(processedContent);
          processedContent = processedContent.replace(/<br\s*\/?>/gi, '\n');

          return (
            <ReactMarkdown
              key={index}
              remarkPlugins={[[remarkMath, { singleDollarTextMath: true }], remarkGfm]}
              rehypePlugins={[rehypeKatex]}
              skipHtml={false}
              components={{
                table: ({ children }) => (
                  <div className="table-wrapper">
                    <table className="w-full">{children}</table>
                  </div>
                ),
              }}
            >
              {processedContent}
            </ReactMarkdown>
          );
        } else {
          // Image part - render SlideImage component
          return <SlideImage key={index} {...part} />;
        }
      })}
    </div>
  );
});

export default MarkdownWithMath;
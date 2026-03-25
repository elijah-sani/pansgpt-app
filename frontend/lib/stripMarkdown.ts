/**
 * Strips markdown formatting from a string, returning plain text.
 * Used for copy-to-clipboard and add-to-note actions.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/gm, '')              // ## Headers
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')     // ***bold italic***
    .replace(/\*\*(.+?)\*\*/g, '$1')          // **bold**
    .replace(/\*(.+?)\*/g, '$1')              // *italic*
    .replace(/_(.+?)_/g, '$1')                // _italic_
    .replace(/~~(.+?)~~/g, '$1')              // ~~strikethrough~~
    .replace(/`{3}[\s\S]*?`{3}/g, (m) =>     // ```code blocks``` — keep content
      m.replace(/`{3}[^\n]*\n?/g, '').replace(/`{3}/g, '').trim()
    )
    .replace(/`(.+?)`/g, '$1')                // `inline code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [links](url)
    .replace(/^[-*+]\s+/gm, '')               // - bullet lists
    .replace(/^\d+\.\s+/gm, '')               // 1. numbered lists
    .replace(/^>\s+/gm, '')                   // > blockquotes
    .replace(/^[-_*]{3,}$/gm, '')             // --- horizontal rules
    .replace(/\n{3,}/g, '\n\n')               // collapse excess newlines
    .trim();
}

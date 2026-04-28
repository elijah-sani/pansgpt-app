"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { type PartialBlock } from "@blocknote/core";
import {
  BlockNoteViewRaw as BlockNoteViewDynamic,
  type DefaultReactSuggestionItem,
  type SuggestionMenuProps,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { BlockNoteContent } from "../../types/types";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/react/style.css";

export interface RichNoteEditorProps {
  initialContent?: BlockNoteContent;
  onChange: (content: BlockNoteContent) => void;
  onCursorSourceChange?: (source: {
    page?: number;
    rect?: { x: number; y: number; w: number; h: number };
    quote?: string;
  } | null) => void;
  placeholder?: string;
  compact?: boolean;
  editable?: boolean;
}

const getBlockText = (block: PartialBlock | undefined): string => {
  if (!block || !Array.isArray(block.content)) return "";

  return block.content
    .map((item) => {
      if (
        item &&
        typeof item === "object" &&
        "type" in item &&
        (item as { type?: string }).type === "text" &&
        "text" in item &&
        typeof (item as { text?: unknown }).text === "string"
      ) {
        return (item as { text: string }).text;
      }
      return "";
    })
    .join("");
};

function LocalSlashMenu({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
  menuWidth,
}: SuggestionMenuProps<DefaultReactSuggestionItem> & {
  menuWidth: number;
}) {

  return (
    <div
      id="bn-suggestion-menu"
      className="bn-suggestion-menu max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-primary p-1 shadow-lg"
      style={{ width: `${menuWidth}px`, minWidth: `${menuWidth}px` }}
    >
      {items.map((item, index) => {
        const previousGroup = index > 0 ? items[index - 1].group : undefined;
        const showGroupLabel = item.group !== previousGroup;
        const isSelected = index === selectedIndex;

        return (
          <React.Fragment key={`${item.title}-${index}`}>
            {showGroupLabel && (
              <div className="bn-suggestion-menu-label px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                {item.group}
              </div>
            )}
            <button
              id={`bn-suggestion-menu-item-${index}`}
              type="button"
              className={`bn-suggestion-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                isSelected
                  ? "bg-foreground/8 text-foreground"
                  : "text-foreground/90 hover:bg-foreground/5"
              }`}
              aria-selected={isSelected}
              onClick={() => onItemClick?.(item)}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border/70 bg-surface-secondary text-foreground/80">
                {item.icon ? item.icon : null}
              </span>
              <span className="truncate text-sm">{item.title}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                Enter
              </span>
            </button>
          </React.Fragment>
        );
      })}
      {items.length === 0 && loadingState === "loaded" ? (
        <div className="bn-suggestion-menu-item px-2 py-1.5 text-sm text-muted-foreground">
          No commands found
        </div>
      ) : null}
    </div>
  );
}

export default function RichNoteEditor({
  initialContent,
  onChange,
  onCursorSourceChange,
  placeholder = "Start writing your note...",
  compact = false,
  editable = true,
}: RichNoteEditorProps) {
  const { theme } = useTheme();
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const [slashMenuWidth, setSlashMenuWidth] = useState<number>(220);

  // Explicitly resolve theme since BlockNote expects "light" or "dark"
  const resolvedTheme = theme === "dark" ? "dark" : "light";

  const parsedInitialContent = Array.isArray(initialContent)
    ? (initialContent as PartialBlock[])
    : undefined;

  const isLegacyEmptyBullet =
    parsedInitialContent?.length === 1 &&
    parsedInitialContent[0].type === "bulletListItem" &&
    (!Array.isArray(parsedInitialContent[0].content) ||
      parsedInitialContent[0].content.length === 0) &&
    (!Array.isArray(parsedInitialContent[0].children) ||
      parsedInitialContent[0].children.length === 0);

  const isSlashOnlyContent =
    parsedInitialContent?.length === 1 &&
    (!Array.isArray(parsedInitialContent[0].children) ||
      parsedInitialContent[0].children.length === 0) &&
    getBlockText(parsedInitialContent[0]).trim() === "/";

  const safeInitialContent: PartialBlock[] | undefined =
    parsedInitialContent &&
    parsedInitialContent.length > 0 &&
    !isLegacyEmptyBullet &&
    !isSlashOnlyContent
      ? parsedInitialContent
      : undefined;

  // Initialize the editor
  const editor = useCreateBlockNote({
    initialContent: safeInitialContent,
    placeholders: {
      default: placeholder,
      emptyDocument: placeholder,
    },
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allowedSlashCommandKeys = useMemo(
    () =>
      new Set([
        "paragraph",
        "heading",
        "heading_2",
        "heading_3",
        "bullet_list",
        "numbered_list",
        "check_list",
        "quote",
        "code_block",
        "divider",
      ]),
    [],
  );

  const slashItems = useMemo(() => {
    return getDefaultReactSlashMenuItems(editor).filter((item) =>
      allowedSlashCommandKeys.has(
        (item as DefaultReactSuggestionItem & { key?: string }).key || "",
      ),
    );
  }, [allowedSlashCommandKeys, editor]);

  // Debounce the onChange handler to prevent excessive saves
  const handleChange = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      if (onChange) {
        onChange(editor.document as BlockNoteContent);
      }
    }, 1500);
  }, [editor, onChange]);

  const readSourceFromCurrentBlock = useCallback(() => {
    if (!onCursorSourceChange) return;

    try {
      const selection = (editor.getSelection?.() as { blocks?: unknown[] } | undefined) ?? undefined;
      const selectedBlock =
        Array.isArray(selection?.blocks) && selection.blocks.length > 0
          ? (selection.blocks[0] as unknown)
          : undefined;

      const cursor = editor.getTextCursorPosition();
      const cursorBlock = cursor?.block as unknown;

      const block =
        (selectedBlock as { type?: string; props?: Record<string, unknown>; content?: unknown[] } | undefined) ??
        (cursorBlock as { type?: string; props?: Record<string, unknown>; content?: unknown[] } | undefined);
      if (!block) {
        onCursorSourceChange(null);
        return;
      }
      const props = block?.props;
      const sourcePage = Number(props?.source_page);

      let rect: { x: number; y: number; w: number; h: number } | undefined;
      const rectValue = props?.source_rect;
      if (rectValue && typeof rectValue === "object") {
        const map = rectValue as Record<string, unknown>;
        const x = Number(map.x);
        const y = Number(map.y);
        const w = Number(map.w);
        const h = Number(map.h);
        if ([x, y, w, h].every((n) => Number.isFinite(n))) {
          rect = { x, y, w, h };
        }
      }

      const quoteFromProps =
        typeof props?.source_quote === "string" ? props.source_quote.trim() : "";
      const quoteFromContent = Array.isArray(block?.content)
        ? block.content
            .map((item) => {
              if (item && typeof item === "object") {
                const entry = item as Record<string, unknown>;
                if (entry.type === "text" && typeof entry.text === "string") {
                  return entry.text;
                }
              }
              return "";
            })
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        : "";
      const blockType = typeof block.type === "string" ? block.type : "";
      const fallbackQuote = blockType === "image" ? "Image snippet" : undefined;

      const payload = {
        ...(Number.isFinite(sourcePage) ? { page: sourcePage } : {}),
        ...(rect ? { rect } : {}),
        quote: quoteFromProps || quoteFromContent || fallbackQuote,
      };

      if (!payload.page && !payload.quote) {
        onCursorSourceChange(null);
        return;
      }

      onCursorSourceChange({
        ...payload,
      });
    } catch {
      onCursorSourceChange(null);
    }
  }, [editor, onCursorSourceChange]);

  // Clean up the timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    readSourceFromCurrentBlock();
  }, [editor, readSourceFromCurrentBlock]);

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const updateWidth = () => {
      setSlashMenuWidth(Math.max(160, Math.floor(container.clientWidth / 2)));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const SlashMenu = useCallback(
    (props: SuggestionMenuProps<DefaultReactSuggestionItem>) => (
      <LocalSlashMenu {...props} menuWidth={slashMenuWidth} />
    ),
    [slashMenuWidth],
  );

  return (
    <div
      ref={editorContainerRef}
      className={`w-full bg-transparent border-none outline-none ${
        compact ? "h-[200px] overflow-y-auto" : "h-full"
      }`}
    >
      <BlockNoteViewDynamic
        editor={editor}
        theme={resolvedTheme}
        editable={editable}
        onChange={handleChange}
        onSelectionChange={readSourceFromCurrentBlock}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterSuggestionItems(slashItems, query)}
          suggestionMenuComponent={SlashMenu}
        />
      </BlockNoteViewDynamic>
    </div>
  );
}

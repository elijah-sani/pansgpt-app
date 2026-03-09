export type ChatTextSize = 'small' | 'medium' | 'large';

export const WEB_SEARCH_DEFAULT_KEY = 'pansgpt-web-search-enabled';
export const CHAT_TEXT_SIZE_KEY = 'pansgpt-chat-text-size';

export const WEB_SEARCH_DEFAULT_EVENT = 'pansgpt:web-search-default-updated';
export const CHAT_TEXT_SIZE_EVENT = 'pansgpt:chat-text-size-updated';

export function dispatchWebSearchDefaultUpdated(enabled: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<boolean>(WEB_SEARCH_DEFAULT_EVENT, { detail: enabled }));
}

export function dispatchChatTextSizeUpdated(size: ChatTextSize) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<ChatTextSize>(CHAT_TEXT_SIZE_EVENT, { detail: size }));
}

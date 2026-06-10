/**
 * Shared PANSGPT support configuration.
 * All WhatsApp support links must be generated from this constant.
 */
export const SUPPORT_WHATSAPP_NUMBER = '2349042581125';

/**
 * Build a WhatsApp deep-link for the given prefilled message.
 * Opens wa.me with the support number and the URL-encoded message.
 */
export function buildWhatsAppSupportUrl(message: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

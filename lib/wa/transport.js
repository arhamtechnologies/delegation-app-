import { createGreenTransport } from './green';

/**
 * @typedef {{ sendText(chatId: string, text: string): Promise<void> }} WhatsAppTransport
 */

/** @returns {WhatsAppTransport} */
export function getTransport() {
  return createGreenTransport();
}

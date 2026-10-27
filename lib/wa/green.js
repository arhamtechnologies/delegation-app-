const maxMessageLength = 4000;

/** @returns {import('./transport').WhatsAppTransport} */
export function createGreenTransport() {
  return {
    async sendText(chatId, text) {
      const message = String(text).slice(0, maxMessageLength);
      if (process.env.WA_DRY_RUN === 'true') {
        console.log(`[WA_DRY_RUN] to ${chatId}:\n${message}`);
        return;
      }
      const { GREEN_API_URL, GREEN_ID_INSTANCE, GREEN_API_TOKEN } = process.env;
      if (!GREEN_API_URL || !GREEN_ID_INSTANCE || !GREEN_API_TOKEN) throw new Error('Green API is not configured.');
      const response = await fetch(`${GREEN_API_URL.replace(/\/+$/, '')}/waInstance${GREEN_ID_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message }),
        signal: AbortSignal.timeout(15000),
      });
      // Never log the URL: it contains the API token.
      if (!response.ok) throw new Error(`Green API sendMessage failed with status ${response.status}.`);
    },
  };
}

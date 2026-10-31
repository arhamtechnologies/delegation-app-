// Login-details email sent to new employees and, on request, to people who already have a login.
// It carries the username (their work email), the app link, and a one-time password setup link.

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function siteOrigin(request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/+$/, '');
}

export function buildCredentialEmail({ name, email, appUrl, setupUrl, isNew }) {
  const loginUrl = `${appUrl}/login`;
  const forgotUrl = `${appUrl}/forgot-password`;
  const intro = isNew
    ? 'Your administrator added you to the Delegation workspace.'
    : 'Here are your login details for the Delegation workspace.';
  const safe = { name: escapeHtml(name), email: escapeHtml(email), loginUrl: escapeHtml(loginUrl), setupUrl: escapeHtml(setupUrl), forgotUrl: escapeHtml(forgotUrl) };
  const cell = 'padding:6px 12px 6px 0;vertical-align:top;';

  return {
    subject: isNew ? 'Your Delegation account is ready' : 'Your Delegation login details',
    html: `<p>Hi ${safe.name},</p>
<p>${intro}</p>
<table style="border-collapse:collapse;margin:12px 0">
<tr><td style="${cell}color:#666">Username</td><td style="${cell}"><strong>${safe.email}</strong></td></tr>
<tr><td style="${cell}color:#666">App link</td><td style="${cell}"><a href="${safe.loginUrl}">${safe.loginUrl}</a></td></tr>
<tr><td style="${cell}color:#666">Password</td><td style="${cell}"><a href="${safe.setupUrl}">Set your password</a></td></tr>
</table>
<p>Open the password link to choose your password, then sign in at the app link with your username. The password link works once and expires soon. If it has expired, use <a href="${safe.forgotUrl}">Forgot password</a> on the sign-in page.</p>
<p>If you were not expecting this email, you can ignore it.</p>`,
    text: `Hi ${name},

${intro}

Username: ${email}
App link: ${loginUrl}
Set your password: ${setupUrl}

Open the password link to choose your password, then sign in at the app link with your username. The password link works once and expires soon. If it has expired, use Forgot password on the sign-in page: ${forgotUrl}

If you were not expecting this email, you can ignore it.`,
  };
}

function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { error: 'Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL on the server.' };
  return { apiKey, from };
}

async function resendError(response) {
  const details = await response.json().catch(() => ({}));
  console.error('Resend could not deliver a login-details email.', { status: response.status, name: details?.name, message: details?.message });
  const reason = typeof details?.message === 'string' && details.message.length <= 300 ? ` Resend: ${details.message}` : '';
  return `The email could not be sent.${reason} Check the Resend sender configuration and try again.`;
}

export const credentialBatchSize = 100; // Resend's per-request limit for /emails/batch

// Sends many emails through Resend's batch endpoint, one request per 100 emails.
// A failed request sends none of its chunk, so `sent` counts only earlier chunks.
export async function sendCredentialEmails(messages) {
  const config = resendConfig();
  if (config.error) return { error: config.error };
  for (let start = 0; start < messages.length; start += credentialBatchSize) {
    if (start > 0) await new Promise((resolve) => setTimeout(resolve, 600)); // Resend default: 2 requests/second
    const chunk = messages.slice(start, start + credentialBatchSize);
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map(({ to, subject, html, text }) => ({ from: config.from, to: [to], subject, html, text }))),
    });
    if (!response.ok) return { error: await resendError(response), sent: start };
  }
  return { success: true, sent: messages.length };
}

export async function sendCredentialEmail(message) {
  return sendCredentialEmails([message]);
}

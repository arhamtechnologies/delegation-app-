import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCredentialEmail, sendCredentialEmails } from '../lib/server/credential-email.mjs';

const base = { name: 'Asha <Ops>', email: 'asha@example.com', appUrl: 'https://task.arham.app', setupUrl: 'https://x.supabase.co/auth/v1/verify?token=abc&type=recovery' };

test('credential email: username, app link and password link in both html and text', () => {
  const email = buildCredentialEmail({ ...base, isNew: false });
  assert.equal(email.subject, 'Your Delegation login details');
  for (const body of [email.html, email.text]) {
    assert.match(body, /asha@example\.com/);
    assert.match(body, /https:\/\/task\.arham\.app\/login/);
    assert.match(body, /https:\/\/task\.arham\.app\/forgot-password/);
  }
  assert.match(email.text, /Username: asha@example\.com\nApp link: https:\/\/task\.arham\.app\/login\nSet your password: https:\/\/x\.supabase\.co\/auth\/v1\/verify\?token=abc&type=recovery/);
  assert.match(email.html, /href="https:\/\/x\.supabase\.co\/auth\/v1\/verify\?token=abc&amp;type=recovery"/);
  assert.match(email.html, /Hi Asha &lt;Ops&gt;,/, 'names are escaped in html');
  assert.doesNotMatch(email.html, /<Ops>/);
});

test('credential email: new-user wording differs from existing-user wording', () => {
  const fresh = buildCredentialEmail({ ...base, isNew: true });
  assert.equal(fresh.subject, 'Your Delegation account is ready');
  assert.match(fresh.text, /added you to the Delegation workspace/);
});

test('credential email: batches go to Resend in chunks of 100 and stop on failure', async () => {
  const saved = { fetch: globalThis.fetch, key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL };
  process.env.RESEND_API_KEY = 'k';
  process.env.RESEND_FROM_EMAIL = 'Delegation <no-reply@example.com>';
  const calls = [];
  const originalError = console.error;
  console.error = () => {};
  try {
    globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({}) }; };
    const messages = Array.from({ length: 205 }, (_, index) => ({ to: `p${index}@example.com`, subject: 's', html: 'h', text: 't', name: `P${index}` }));
    assert.deepEqual(await sendCredentialEmails(messages), { success: true, sent: 205 });
    assert.deepEqual(calls.map((call) => call.body.length), [100, 100, 5]);
    assert.equal(calls[0].url, 'https://api.resend.com/emails/batch');
    assert.deepEqual(calls[0].body[0], { from: 'Delegation <no-reply@example.com>', to: ['p0@example.com'], subject: 's', html: 'h', text: 't' });

    calls.length = 0;
    let call = 0;
    globalThis.fetch = async () => (++call === 2 ? { ok: false, status: 422, json: async () => ({ message: 'domain not verified' }) } : { ok: true, json: async () => ({}) });
    const failed = await sendCredentialEmails(messages);
    assert.equal(failed.sent, 100);
    assert.match(failed.error, /Resend: domain not verified/);
  } finally {
    globalThis.fetch = saved.fetch;
    console.error = originalError;
    if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key;
    if (saved.from === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = saved.from;
  }
});

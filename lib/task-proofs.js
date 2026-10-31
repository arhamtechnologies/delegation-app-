import { supabaseBrowser } from './supabase-browser';
import { getAuthenticatedUser } from './auth';
import { TASK_PROOF_BUCKET } from './proof-image.mjs';

export function isProofUpdate(update) {
  return update?.update_type === 'proof';
}

export function taskHasProof(updates) {
  return (updates || []).some((update) => isProofUpdate(update) || update.proof_url);
}

// The database rule (enforce_task_completion_proof) rejects closing a proof-required task with no proof.
export function isProofRequiredError(error) {
  return error?.hint === 'proof_required' || /proof screenshot before completing/i.test(error?.message || '');
}

// Uploads an already-optimised image and records it on the task. Returns { update } or { error }.
export async function uploadTaskProof(taskId, optimised) {
  const user = await getAuthenticatedUser();
  if (!user) return { error: { message: 'Your session has expired. Please sign in again.' } };

  const supabase = supabaseBrowser();
  const path = `${taskId}/${crypto.randomUUID()}.${optimised.extension}`;
  const { error: uploadError } = await supabase.storage.from(TASK_PROOF_BUCKET).upload(path, optimised.blob, { contentType: optimised.type, cacheControl: '3600', upsert: false });
  if (uploadError) return { error: { message: `The screenshot could not be uploaded. ${uploadError.message || ''}`.trim() } };

  const { data, error } = await supabase
    .from('task_updates')
    .insert({ task_id: taskId, author_user_id: user.id, update_type: 'proof', remark: 'Proof screenshot added', proof_url: path })
    .select('id,update_type,remark,proof_url,created_at')
    .single();
  // An orphaned upload is removed by the 30-day cleanup.
  if (error) return { error: { message: 'The screenshot uploaded but could not be attached to the task. Please try again.' } };
  return { update: data };
}

const signedCache = new Map();

// Signed links last 12 hours; the request is cached (for 11) so the same proof shown twice is signed once.
export function signedProofUrl(path) {
  const cached = signedCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = supabaseBrowser().storage.from(TASK_PROOF_BUCKET).createSignedUrl(path, 12 * 3600)
    .then(({ data, error }) => (error || !data?.signedUrl ? null : data.signedUrl));
  promise.then((url) => { if (!url) signedCache.delete(path); }, () => signedCache.delete(path));
  signedCache.set(path, { promise, expires: Date.now() + 11 * 3600 * 1000 });
  return promise;
}

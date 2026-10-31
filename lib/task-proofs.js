import { supabaseBrowser } from './supabase-browser';
import { getAuthenticatedUser } from './auth';
import { TASK_PROOF_BUCKET } from './proof-image.mjs';
import { setChecklistCompletion } from './checklist-data';
import { setTaskCompletion } from './task-data';

// Proof screenshots work on tasks and checklist items. Checklist proof is always optional; each task's
// assigner chooses mandatory or optional (tasks.proof_required).
// A target is { kind: 'task' | 'checklist', id, title }.
const targets = {
  task: { folder: (id) => id, table: 'task_updates', key: 'task_id' },
  checklist: { folder: (id) => `checklist/${id}`, table: 'checklist_item_updates', key: 'checklist_item_id' },
};

export function isProofUpdate(update) {
  return update?.update_type === 'proof';
}

export function taskHasProof(updates) {
  return (updates || []).some((update) => isProofUpdate(update) || update.proof_url);
}

// Tasks created with proof "Mandatory" cannot be closed without a screenshot (enforce_task_completion_proof).
export function isProofRequiredError(error) {
  return error?.hint === 'proof_required' || /proof screenshot before completing/i.test(error?.message || '');
}

export function completeTarget(target) {
  return target.kind === 'checklist' ? setChecklistCompletion(target.id, true) : setTaskCompletion(target.id, true);
}

// Uploads an already-optimised image and records it on the task or checklist item. Returns { update } or { error }.
export async function uploadProof(target, optimised) {
  const config = targets[target.kind];
  if (!config) return { error: { message: 'Unknown item type.' } };
  const user = await getAuthenticatedUser();
  if (!user) return { error: { message: 'Your session has expired. Please sign in again.' } };

  const supabase = supabaseBrowser();
  const path = `${config.folder(target.id)}/${crypto.randomUUID()}.${optimised.extension}`;
  const { error: uploadError } = await supabase.storage.from(TASK_PROOF_BUCKET).upload(path, optimised.blob, { contentType: optimised.type, cacheControl: '3600', upsert: false });
  if (uploadError) return { error: { message: `The screenshot could not be uploaded. ${uploadError.message || ''}`.trim() } };

  const { data, error } = await supabase
    .from(config.table)
    .insert({ [config.key]: target.id, author_user_id: user.id, update_type: 'proof', remark: 'Proof screenshot added', proof_url: path })
    .select('id,update_type,remark,proof_url,created_at')
    .single();
  // An orphaned upload is removed by the 30-day cleanup.
  if (error) return { error: { message: 'The screenshot uploaded but could not be attached. Please try again.' } };
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

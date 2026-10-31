// Deletes task proof screenshots older than the retention window.
// The proof row stays (proof_url cleared) so the task still counts as proven and the timeline shows it was removed.

import { TASK_PROOF_BUCKET, TASK_PROOF_RETENTION_DAYS } from '../proof-image.mjs';

const pageSize = 1000;
const filterChunk = 50; // keeps the PATCH filter URL short

export async function cleanupTaskProofs(admin, { now = new Date(), maxRounds = 5 } = {}) {
  const before = new Date(now.getTime() - TASK_PROOF_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let removed = 0;

  for (let round = 0; round < maxRounds; round += 1) {
    const { data, error } = await admin.rpc('expired_task_proofs', { p_before: before, p_limit: pageSize });
    if (error) return { error, removed };
    const names = (data || []).map((row) => row.name).filter(Boolean);
    if (!names.length) break;

    // Clear the rows first: if the delete below fails, the objects are still found and retried next run.
    // Checklist proofs live under `checklist/`, task proofs under `<task_id>/`.
    const byTable = [
      ['checklist_item_updates', names.filter((name) => name.startsWith('checklist/'))],
      ['task_updates', names.filter((name) => !name.startsWith('checklist/'))],
    ];
    for (const [table, tableNames] of byTable) {
      for (let start = 0; start < tableNames.length; start += filterChunk) {
        const { error: updateError } = await admin.from(table).update({ proof_url: null }).eq('update_type', 'proof').in('proof_url', tableNames.slice(start, start + filterChunk));
        if (updateError) return { error: updateError, removed };
      }
    }
    const { error: removeError } = await admin.storage.from(TASK_PROOF_BUCKET).remove(names);
    if (removeError) return { error: removeError, removed };
    removed += names.length;
    if (names.length < pageSize) break;
  }
  return { removed, before };
}

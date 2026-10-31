import assert from 'node:assert/strict';
import test from 'node:test';
import { fitWithin, formatBytes } from '../lib/proof-image.mjs';
import { cleanupTaskProofs } from '../lib/server/task-proof-cleanup.mjs';

test('proof image: phone and desktop screenshots shrink to readable sizes, small ones stay as they are', () => {
  assert.deepEqual(fitWithin(1170, 2532), { width: 924, height: 2000 }, 'iPhone screenshot: long edge capped');
  assert.deepEqual(fitWithin(2880, 1800), { width: 1920, height: 1200 }, 'retina desktop: short edge capped');
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 }, 'never upscaled');
  assert.deepEqual(fitWithin(10000, 10), { width: 2000, height: 2 });
  assert.equal(formatBytes(2_400_000), '2.3 MB');
  assert.equal(formatBytes(310_000), '303 KB');
});

function fakeAdmin({ pages, failRemove = false }) {
  const calls = { rpc: [], updates: [], removed: [] };
  let page = 0;
  return {
    calls,
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: (pages[page++] || []).map((n) => ({ name: n })), error: null }; },
    from: (table) => ({
      update: (values) => ({ eq: (column, value) => ({ in: async (inColumn, list) => { calls.updates.push({ table, values, column, value, inColumn, list }); return { error: null }; } }) }),
    }),
    storage: { from: (bucket) => ({ remove: async (names) => { calls.removed.push({ bucket, names }); return { error: failRemove ? { message: 'boom' } : null }; } }) },
  };
}

test('proof cleanup: deletes objects older than 30 days and clears their rows first', async () => {
  const names = Array.from({ length: 120 }, (_, i) => `task-${i}/p.webp`);
  const admin = fakeAdmin({ pages: [names] });
  const result = await cleanupTaskProofs(admin, { now: new Date('2026-12-01T00:00:00.000Z') });
  assert.equal(result.removed, 120);
  assert.equal(admin.calls.rpc[0].name, 'expired_task_proofs');
  assert.equal(admin.calls.rpc[0].args.p_before, '2026-11-01T00:00:00.000Z');
  assert.deepEqual(admin.calls.updates.map((u) => u.list.length), [50, 50, 20], 'row updates are chunked');
  assert.ok(admin.calls.updates.every((u) => u.table === 'task_updates' && u.values.proof_url === null && u.column === 'update_type' && u.value === 'proof'));
  assert.deepEqual(admin.calls.removed, [{ bucket: 'task-proofs', names }]);
});

test('proof cleanup: checklist screenshots clear checklist rows, task screenshots clear task rows', async () => {
  const admin = fakeAdmin({ pages: [['checklist/c1/a.webp', 't1/b.webp', 'checklist/c2/c.jpg']] });
  assert.equal((await cleanupTaskProofs(admin)).removed, 3);
  assert.deepEqual(admin.calls.updates.map((u) => [u.table, u.list]), [
    ['checklist_item_updates', ['checklist/c1/a.webp', 'checklist/c2/c.jpg']],
    ['task_updates', ['t1/b.webp']],
  ]);
  assert.deepEqual(admin.calls.removed[0].names, ['checklist/c1/a.webp', 't1/b.webp', 'checklist/c2/c.jpg']);
});

test('proof cleanup: nothing expired is a no-op; a full page loops; storage failure is reported', async () => {
  const empty = fakeAdmin({ pages: [[]] });
  assert.deepEqual((await cleanupTaskProofs(empty)).removed, 0);
  assert.equal(empty.calls.removed.length, 0);

  const full = Array.from({ length: 1000 }, (_, i) => `t/${i}.webp`);
  const looping = fakeAdmin({ pages: [full, ['t/last.webp']] });
  assert.equal((await cleanupTaskProofs(looping)).removed, 1001);
  assert.equal(looping.calls.rpc.length, 2);

  const failing = fakeAdmin({ pages: [['t/a.webp']], failRemove: true });
  const result = await cleanupTaskProofs(failing);
  assert.equal(result.error.message, 'boom');
  assert.equal(result.removed, 0);
});

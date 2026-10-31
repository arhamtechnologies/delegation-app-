import assert from 'node:assert/strict';
import test from 'node:test';
import { executeProposals } from '../lib/wa/execute-core.mjs';

const actor = { id: 'dir', name: 'Director', role: 'ea', auth_user_id: 'auth-dir', chatId: '919800000000@c.us' };

// Minimal chainable stand-in for the Supabase admin client: every query resolves to `result`.
function stubAdmin(result = { data: null, error: null }) {
  const calls = [];
  const builder = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve) => resolve(result);
      return (...args) => { calls.push([prop, ...args]); return builder; };
    },
  });
  return { admin: { from: (table) => { calls.push(['from', table]); return builder; } }, calls };
}

test('wa execute 1: deleting a task that vanished says so instead of claiming success', async () => {
  const { admin } = stubAdmin();
  const rules = { deleteTask: async () => ({ ok: false, status: 404, error: 'The task was not found.' }) };
  const lines = await executeProposals(admin, actor, [{ kind: 'task_delete', taskId: 't1', shortCode: 12, label: 'PERMANENT DELETE #12 "A" (cannot be undone)' }], rules);
  assert.deepEqual(lines, ['❌ #12 no longer exists.']);
});

test('wa execute 2: a successful delete calls the app rule with the actor and reports it', async () => {
  const { admin } = stubAdmin();
  let received;
  const rules = { deleteTask: async (_admin, ruleActor, payload) => { received = { ruleActor, payload }; return { ok: true, body: { success: true } }; } };
  const lines = await executeProposals(admin, actor, [{ kind: 'task_delete', taskId: 't1', shortCode: 12, label: 'PERMANENT DELETE #12 "A" (cannot be undone)' }], rules);
  assert.deepEqual(received, { ruleActor: { employeeId: 'dir', role: 'ea', authUserId: 'auth-dir', name: 'Director', chatId: '919800000000@c.us' }, payload: { id: 't1' } });
  assert.deepEqual(lines, ['✅ PERMANENT DELETE #12 "A" (cannot be undone)']);
});

test('wa execute 3: app rule refusals are reported with their reason, and later proposals still run', async () => {
  const { admin } = stubAdmin();
  const rules = {
    setChecklistItemCompletion: async (_admin, _actor, id) => (id === 'i1'
      ? { ok: false, status: 403, error: 'You do not have permission to complete this checklist item.' }
      : { ok: true, body: { success: true } }),
  };
  const lines = await executeProposals(admin, actor, [
    { kind: 'checklist_done', itemId: 'i1', shortCode: 45, label: 'Mark done: C45 "Petty cash"' },
    { kind: 'checklist_done', itemId: 'i2', shortCode: 46, label: 'Mark done: C46 "Rent"' },
  ], rules);
  assert.deepEqual(lines, ['❌ Mark done: C45 "Petty cash": You do not have permission to complete this checklist item.', '✅ Mark done: C46 "Rent"']);
});

test('wa execute 4: a leave or holiday proposal re-checks the role at confirmation time', async () => {
  const { admin } = stubAdmin();
  const rules = { configureNonWorkingDays: async () => { throw new Error('must not run'); } };
  const lines = await executeProposals(admin, { ...actor, role: 'assigner' }, [{ kind: 'leave_add', employeeId: 'e1', dates: ['2026-10-30'], label: 'Mark Varun on leave: 30 Oct' }], rules);
  assert.deepEqual(lines, ['❌ Mark Varun on leave: 30 Oct: Only Super Admins and EAs can deactivate non-working-day checklist tasks.']);
});

test('wa execute 5: non-managers cannot execute anything', async () => {
  const { admin, calls } = stubAdmin();
  const lines = await executeProposals(admin, { ...actor, role: 'doer' }, [{ kind: 'task_cancel', taskId: 't1', shortCode: 3, label: 'Cancel #3', patch: { status: 'not_required' } }], {});
  assert.deepEqual(lines, ['❌ Failed: Cancel #3']);
  assert.equal(calls.length, 0);
});

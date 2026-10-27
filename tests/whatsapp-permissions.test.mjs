import assert from 'node:assert/strict';
import test from 'node:test';
import { canPropose, deleteTaskLabel, deleteTemplateLabel } from '../lib/wa/permissions.mjs';

test('wa permissions 1: assigners cannot change leaves or holidays, EAs and super admins can', () => {
  for (const kind of ['leave_add', 'leave_remove', 'holiday_add', 'holiday_remove']) {
    assert.equal(canPropose('assigner', kind), 'Only Super Admins and EAs can deactivate non-working-day checklist tasks.', kind);
    assert.equal(canPropose('ea', kind), null, kind);
    assert.equal(canPropose('super_admin', kind), null, kind);
  }
});

test('wa permissions 2: assigners complete or reopen only their own checklist items', () => {
  const denied = 'You do not have permission to complete this checklist item.';
  for (const kind of ['checklist_done', 'checklist_reopen']) {
    assert.equal(canPropose('assigner', kind, { ownEmployeeId: 'a', targetEmployeeId: 'b' }), denied, kind);
    assert.equal(canPropose('assigner', kind, { ownEmployeeId: 'a', targetEmployeeId: 'a' }), null, kind);
    assert.equal(canPropose('ea', kind, { ownEmployeeId: 'a', targetEmployeeId: 'b' }), null, kind);
  }
});

test('wa permissions 3: employees and unknown roles cannot propose anything', () => {
  assert.equal(canPropose('doer', 'task_create'), 'This user does not have permission to change tasks.');
  assert.equal(canPropose(undefined, 'task_delete'), 'This user does not have permission to change tasks.');
});

test('wa permissions 4: permanent deletes say so in the label', () => {
  assert.equal(deleteTaskLabel({ short_code: 12, title: 'GST filing' }), 'PERMANENT DELETE #12 "GST filing" (cannot be undone)');
  assert.equal(deleteTemplateLabel({ short_code: 7, task: 'Petty cash' }), 'PERMANENT DELETE R7 "Petty cash" and its generated checklist items (cannot be undone)');
});

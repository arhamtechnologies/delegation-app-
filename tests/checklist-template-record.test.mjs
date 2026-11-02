import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTemplateRecord, templateFrequencies } from '../lib/checklist-template-record.mjs';

const weekly = { employee_id: 'e', task: ' Petty cash ', frequency: 'weekly', weekday: 1, start_date: '2026-10-27', due_time: '10:00' };

test('template record 1: weekly record is trimmed and stamped', () => {
  const record = normalizeTemplateRecord(weekly, 'u');
  assert.equal(record.task, 'Petty cash');
  assert.equal(record.weekday, 1);
  assert.deepEqual(record.monthly_days, []);
  assert.equal(record.created_by, 'u');
  assert.deepEqual(templateFrequencies, ['daily', 'weekly', 'every_15_days', 'monthly']);
});

test('template record 2: monthly days are de-duplicated and sorted', () => {
  const record = normalizeTemplateRecord({ ...weekly, frequency: 'monthly', monthly_days: [15, 1, 1] });
  assert.deepEqual(record.monthly_days, [1, 15]);
  assert.equal(record.day_of_month, 1);
  assert.equal(record.weekday, null);
});

test('template record 3: invalid recurrence and time are rejected with the app messages', () => {
  assert.throws(() => normalizeTemplateRecord({ ...weekly, frequency: 'hourly' }), { message: 'Choose a supported recurrence.' });
  assert.throws(() => normalizeTemplateRecord({ ...weekly, due_time: '24:00' }), { message: 'Due time must be between 00:00 and 23:59.' });
});

test('template record: proof_required is saved only when chosen, so other edits keep the current setting', async () => {
  const { normalizeTemplateRecord } = await import('../lib/checklist-template-record.mjs');
  const base = { employee_id: 'e1', task: 'Cash report', frequency: 'daily', start_date: '2026-11-02', due_time: '18:30' };
  assert.equal(normalizeTemplateRecord({ ...base, proof_required: true }).proof_required, true);
  assert.equal(normalizeTemplateRecord({ ...base, proof_required: false }).proof_required, false);
  assert.equal('proof_required' in normalizeTemplateRecord(base), false);
  assert.equal('proof_required' in normalizeTemplateRecord({ ...base, proof_required: 'yes' }), false);
});

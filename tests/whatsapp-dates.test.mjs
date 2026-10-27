import assert from 'node:assert/strict';
import test from 'node:test';
import { misRange } from '../lib/wa/dates.mjs';

const tuesday = new Date('2026-10-27T06:00:00.000Z'); // 27 Oct 2026, 11:30 IST

test('wa dates 1: MIS ranges resolve in India time', () => {
  assert.deepEqual(misRange('today', tuesday), { from: '2026-10-27', to: '2026-10-27' });
  assert.deepEqual(misRange('this_month', tuesday), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(misRange('last_month', tuesday), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(misRange('this_week', tuesday), { from: '2026-10-26', to: '2026-11-01' });
});

test('wa dates 2: January rolls back to December, and late-night UTC is already tomorrow in India', () => {
  assert.deepEqual(misRange('last_month', new Date('2026-01-15T06:00:00.000Z')), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(misRange('today', new Date('2026-10-27T20:00:00.000Z')), { from: '2026-10-28', to: '2026-10-28' });
});

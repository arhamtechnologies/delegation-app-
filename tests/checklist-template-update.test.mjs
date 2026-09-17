import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getChecklistTemplateUpdateError, isChecklistTemplateValidationError } from '../lib/checklist-template-errors.mjs';

const migrationPath = new URL('../supabase/migrations/20260917051200_fix_checklist_template_update_guard.sql', import.meta.url);
const routePath = new URL('../app/api/checklist/templates/route.js', import.meta.url);
const migration = await readFile(migrationPath, 'utf8');
const route = await readFile(routePath, 'utf8');

test('1. task title edits synchronize open occurrences', () => {
  assert.match(migration, /task = new\.task/);
});

test('2. employee edits synchronize open occurrences', () => {
  assert.match(migration, /employee_id = new\.employee_id/);
});

test('3. frequency changes remain part of validated template updates', () => {
  assert.match(route, /frequencyValues\.has\(frequency\)/);
});

test('4. start-date changes remain part of validated template updates', () => {
  assert.match(route, /validDate\(payload\.start_date\)/);
});

test('5. due-time edits synchronize due_at in Asia\/Kolkata', () => {
  assert.match(migration, /due_at =/);
  assert.match(migration, /at time zone 'Asia\/Kolkata'/i);
});

test('6. active and inactive template edits remain supported', () => {
  assert.match(route, /active: payload\.active !== false/);
});

test('7. completed history is outside the synchronization population', () => {
  assert.match(migration, /status in \('pending', 'overdue'\)/);
  assert.match(migration, /completed_at is null/);
});

test('8. open generated checklist occurrences are synchronized', () => {
  assert.match(migration, /update public\.checklist_items/);
  assert.match(migration, /where template_id = new\.id/);
});

test('9. unauthorized direct assignment and schedule updates remain guarded', () => {
  assert.match(migration, /not is_template_sync/);
  assert.match(migration, /not \(is_template_sync or is_service_role\)/);
  assert.match(migration, /pg_trigger_depth\(\) > 1/);
});

test('10. deactivated non-working-day occurrences are not reactivated', () => {
  assert.doesNotMatch(migration, /status in \([^)]*deactivated/);
});

test('11. inactive or missing employees are rejected by the API', () => {
  assert.match(route, /\.eq\('active', true\)\.maybeSingle\(\)/);
  assert.match(route, /Choose an active existing employee\./);
});

test('12. missing and invalid template IDs are rejected before querying', () => {
  assert.match(route, /uuidPattern\.test\(payload\?\.id \|\| ''\)/);
});

test('13. database failures map to clear safe frontend errors', () => {
  assert.deepEqual(getChecklistTemplateUpdateError({ code: 'P0001', message: 'Checklist item assignment and schedule are immutable' }), {
    status: 409,
    message: 'Open checklist items could not be synchronized. The latest checklist template update migration must be applied.',
  });
  assert.deepEqual(getChecklistTemplateUpdateError({ code: 'XX000', message: 'internal details' }), {
    status: 500,
    message: 'The checklist template could not be updated.',
  });
  assert.equal(isChecklistTemplateValidationError({ message: 'Due time must be between 00:00 and 23:59.' }), true);
});

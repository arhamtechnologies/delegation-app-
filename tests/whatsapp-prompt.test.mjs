import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDynamicContext, buildSystem, missingFields, staticSystemPrompt, toolDefinitions, toolSchemas } from '../lib/wa/tools.mjs';

const now = new Date('2026-10-27T06:00:00.000Z');
const actor = { name: 'Director', role: 'ea' };

test('wa prompt 1: the cached part has no date, names or history', () => {
  assert.doesNotMatch(staticSystemPrompt, /\d{4}-\d{2}-\d{2}/);
  const context = buildDynamicContext({ actor, assigneeNames: ['Vipul Kumar', 'Varun'], history: [], now });
  assert.match(context, /Vipul Kumar, Varun/);
  assert.ok(!staticSystemPrompt.includes('Vipul Kumar'));
  assert.match(context, /2026-10-27/);
});

test('wa prompt 2: five grouped tools; the cache marker sits on the static system block, after the tools', () => {
  assert.deepEqual(toolDefinitions.map((tool) => tool.name), ['tasks', 'task_change', 'checklist', 'reports', 'leave']);
  assert.ok(toolDefinitions.every((tool) => !tool.cache_control));
  const system = buildSystem('today is X');
  assert.equal(system.length, 2);
  assert.deepEqual(system[0], { type: 'text', text: staticSystemPrompt, cache_control: { type: 'ephemeral', ttl: '1h' } });
  assert.deepEqual(system[1], { type: 'text', text: 'today is X' });
  for (const tool of toolDefinitions) assert.ok(!tool.description.includes('\n'), `${tool.name} description is one line`);
});

test('wa prompt 3: tool definitions stay small (about 2,000 tokens)', () => {
  assert.ok(JSON.stringify(toolDefinitions).length < 9000, String(JSON.stringify(toolDefinitions).length));
});

test('wa prompt 4: history keeps the last 4 messages, cut short, bot replies reduced to their first line', () => {
  const history = Array.from({ length: 6 }, (_, index) => ({ direction: index % 2 ? 'out' : 'in', body: `m${index} ${'x'.repeat(500)}\nsecond line` }));
  const context = buildDynamicContext({ actor, assigneeNames: [], history, now });
  const lines = context.split('\n').filter((line) => /^(User|Bot): m/.test(line));
  assert.equal(lines.length, 4);
  assert.ok(lines[0].startsWith('User: m2'));
  assert.ok(lines.every((line) => line.length <= 215));
  assert.ok(!context.includes('second line'));
});

test('wa prompt 5: actions are an enum; "remove" is not an action but delete is', () => {
  assert.equal(toolSchemas.task_change.safeParse({ action: 'delete', task: 12 }).success, true);
  assert.equal(toolSchemas.task_change.safeParse({ action: 'remove', task: 12 }).success, false);
});

test('wa prompt 6: required fields per action are reported by name', () => {
  assert.deepEqual(missingFields('task_change', { action: 'delete' }), ['task']);
  assert.deepEqual(missingFields('task_change', { action: 'create', title: 'x', assignee: 'a' }), ['due_date']);
  assert.deepEqual(missingFields('checklist', { action: 'done', item: 4 }), []);
  assert.deepEqual(missingFields('leave', { action: 'add', assignee: 'a' }), ['dates']);
});

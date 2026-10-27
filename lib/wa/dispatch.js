import { missingFields, toolSchemas } from './tools.mjs';
import { resolveAssigneeName } from './format.mjs';
import * as proposals from './proposals';
import * as reads from './reads';

// Routes one tool call from the model to a read handler or a proposal builder.
// Reports come back with direct: true so the server can send them without the model retyping them.
const direct = (text) => ({ text, direct: true });

async function runReport(input, ctx) {
  const { admin, assignees } = ctx;
  if (input.action === 'mis') return direct(await reads.getMisReport(admin, assignees, { period: input.period, assignee: input.assignee }));
  if (input.action === 'followup') return direct(await reads.getFollowUps(admin, assignees, { assignee: input.assignee }));
  const resolved = input.assignee ? resolveAssigneeName(input.assignee, assignees) : {};
  if (resolved.error) return { text: resolved.error };
  return direct(await reads.buildDailyUpdate(admin, { date: input.date, employee: resolved.employee }));
}

const handlers = {
  tasks: (input, ctx) => ({
    find: () => reads.findTasks(ctx.admin, ctx.assignees, input),
    get: () => reads.getTaskDetails(ctx.admin, input.task),
    summary: () => reads.getSummary(ctx.admin, ctx.assignees, input),
  })[input.action](),
  task_change: (input, ctx) => ({
    create: () => proposals.proposeTaskCreate(ctx, input),
    update: () => proposals.proposeTaskUpdate(ctx, input),
    reassign: () => proposals.proposeTaskReassign(ctx, input),
    status: () => proposals.proposeTaskStatus(ctx, input),
    cancel: () => proposals.proposeTaskCancel(ctx, input),
    delete: () => proposals.proposeTaskDelete(ctx, input),
    remark: () => proposals.proposeTaskRemark(ctx, input),
  })[input.action](),
  checklist: (input, ctx) => ({
    find: () => reads.findChecklistItems(ctx.admin, ctx.assignees, input),
    templates: () => reads.listTemplates(ctx.admin, ctx.assignees, { assignee: input.assignee, active: input.active }),
    done: () => proposals.proposeChecklistDone(ctx, input),
    reopen: () => proposals.proposeChecklistReopen(ctx, input),
    remark: () => proposals.proposeChecklistRemark(ctx, input),
    template_create: () => proposals.proposeTemplateCreate(ctx, input),
    template_update: () => proposals.proposeTemplateUpdate(ctx, input),
    template_pause: () => proposals.proposeTemplatePause(ctx, input),
    template_resume: () => proposals.proposeTemplateResume(ctx, input),
    template_delete: () => proposals.proposeTemplateDelete(ctx, input),
  })[input.action](),
  reports: (input, ctx) => runReport(input, ctx),
  leave: (input, ctx) => ({
    list: () => reads.listLeaves(ctx.admin, ctx.assignees, { assignee: input.assignee }),
    add: () => proposals.proposeLeave(ctx, input, true),
    remove: () => proposals.proposeLeave(ctx, input, false),
    holiday_add: () => proposals.proposeHolidayAdd(ctx, input),
    holiday_remove: () => proposals.proposeHolidayRemove(ctx, input),
  })[input.action](),
};

/** @returns {Promise<{ text: string, direct?: boolean }>} */
export async function runTool(name, rawInput, ctx) {
  const schema = toolSchemas[name];
  if (!schema) return { text: `Unknown tool ${name}.` };
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) return { text: `Invalid input: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}` };
  const missing = missingFields(name, parsed.data);
  if (missing.length) return { text: `Missing: ${missing.join(', ')}. Ask the user.` };
  try {
    const result = await handlers[name](parsed.data, ctx);
    return typeof result === 'string' ? { text: result } : result;
  } catch (error) {
    console.error('WhatsApp tool failed.', { tool: name, action: parsed.data.action, code: error?.code, message: error?.message });
    return { text: 'Server error while running this tool. Apologise briefly and suggest trying again.' };
  }
}

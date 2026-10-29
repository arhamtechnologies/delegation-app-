import { resolveUpdateDate, helpTextFor } from './updates.mjs';
import * as proposals from './proposals';
import * as reads from './reads';

/**
 * Runs a parsed command (see commands.mjs) with no model call.
 * Reads return text; writes push proposals into ctx.proposals and may return an explanatory string.
 * @returns {Promise<string>}
 */
export async function runCommand(command, ctx) {
  const { admin, assignees, actor } = ctx;
  switch (command.kind) {
    case 'help': return helpTextFor(actor.role);
    case 'updates': return reads.buildDailyUpdate(admin, { date: resolveUpdateDate(command.day) });
    case 'task': return reads.getTaskDetails(admin, command.ref);
    case 'task_close': return proposals.proposeTaskStatus(ctx, { task: command.ref, status: 'closed' });
    case 'task_delete': return proposals.proposeTaskDelete(ctx, { task: command.ref });
    case 'task_cancel': return proposals.proposeTaskCancel(ctx, { task: command.ref });
    case 'list': return command.status === 'followup'
      ? reads.getFollowUps(admin, assignees)
      : reads.getTodayWork(admin, assignees, { status: command.status });
    case 'person_tasks': return reads.getTodayWork(admin, assignees, { assignee: command.name, status: command.status });
    case 'checklist': return reads.findChecklistItems(admin, assignees, { assignee: command.name, status: command.status, date: command.day === 'yesterday' ? resolveUpdateDate('yesterday') : undefined });
    case 'checklist_done': return proposals.proposeChecklistDone(ctx, { item: command.ref });
    case 'checklist_reopen': return proposals.proposeChecklistReopen(ctx, { item: command.ref });
    case 'stats': return reads.getDashboardStats(admin, assignees, { assignee: command.name });
    case 'mis': return reads.getMisReport(admin, assignees, { period: command.period });
    default: return 'Sorry, I could not understand that. Please rephrase.';
  }
}

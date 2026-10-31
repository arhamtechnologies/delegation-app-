import { canPropose, managerRoles } from './permissions.mjs';

// Runs confirmed proposals. The app's own rules (lib/server/*) are passed in as `rules`,
// so this stays free of Next/Supabase imports and can be tested with stand-ins.
// Mirrors setTaskCompletion: closing stamps completed_at, any other status clears it.
function statusFields(status, nowIso) {
  if (status === 'closed') return { completed_at: nowIso };
  if (status === 'submitted') return { submitted_at: nowIso, completed_at: null };
  if (status === 'not_required') return {};
  return { completed_at: null };
}

async function isAssignable(admin, employeeId) {
  const { data, error } = await admin.from('employees').select('id,active,role').eq('id', employeeId).maybeSingle();
  if (error) throw error;
  return data?.active === true && !managerRoles.has(data.role);
}

function ruleActor(actor) {
  return { employeeId: actor.id, role: actor.role, authUserId: actor.auth_user_id, name: actor.name, chatId: actor.chatId };
}

function describeRule(result, proposal, goneRef) {
  if (result.ok) return `✅ ${proposal.label}`;
  if (result.status === 404) return `❌ ${goneRef} no longer exists.`;
  return `❌ ${proposal.label}: ${result.error}`;
}

async function runRuleProposal(admin, actor, proposal, rules) {
  const who = ruleActor(actor);
  switch (proposal.kind) {
    case 'task_delete':
      return describeRule(await rules.deleteTask(admin, who, { id: proposal.taskId }), proposal, `#${proposal.shortCode}`);
    case 'checklist_done':
      return describeRule(await rules.setChecklistItemCompletion(admin, who, proposal.itemId, true), proposal, `C${proposal.shortCode}`);
    case 'checklist_reopen':
      return describeRule(await rules.setChecklistItemCompletion(admin, who, proposal.itemId, false), proposal, `C${proposal.shortCode}`);
    case 'template_create':
      return describeRule(await rules.createTemplate(admin, who, proposal.payload), proposal, 'That recurring task');
    case 'template_update':
    case 'template_pause':
    case 'template_resume':
      return describeRule(await rules.updateTemplate(admin, who, proposal.payload), proposal, `R${proposal.shortCode}`);
    case 'template_delete':
      return describeRule(await rules.deleteTemplate(admin, who, { id: proposal.templateId }), proposal, `R${proposal.shortCode}`);
    case 'leave_add':
      return describeRule(await rules.configureNonWorkingDays(admin, who, { reason: 'employee_leave', employee_id: proposal.employeeId, dates: proposal.dates }), proposal, 'That employee');
    case 'leave_remove': {
      for (const date of proposal.dates) {
        const result = await rules.removeNonWorkingDay(admin, who, { reason: 'employee_leave', employee_id: proposal.employeeId, date });
        if (!result.ok) return describeRule(result, proposal, 'That leave');
      }
      return `✅ ${proposal.label}`;
    }
    case 'holiday_add':
      return describeRule(await rules.configureNonWorkingDays(admin, who, { reason: 'national_holiday', name: proposal.name, country: 'India', dates: proposal.dates }), proposal, 'That holiday');
    case 'holiday_remove':
      return describeRule(await rules.disableHoliday(admin, who, { id: proposal.holidayId }), proposal, 'That holiday');
    default:
      return null;
  }
}

export async function executeProposals(admin, actor, proposals, rules) {
  const lines = [];
  for (const proposal of proposals) {
    try {
      if (!managerRoles.has(actor.role)) throw new Error('Actor is not a task manager.');
      const refusal = canPropose(actor.role, proposal.kind);
      if (refusal) {
        lines.push(`❌ ${proposal.label}: ${refusal}`);
        continue;
      }
      const ruleLine = await runRuleProposal(admin, actor, proposal, rules);
      if (ruleLine) {
        lines.push(ruleLine);
        continue;
      }

      const nowIso = new Date().toISOString();
      const assigneeId = proposal.kind === 'task_create' ? proposal.record.assignee_id : proposal.assigneeId;
      if (assigneeId && !(await isAssignable(admin, assigneeId))) {
        lines.push(`❌ ${proposal.label}: employee can no longer receive tasks.`);
        continue;
      }
      if (proposal.kind === 'task_create') {
        const { error } = await admin.from('tasks').insert(proposal.record);
        if (error) throw error;
        lines.push(`✅ Created "${proposal.record.title}"`);
        continue;
      }
      if (proposal.kind === 'task_remark') {
        // Same row the task page writes for a remark.
        const { error } = await admin.from('task_updates').insert({ task_id: proposal.taskId, author_user_id: actor.auth_user_id, update_type: 'remark', remark: proposal.remark });
        if (error?.code === '23503') { lines.push(`❌ #${proposal.shortCode} no longer exists.`); continue; }
        if (error) throw error;
        lines.push(`✅ ${proposal.label}`);
        continue;
      }
      if (proposal.kind === 'checklist_remark') {
        const { error } = await admin.from('checklist_item_updates').insert({ checklist_item_id: proposal.itemId, author_user_id: actor.auth_user_id, update_type: 'remark', remark: proposal.remark });
        if (error?.code === '23503') { lines.push(`❌ C${proposal.shortCode} no longer exists.`); continue; }
        if (error) throw error;
        lines.push(`✅ ${proposal.label}`);
        continue;
      }
      const patch = { ...proposal.patch, ...(proposal.patch.status ? statusFields(proposal.patch.status, nowIso) : {}), updated_at: nowIso };
      const { data, error } = await admin.from('tasks').update(patch).eq('id', proposal.taskId).select('short_code').maybeSingle();
      if (error?.hint === 'proof_required') { lines.push(`❌ #${proposal.shortCode} needs a proof screenshot first (proof is mandatory). Add it in the app.`); continue; }
      if (error) throw error;
      lines.push(data ? `✅ ${proposal.label}` : `❌ #${proposal.shortCode} no longer exists.`);
    } catch (error) {
      console.error('WhatsApp action failed.', { kind: proposal.kind, code: error?.code, message: error?.message });
      lines.push(`❌ Failed: ${proposal.label}`);
    }
  }
  return lines;
}

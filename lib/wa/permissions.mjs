// Mirrors the app's per-role limits so the bot never offers what the app would refuse.
export const managerRoles = new Set(['super_admin', 'assigner', 'ea']);
const nonWorkingDayRoles = new Set(['super_admin', 'ea']);
const anyChecklistItemRoles = new Set(['super_admin', 'ea']);
const nonWorkingDayKinds = new Set(['leave_add', 'leave_remove', 'holiday_add', 'holiday_remove']);

/** @returns {string | null} the app's refusal message, or null when allowed */
export function canPropose(role, kind, { ownEmployeeId, targetEmployeeId } = {}) {
  if (!managerRoles.has(role)) return 'This user does not have permission to change tasks.';
  if (nonWorkingDayKinds.has(kind) && !nonWorkingDayRoles.has(role)) return 'Only Super Admins and EAs can deactivate non-working-day checklist tasks.';
  if ((kind === 'checklist_done' || kind === 'checklist_reopen') && !anyChecklistItemRoles.has(role) && ownEmployeeId !== targetEmployeeId) {
    return 'You do not have permission to complete this checklist item.';
  }
  return null;
}

export function deleteTaskLabel(task) {
  return `PERMANENT DELETE "${task.title}" (cannot be undone)`;
}

export function deleteTemplateLabel(template) {
  return `PERMANENT DELETE recurring task "${template.task}" and its generated checklist items (cannot be undone)`;
}

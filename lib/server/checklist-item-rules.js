import { isSundayDate } from '../follow-up-tasks.mjs';
import { done, fail } from './actor';

const anyEmployeeRoles = new Set(['super_admin', 'ea']);
const ownEmployeeRoles = new Set(['doer', 'assigner']);

// Same rules as POST /api/checklist/[id]/complete: who may complete or reopen, and the deactivated follow-up exception.
export async function setChecklistItemCompletion(admin, actor, itemId, completed) {
  const reopening = completed === false;
  const { data: item, error: itemError } = await admin
    .from('checklist_items')
    .select('id,employee_id,status,due_date,due_at,template:checklist_templates!checklist_items_template_id_fkey(frequency)')
    .eq('id', itemId)
    .maybeSingle();
  if (itemError) {
    console.error('Checklist completion item lookup failed.', { code: itemError.code, message: itemError.message });
    return fail('The checklist item could not be loaded.', 500);
  }
  if (!item) return fail('The checklist item was not found.', 404);

  const canCompleteAny = anyEmployeeRoles.has(actor.role);
  const canCompleteOwn = ownEmployeeRoles.has(actor.role) && actor.employeeId === item.employee_id;
  if (!canCompleteAny && !canCompleteOwn) return fail('You do not have permission to complete this checklist item.', 403);

  if (reopening) {
    if (item.status !== 'completed') return done({ success: true, alreadyReopened: true, item });
    const dueAt = item.due_at ? new Date(item.due_at) : null;
    const nextStatus = dueAt && !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < Date.now() ? 'overdue' : 'pending';
    const { data: reopenedItems, error: reopenError } = await admin
      .from('checklist_items')
      .update({ status: nextStatus, completed_at: null, completed_by: null })
      .eq('id', itemId)
      .eq('status', 'completed')
      .select('id,template_id,employee_id,task,due_date,due_at,status,completed_at,completed_by');
    if (reopenError) {
      console.error('Checklist reopen update failed.', { code: reopenError.code, message: reopenError.message });
      return fail('The checklist item could not be reopened.', 500);
    }
    if (reopenedItems?.length === 1) return done({ success: true, alreadyReopened: false, item: reopenedItems[0] });
    const { data: currentItem } = await admin.from('checklist_items').select('id,employee_id,status').eq('id', itemId).maybeSingle();
    if (currentItem?.status !== 'completed') return done({ success: true, alreadyReopened: true, item: currentItem });
    return fail('The checklist item could not be reopened.', 409);
  }

  if (item.status === 'completed') {
    return done({ success: true, alreadyCompleted: true, item });
  }
  let eligibleDeactivatedFollowUp = false;
  if (item.status === 'deactivated' && ['weekly', 'every_15_days', 'monthly'].includes(item.template?.frequency)) {
    const { data: holiday, error: holidayError } = await admin
      .from('national_holidays')
      .select('id')
      .eq('holiday_date', item.due_date)
      .eq('country', 'India')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (holidayError) return fail('The checklist follow-up date could not be verified.', 500);
    eligibleDeactivatedFollowUp = isSundayDate(item.due_date) || Boolean(holiday);
  }
  if (item.status === 'deactivated' && !eligibleDeactivatedFollowUp) return fail('This checklist item has been deactivated and cannot be completed.', 409);

  const { data: updatedItems, error: updateError } = await admin
    .from('checklist_items')
    .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: actor.authUserId })
    .eq('id', itemId)
    .in('status', eligibleDeactivatedFollowUp ? ['pending', 'overdue', 'deactivated'] : ['pending', 'overdue'])
    .select('id,template_id,employee_id,task,due_date,due_at,status,completed_at,completed_by');
  if (updateError) {
    console.error('Checklist completion update failed.', { code: updateError.code, message: updateError.message });
    return fail('The checklist item could not be completed.', 500);
  }
  if (updatedItems?.length === 1) return done({ success: true, alreadyCompleted: false, item: updatedItems[0] });

  const { data: currentItem } = await admin
    .from('checklist_items')
    .select('id,employee_id,status')
    .eq('id', itemId)
    .maybeSingle();
  if (currentItem?.status === 'completed') return done({ success: true, alreadyCompleted: true, item: currentItem });
  return fail('The checklist item could not be completed.', 409);
}

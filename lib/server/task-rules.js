import { taskManagerRoles } from '../task-server';
import { done, fail } from './actor';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Permanent delete; task_updates rows cascade. Same rule as DELETE /api/tasks.
export async function deleteTask(admin, actor, payload) {
  if (!taskManagerRoles.has(actor.role)) return fail('You do not have permission to manage tasks.', 403);
  if (!uuidPattern.test(payload?.id || '')) return fail('A valid task is required.', 400);

  const { data: task, error: taskError } = await admin
    .from('tasks')
    .select('id,title')
    .eq('id', payload.id)
    .maybeSingle();
  if (taskError) {
    console.error('Task lookup before deletion failed.', { code: taskError.code, message: taskError.message });
    return fail('The task could not be loaded.', 500);
  }
  if (!task) return fail('The task was not found.', 404);

  const { data: deletedTask, error: deleteError } = await admin
    .from('tasks')
    .delete()
    .eq('id', task.id)
    .select('id')
    .maybeSingle();
  if (deleteError) {
    console.error('Task deletion failed.', { code: deleteError.code, message: deleteError.message, taskId: task.id });
    return fail('The task could not be deleted.', 409);
  }
  if (!deletedTask) return fail('Task deletion did not affect the requested task.', 404);

  return done({ success: true, deleted: true, taskId: task.id });
}

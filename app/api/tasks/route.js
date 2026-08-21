import { authorizeTaskManager, taskApiError } from '../../../lib/task-server';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request) {
  const authorization = await authorizeTaskManager(request);
  if (authorization.response) return authorization.response;

  let payload;
  try { payload = await request.json(); } catch { return taskApiError('The task deletion request could not be read.', 400); }
  if (!uuidPattern.test(payload?.id || '')) return taskApiError('A valid task is required.', 400);

  const { data: task, error: taskError } = await authorization.admin
    .from('tasks')
    .select('id,title')
    .eq('id', payload.id)
    .maybeSingle();
  if (taskError) {
    console.error('Task lookup before deletion failed.', { code: taskError.code, message: taskError.message });
    return taskApiError('The task could not be loaded.', 500);
  }
  if (!task) return taskApiError('The task was not found.', 404);

  const { data: deletedTask, error: deleteError } = await authorization.admin
    .from('tasks')
    .delete()
    .eq('id', task.id)
    .select('id')
    .maybeSingle();
  if (deleteError) {
    console.error('Task deletion failed.', { code: deleteError.code, message: deleteError.message, taskId: task.id });
    return taskApiError('The task could not be deleted.', 409);
  }
  if (!deletedTask) return taskApiError('Task deletion did not affect the requested task.', 404);

  return Response.json({ success: true, deleted: true, taskId: task.id });
}

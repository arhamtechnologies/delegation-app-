const validationMessages = new Set([
  'Choose an employee and provide a task between 1 and 240 characters.',
  'Choose a supported recurrence.',
  'Start date must be a valid date.',
  'Due time must be between 00:00 and 23:59.',
  'Choose a weekday for weekly recurrence.',
  'Choose one or more valid monthly days.',
]);

export function isChecklistTemplateValidationError(error) {
  return validationMessages.has(error?.message);
}

export function getChecklistTemplateUpdateError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code === 'P0001' && /assignment and schedule are immutable/i.test(message)) {
    return {
      status: 409,
      message: 'Open checklist items could not be synchronized. The latest checklist template update migration must be applied.',
    };
  }
  if (code === '23503') return { status: 400, message: 'Choose an active existing employee.' };
  if (code === '23514' || code === '22007' || code === '22008') return { status: 400, message: 'The checklist schedule contains an invalid value.' };
  if (code === '22P02') return { status: 400, message: 'A valid checklist template and employee are required.' };
  return { status: 500, message: 'The checklist template could not be updated.' };
}

import { deleteTemplate, createTemplate, updateTemplate } from '../server/checklist-template-rules';
import { setChecklistItemCompletion } from '../server/checklist-item-rules';
import { configureNonWorkingDays, disableHoliday, removeNonWorkingDay } from '../server/non-working-day-rules';
import { deleteTask } from '../server/task-rules';
import { executeProposals as run } from './execute-core.mjs';

const rules = { deleteTask, setChecklistItemCompletion, createTemplate, updateTemplate, deleteTemplate, configureNonWorkingDays, removeNonWorkingDay, disableHoliday };

// Confirmed proposals run through the same server rules the app's routes use.
export const executeProposals = (admin, actor, proposals) => run(admin, actor, proposals, rules);

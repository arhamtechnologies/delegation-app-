const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeLeaveDate(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.slice(0, 10);
  return dateOnlyPattern.test(normalized) ? normalized : '';
}

export function getEmployeeLeaveEntries(groups) {
  return (groups || []).flatMap((group) => (group.dates || []).flatMap((value) => {
    const dateValue = normalizeLeaveDate(value);
    return dateValue ? [{ group, dateValue }] : [];
  }));
}

export function classifyEmployeeLeave(groups, today) {
  const normalizedToday = normalizeLeaveDate(today);
  const all = getEmployeeLeaveEntries(groups);
  return {
    all,
    today: all.filter(({ dateValue }) => dateValue === normalizedToday),
    earlier: all.filter(({ dateValue }) => dateValue < normalizedToday),
    future: all.filter(({ dateValue }) => dateValue > normalizedToday),
  };
}

export function getSavedLeaveDates(existingDates, submittedDates, { editing = false } = {}) {
  const existing = (existingDates || []).map(normalizeLeaveDate).filter(Boolean);
  const submitted = (submittedDates || []).map(normalizeLeaveDate).filter(Boolean);
  return [...new Set(editing ? submitted : [...existing, ...submitted])].sort();
}

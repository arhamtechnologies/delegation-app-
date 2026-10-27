// In-memory stale-while-revalidate store for page data. Pages render the last
// result instantly on revisit and refresh it in the background. Cleared on sign-out.
const entries = new Map();
const clearListeners = new Set();

export function queryKey(...parts) {
  return parts.every((part) => part !== undefined && part !== null) ? parts.join(':') : null;
}

export function peekQuery(key) {
  return key ? entries.get(key) : undefined;
}

export function setQuery(key, data) {
  if (key) entries.set(key, data);
}

export function clearQueries() {
  entries.clear();
  clearListeners.forEach((listener) => listener());
}

// Lets module-level caches elsewhere (e.g. employee lists) reset with the query store.
export function onClearQueries(listener) {
  clearListeners.add(listener);
}

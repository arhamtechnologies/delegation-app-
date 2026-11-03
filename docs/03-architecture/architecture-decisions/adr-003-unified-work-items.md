# ADR-003: Unified Work Items View

**Status**: Accepted
**Date**: 2026-02-01
**Deciders**: Lead Architect, Backend Lead
**Technical Story**: ARCH-003

---

## Context

The Delegation App has two primary work types:
- **Tasks**: Ad-hoc delegated work with rich metadata (priority, category, proof, etc.)
- **Checklist Items**: Recurring generated occurrences from templates

Multiple features need a combined view:
- **Dashboard**: Today's work (tasks + checklists) sorted chronologically
- **Tasks Page**: Unified list with filters across both types
- **MIS Reports**: Aggregated performance across work types
- **Notifications**: Unified notification center

## Alternatives Considered

### Option 1: Client-Side Merging
- Fetch tasks and checklist items separately via Supabase client
- Merge, sort, and filter in browser JavaScript
- **Pros**: Simple queries, leverages RLS on each table, flexible
- **Cons**: Multiple round trips, client-side pagination complexity, inconsistent status logic, large data transfer for MIS

### Option 2: Separate API Endpoints
- `/api/work/tasks`, `/api/work/checklist`, `/api/work/unified`
- Backend merges and paginates
- **Pros**: Single response, server-side pagination, consistent logic
- **Cons**: Additional API layer (contradicts ADR-001), duplicate RLS checks, more backend code

### Option 3: PostgreSQL View (`work_items`)
- `CREATE VIEW work_items AS SELECT ... FROM tasks UNION ALL SELECT ... FROM checklist_items`
- With `security_invoker = true` to enforce underlying table RLS
- **Pros**: Single query, server-side pagination/sorting, RLS enforced, consistent status computation, materialized-like performance
- **Cons**: View complexity, cannot index directly, `security_invoker` requires PostgreSQL 15+

## Decision

**Create a `work_items` view with `security_invoker = true` that unions tasks and checklist items, providing a unified, RLS-enforced interface for all combined queries.**

```sql
CREATE OR REPLACE VIEW public.work_items
WITH (security_invoker = true)
AS
SELECT
  t.id,
  'task'::text as kind,
  t.title,
  t.description,
  t.priority::text as priority,
  COALESCE(t.category, 'General') as category,
  t.assignee_id as employee_id,
  e.name as employee_name,
  e.email as employee_email,
  LOWER(CONCAT_WS(' ', t.title, t.description, COALESCE(t.category, 'General'), e.name, e.email)) as search_text,
  t.eta as scheduled_at,
  (t.eta AT TIME ZONE 'Asia/Kolkata')::date as scheduled_date,
  t.eta,
  NULL::date as due_date,
  NULL::timestamptz as due_at,
  t.status::text as source_status,
  CASE
    WHEN t.status::text IN ('closed', 'not_required') OR t.completed_at IS NOT NULL THEN 'completed'
    WHEN t.eta < NOW() THEN 'overdue'
    ELSE 'pending'
  END::text as effective_status,
  t.completed_at,
  t.created_at,
  NULL::uuid as template_id,
  NULL::text as checklist_frequency,
  CASE
    WHEN (t.eta AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date THEN 0
    WHEN (t.eta AT TIME ZONE 'Asia/Kolkata')::date > (NOW() AT TIME ZONE 'Asia/Kolkata')::date THEN 1
    ELSE 2
  END::smallint as sort_group,
  CASE
    WHEN (t.eta AT TIME ZONE 'Asia/Kolkata')::date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date
      THEN -EXTRACT(EPOCH FROM t.eta)
    ELSE EXTRACT(EPOCH FROM t.eta)
  END as sort_key
FROM public.tasks t
LEFT JOIN public.employees e ON e.id = t.assignee_id

UNION ALL

SELECT
  i.id,
  'checklist'::text as kind,
  i.task as title,
  'Recurring checklist item'::text as description,
  'normal'::text as priority,
  'Checklist'::text as category,
  i.employee_id,
  e.name as employee_name,
  e.email as employee_email,
  LOWER(CONCAT_WS(' ', i.task, 'Recurring checklist item', 'Checklist', e.name, e.email)) as search_text,
  COALESCE(i.due_at, i.due_date::timestamp AT TIME ZONE 'Asia/Kolkata') as scheduled_at,
  i.due_date as scheduled_date,
  NULL::timestamptz as eta,
  i.due_date,
  i.due_at,
  i.status::text as source_status,
  CASE
    WHEN i.status = 'completed' OR i.completed_at IS NOT NULL THEN 'completed'
    WHEN COALESCE(i.due_at < NOW(), i.due_date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date) THEN 'overdue'
    ELSE 'pending'
  END::text as effective_status,
  i.completed_at,
  i.created_at,
  i.template_id,
  template.frequency as checklist_frequency,
  CASE
    WHEN i.due_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date THEN 0
    WHEN i.due_date > (NOW() AT TIME ZONE 'Asia/Kolkata')::date THEN 1
    ELSE 2
  END::smallint as sort_group,
  CASE
    WHEN i.due_date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date
      THEN -EXTRACT(EPOCH FROM COALESCE(i.due_at, i.due_date::timestamp AT TIME ZONE 'Asia/Kolkata'))
    ELSE EXTRACT(EPOCH FROM COALESCE(i.due_at, i.due_date::timestamp AT TIME ZONE 'Asia/Kolkata'))
  END as sort_key
FROM public.checklist_items i
LEFT JOIN public.employees e ON e.id = i.employee_id
LEFT JOIN public.checklist_templates template ON template.id = i.template_id
WHERE i.status <> 'deactivated';
```

## Rationale

1. **Single Query for Combined Data**: Dashboard, MIS, and Tasks page fetch once
2. **RLS Enforcement**: `security_invoker = true` ensures underlying table policies apply
3. **Consistent Status Logic**: `effective_status` computed in SQL — same for all consumers
4. **Server-Side Pagination/Sorting**: `sort_group` + `sort_key` enable efficient `.range()` pagination
5. **Search Optimization**: `search_text` column enables `ILIKE` across both work types
6. **Performance**: Partial indexes on `tasks` and `checklist_items` align with view filters

## Consequences

### Positive
- Dashboard loads in single query (~50ms)
- MIS report RPC uses same view for consistency
- Pagination works correctly across combined dataset
- Real-time subscriptions on view not needed (subscribe to base tables)

### Negative
- View definition is complex (200+ lines)
- `security_invoker` requires PostgreSQL 15+ (Supabase provides)
- Cannot create indexes directly on view (relies on base table indexes)
- Schema changes to base tables require view updates
- Deactivated checklist items excluded at view level (not queryable)

### Risks
- View performance degradation with data growth (mitigated by partial indexes)
- RLS policy changes on base tables automatically affect view (usually desired)
- `NOW()` in view means results vary by query time (intentional for status)

## Implementation Notes

### Client Usage

```javascript
// lib/work-data.js
export async function getWorkItemsPage(input = {}) {
  const request = normalizeWorkListRequest(input);
  let query = supabaseBrowser()
    .from('work_items')
    .select(workListSelect, request.includeCount ? { count: 'exact' } : {})
    .order('sort_group', { ascending: true })
    .order('sort_key', { ascending: true })
    .order('kind', { ascending: true })
    .order('title', { ascending: true })
    .order('id', { ascending: true })
    .range(request.from, request.to);
  
  // Filters applied via .eq(), .gte(), .lte(), .ilike()
  // All respect RLS via security_invoker
}
```

### Supporting Indexes (Migration 20261024061358)

```sql
-- Hot open-work paths
CREATE INDEX tasks_open_eta_id_idx ON tasks(eta, id)
  WHERE completed_at IS NULL AND status NOT IN ('closed', 'not_required');

CREATE INDEX checklist_items_open_due_at_id_idx ON checklist_items(due_at, id)
  WHERE completed_at IS NULL AND status NOT IN ('completed', 'deactivated');
```

## Related ADRs

- ADR-001: Direct Database Access vs. API Layer
- ADR-002: Row Level Security as Primary Authorization
- ADR-004: Timezone Handling in Application Layer

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-02-01 | Backend Lead | Initial decision |
| 1.1.0 | 2026-11-02 | Documentation Engineering Team | Formalized for documentation suite |

---

*End of ADR-003*
# ADR-002: Row Level Security as Primary Authorization

**Status**: Accepted
**Date**: 2026-01-15
**Deciders**: Lead Architect, Security Lead
**Technical Story**: ARCH-002

---

## Context

The Delegation App handles sensitive operational data (tasks, employee info, performance metrics) with strict role-based access requirements:

- Super admins: Full access
- Assigners/EAs: Manage tasks/checklists/employees, view MIS
- Doers: Only own assigned work

Authorization must be enforced at the data layer to prevent bypass via direct database access or API manipulation.

## Alternatives Considered

### Option 1: Application-Level Authorization Middleware
- **Pros**: Familiar pattern, expressive logic (TypeScript), easy to test, framework-agnostic
- **Cons**: Can be bypassed (direct DB access, missed middleware), duplicate logic for API + direct access, performance overhead per request

### Option 2: PostgreSQL Row Level Security (RLS)
- **Pros**: Enforced at data layer (cannot bypass), works for direct DB access + API + realtime, declarative policies, leverages PostgreSQL security model
- **Cons**: SQL-only logic (limited expressiveness), debugging policy failures is harder, policy maintenance as schema evolves

### Option 3: Hybrid (RLS + Application Checks)
- **Pros**: Defense in depth, application handles complex logic, RLS as safety net
- **Cons**: Dual maintenance, potential inconsistency, more complex

## Decision

**Use PostgreSQL Row Level Security as the primary and mandatory authorization mechanism for all data access.**

- All tables: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- Policies defined per table per operation (SELECT, INSERT, UPDATE, DELETE)
- Application-level checks only for:
  - API route authorization (fail fast, better UX)
  - UI visibility (navigation, buttons)
- Service role bypasses RLS — restricted to server-only admin operations (Cron, employee management)

## Rationale

1. **Zero-Trust Data Layer**: RLS ensures authorization cannot be bypassed even with direct database credentials
2. **Realtime Compatibility**: Supabase Realtime respects RLS — subscribers only see authorized changes
3. **Direct Access Support**: ADR-001 chose direct DB access; RLS makes this secure
4. **Auditability**: Policies are visible in database schema; auditable by security team
5. **Performance**: Policy evaluation in PostgreSQL is highly optimized; often becomes initplan

## Consequences

### Positive
- Strong security guarantee: data access = policy evaluation
- Single authorization source for API, direct client, realtime, and admin tools
- No "forgot to check permission" bugs in application code
- Policies can use PostgreSQL functions (`current_employee()`, `is_manager()`)

### Negative
- Policy logic in SQL (less familiar to frontend developers)
- Complex policies can impact query performance (mitigated by `security_invoker` views)
- Debugging "why can't I see this row?" requires `EXPLAIN` and policy inspection
- Policy changes require database migration

### Risks
- Overly permissive policy → data leak (mitigated by default-deny, explicit allow)
- Overly restrictive policy → feature breakage (mitigated by integration tests)
- Policy drift between environments (mitigated by migration-only changes)

## Implementation Details

### Core Functions

```sql
-- Returns employee row for current auth user
CREATE FUNCTION current_employee() RETURNS employees 
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM employees WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- Returns true if current user has manager role
CREATE FUNCTION is_manager() RETURNS boolean
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((SELECT role IN ('super_admin','assigner','ea') 
                   FROM employees WHERE auth_user_id = auth.uid()), false)
$$;
```

### Policy Patterns

```sql
-- Employees: managers read all; users read own; managers manage all
CREATE POLICY "employees read" ON employees FOR SELECT TO authenticated
  USING (is_manager() OR auth_user_id = auth.uid());

CREATE POLICY "employees manage" ON employees FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

-- Tasks: managers read all; assignee/follower read assigned; managers create/update
CREATE POLICY "tasks read" ON tasks FOR SELECT TO authenticated
  USING (is_manager() 
    OR assignee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
    OR follower_ea_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid()));

-- Notifications: recipient or manager read/update read_at; only triggers insert
REVOKE INSERT, DELETE ON notifications FROM anon, authenticated;
GRANT SELECT ON notifications TO authenticated;
GRANT UPDATE (read_at) ON notifications TO authenticated;
```

### View with Security Invoker

```sql
-- Unified work items view — RLS enforced on underlying tables
CREATE VIEW work_items WITH (security_invoker = true) AS
  SELECT ... FROM tasks ... UNION ALL SELECT ... FROM checklist_items ...;
```

## Related ADRs

- ADR-001: Direct Database Access vs. API Layer
- ADR-003: Unified Work Items View
- ADR-009: Non-Working Day Handling

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-01-15 | Security Lead | Initial decision |
| 1.1.0 | 2026-11-02 | Documentation Engineering Team | Formalized for documentation suite |

---

*End of ADR-002*
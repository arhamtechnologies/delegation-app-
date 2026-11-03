# ADR-001: Direct Database Access vs. API Layer

**Status**: Accepted
**Date**: 2026-01-15
**Deciders**: Lead Architect, Backend Lead
**Technical Story**: ARCH-001

---

## Context

The Delegation App needs a data access strategy for the frontend to read and write data. Traditional approaches include:

1. **Custom REST/GraphQL API Layer** — Backend API mediates all database access
2. **tRPC/Type-safe RPC** — End-to-end type safety with procedure definitions
3. **Direct Database Access** — Frontend talks directly to database via Supabase client with RLS

Key requirements:
- Low-latency reads for dashboard and lists
- Real-time updates for notifications
- Minimal backend code to maintain
- Strong security (row-level permissions)

## Alternatives Considered

### Option 1: Custom REST API Layer
- **Pros**: Full control over data shapes, easy to version, familiar pattern, can aggregate multiple sources
- **Cons**: Additional latency (network hop), more code to maintain, real-time requires separate WebSocket infrastructure, duplication of authorization logic

### Option 2: tRPC with Next.js
- **Pros**: End-to-end type safety, great DX, works well with Next.js
- **Cons**: Still requires API layer, real-time not native, additional build complexity, tighter coupling to TypeScript (project is JavaScript)

### Option 3: Direct Supabase Client with RLS
- **Pros**: Lowest latency (direct to DB), native real-time via PostgreSQL publications, RLS enforces security at data layer, less backend code, Supabase manages connection pooling
- **Cons**: Tight coupling to Supabase/PostgreSQL, business logic in database (triggers, functions), harder to swap database, RLS debugging complexity, client bundle includes Supabase client

## Decision

**Use direct Supabase client access from frontend with Row Level Security as the primary authorization mechanism.**

- Browser uses `supabaseBrowser()` singleton with user's JWT
- Server components use `createSupabaseUserClient(token)` for RLS-scoped access
- Service role (`createSupabaseAdminClient()`) only for Cron jobs and admin operations
- All writes that bypass RLS (admin, Cron) use service role on server only

## Rationale

1. **Performance**: Eliminates API layer network hop; critical for dashboard metrics and real-time notifications
2. **Security**: RLS at database layer provides defense-in-depth; cannot be bypassed by client bugs
3. **Real-time**: Supabase Realtime uses PostgreSQL publications — works only with direct DB connection
4. **Maintenance**: ~80% less backend code; no DTOs, controllers, or API versioning
4. **Supabase Native**: Leverages platform capabilities (Auth, Realtime, Storage, RLS) as designed

## Consequences

### Positive
- Sub-100ms database reads from Vercel (same region)
- Real-time notifications without custom WebSocket infrastructure
- Single source of truth for authorization (database policies)
- Faster feature development (no API layer changes for new fields)

### Negative
- Vendor lock-in to Supabase/PostgreSQL
- Business logic in database (triggers, RPC functions) — harder to test in isolation
- RLS policy complexity grows with requirements
- Client bundle includes ~50KB Supabase client
- Debugging RLS policy failures requires database access

### Risks
- RLS policy error → data leak or access denial (mitigated by comprehensive policy tests)
- Supabase platform changes → migration effort
- Complex queries may need RPC functions instead of client-side joins

## Implementation Notes

- `lib/supabase-browser.js`: Browser singleton with `trackingFetch` for mutation detection
- `lib/supabase-server.js`: `createSupabaseUserClient(token)` for server components, `createSupabaseAdminClient()` for admin
- `lib/auth.js`: `getCurrentEmployee()` caches employee profile (30s TTL)
- All tables have `enable row level security` with policies per role

## Related ADRs

- ADR-002: Row Level Security as Primary Authorization
- ADR-003: Unified Work Items View
- ADR-005: Idempotent Notification Delivery

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-01-15 | Lead Architect | Initial decision |
| 1.1.0 | 2026-11-02 | Documentation Engineering Team | Formalized for documentation suite |

---

*End of ADR-001*
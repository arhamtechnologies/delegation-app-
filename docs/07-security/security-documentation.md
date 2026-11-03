# Security Documentation

**Software/Project Name:** Delegation App
**Document ID:** DOC-SEC-001
**Version:** 1.0.0
**Status:** Draft
**Author:** Documentation Engineering Team
**Creation Date:** 2026-11-02
**Last Updated:** 2026-11-02

---

## Table of Contents

1. [Security Overview](#1-security-overview)
2. [Authentication Mechanisms](#2-authentication-mechanisms)
3. [Authorization and RBAC](#3-authorization-and-rbac)
4. [Session Management](#4-session-management)
5. [Token Management](#5-token-management)
6. [Input Validation](#6-input-validation)
7. [Data Protection](#7-data-protection)
8. [Secrets Management](#8-secrets-management)
9. [Encryption](#9-encryption)
10. [Audit Logging](#10-audit-logging)
11. [Security Risks and Mitigations](#11-security-risks-and-mitigations)
12. [Dependency Security](#12-dependency-security)
13. [Backup and Recovery](#13-backup-and-recovery)
14. [OWASP Considerations](#14-owasp-considerations)
15. [Security Gaps](#15-security-gaps)

---

## 1. Security Overview

The Delegation App implements a defense-in-depth security model:

| Layer | Mechanism | Coverage |
|-------|-----------|----------|
| **Network** | HTTPS only (Vercel), Supabase TLS | All traffic |
| **Application** | Next.js CSP, Secure headers | Browser |
| **Authentication** | Supabase Auth (email/password, JWT) | Identity |
| **Authorization** | PostgreSQL RLS (primary) + Server checks | Data access |
| **Data** | Encryption at rest (Supabase), TLS in transit | Storage |
| **Secrets** | Vercel Environment Variables (server-only) | Configuration |
| **Audit** | Immutable audit tables + triggers | Accountability |

### Security Principles

1. **Zero Trust Data Layer**: RLS on all tables; no bypass possible
2. **Least Privilege**: Service role only for Cron/admin; never in client
3. **Immutable Audit**: Task updates, checklist completions never deleted
4. **Secure by Default**: Deny-by-default RLS policies
5. **No Secrets in Client**: `NEXT_PUBLIC_*` only for publishable keys

---

## 2. Authentication Mechanisms

### 2.1 Primary: Email/Password (Supabase Auth)

| Aspect | Implementation |
|--------|----------------|
| **Provider** | Supabase Auth (managed) |
| **Method** | Email + password |
| **MFA** | Not implemented (requirement: ASM-001) |
| **Social/SSO** | Not implemented (requirement: ASM-001) |
| **Password Policy** | Supabase default (min 8 chars) |
| **Email Confirmation** | Required (`email_confirm: true` on invite) |
| **Session** | JWT (access_token + refresh_token) |

### 2.2 Session Flow

```
1. User submits credentials → Supabase Auth
2. Supabase returns: { access_token, refresh_token, expires_at, user }
3. Client: supabaseBrowser().auth.onAuthStateChange → writeAuthCookie(access_token)
4. Cookie: dl_access_token=access_token; Path=/; SameSite=Lax; Secure; Max-Age=expires_in
5. Server: getServerSession() reads cookie → decode JWT → validate exp → createSupabaseUserClient()
6. RLS client used for all server-side data access
```

### 2.3 Password Reset Flow

```
1. User → /forgot-password → enters email
2. Server → supabaseRecoveryBrowser().auth.resetPasswordForEmail(email, { redirectTo: /update-password })
3. Supabase sends reset email with PKCE link
4. User clicks link → /update-password?code=...&type=recovery
5. Client → supabaseRecoveryBrowser().auth.exchangeCodeForSession(code)
6. User sets new password → supabaseRecoveryBrowser().auth.updateUser({ password })
7. Redirect → /dashboard
```

### 2.4 First Login Password Change

- New employees created with `must_change_password=true`
- `AppFrame` detects → redirects to `/change-password`
- User submits new password → `/api/account/complete-password-change`
- Server updates `employees.must_change_password=false`
- Redirect → `/dashboard`

---

## 3. Authorization and RBAC

### 3.1 Role Definitions

| Role | Code | Database Enum | Description |
|------|------|---------------|-------------|
| Super Admin | `super_admin` | `app_role` | Full workspace control |
| Assigner | `assigner` | `app_role` | Delegates work, manages team |
| Executive Assistant | `ea` | `app_role` | Supports assigner, manages calendar |
| Doer | `doer` | `app_role` | Executes assigned work |

### 3.2 Permission Matrix

| Action | super_admin | assigner | ea | doer |
|--------|-------------|----------|-----|------|
| Create tasks | ✅ | ✅ | ✅ | ❌ |
| View all tasks | ✅ | ✅ | ✅ | Own only |
| Update tasks | ✅ | ✅ | ✅ | Assigned only |
| Delete tasks | ✅ | ✅ | ✅ | ❌ |
| Create checklists | ✅ | ✅ | ✅ | ❌ |
| Manage checklists | ✅ | ✅ | ✅ | Own only |
| Complete checklists | ✅ | Own | ✅ | Own only |
| View MIS | ✅ | ✅ | ✅ | ❌ |
| Manage employees | ✅ | ✅ | ✅ | ❌ |
| Reset passwords | ✅ | ❌ | ❌ | ❌ |
| Change emails | ✅ | ❌ | ❌ | ❌ |
| Manage calendar | ✅ | ❌ | ✅ | ❌ |
| Delete employees | ✅ | ✅ | ✅ | ❌ |

### 3.3 RLS Policy Implementation

All tables have `ENABLE ROW LEVEL SECURITY` with policies per operation.

**Example: Tasks**

```sql
-- Read: Managers see all; assignees/followers see assigned
CREATE POLICY "tasks read" ON tasks FOR SELECT TO authenticated
USING (
  is_manager() 
  OR assignee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
  OR follower_ea_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid())
);

-- Create: Managers only, must be creator
CREATE POLICY "tasks create" ON tasks FOR INSERT TO authenticated
WITH CHECK (is_manager() AND created_by = auth.uid());

-- Update: Managers or assignee
CREATE POLICY "tasks update" ON tasks FOR UPDATE TO authenticated
USING (is_manager() OR assignee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid()))
WITH CHECK (is_manager() OR assignee_id = (SELECT id FROM employees WHERE auth_user_id = auth.uid()));
```

### 3.4 Server-Side Authorization Checks

API routes perform additional role verification for mutations:

```javascript
// lib/checklist-server.js
export async function authorizeChecklistManager(request) {
  const token = getBearerToken(request);
  const userClient = createSupabaseUserClient(token);
  const { data: { user } } = await userClient.auth.getUser(token);
  const { data: employee } = await userClient.from('employees').select('id,name,role').eq('auth_user_id', user.id).maybeSingle();
  
  if (!employee || !checklistManagerRoles.has(employee.role)) {
    return { response: checklistApiError('You do not have permission to manage checklists.', 403) };
  }
  return { token, user, employee, userClient, admin: createSupabaseAdminClient() };
}
```

---

## 4. Session Management

### 4.1 Client-Side Session

| Aspect | Implementation |
|--------|----------------|
| **Storage** | Supabase client (IndexedDB/localStorage via `persistSession: true`) |
| **Auto-Refresh** | `autoRefreshToken: true` (refreshes 30s before expiry) |
| **Detection** | `detectSessionInUrl: true` (handles OAuth/PKCE callbacks) |
| **Cookie Sync** | `dl_access_token` cookie mirrored for server components |

### 4.2 Server-Side Session

| Aspect | Implementation |
|--------|----------------|
| **Source** | `dl_access_token` cookie (set by client) |
| **Validation** | JWT decode → check `exp` > now + 15s buffer |
| **Client Creation** | `createSupabaseUserClient(token)` — RLS-scoped |
| **Caching** | Per-request via React `cache()` |
| **Employee Profile** | Fetched once per request (`current_employee()` equivalent) |

### 4.3 Session Invalidation

| Trigger | Action |
|---------|--------|
| Sign out | `clearAuthCache()` + `supabase.auth.signOut()` + cookie clear |
| Password change | `clearAuthCache()` + new session |
| Role change | `invalidateCurrentEmployee()` |
| Token expiry | Auto-refresh via Supabase client |

---

## 5. Token Management

### 5.1 Access Token (JWT)

| Property | Value |
|----------|-------|
| **Algorithm** | ES256 (Supabase default) |
| **Claims** | `sub` (user_id), `email`, `role`, `exp`, `iat`, `aud` |
| **Expiry** | 1 hour (Supabase default) |
| **Refresh** | Automatic via refresh_token |
| **Client Access** | `getAccessToken({ forceRefresh })` |
| **Server Access** | From `dl_access_token` cookie |

### 5.2 Refresh Token

| Property | Value |
|----------|-------|
| **Storage** | Supabase client (secure, httpOnly-equivalent) |
| **Rotation** | Automatic on use |
| **Reuse Detection** | Supabase handles (revokes on reuse) |

### 5.3 Service Role Token

| Property | Value |
|----------|-------|
| **Usage** | Server-only: Cron, admin operations, employee management |
| **Storage** | Vercel Environment Variable `SUPABASE_SERVICE_ROLE_KEY` |
| **Access** | `createSupabaseAdminClient()` — bypasses all RLS |
| **Exposure** | **Never** in client code; no `NEXT_PUBLIC_` prefix |

---

## 6. Input Validation

### 6.1 Client-Side (Zod)

```javascript
// Example: Checklist template validation
const templateSchema = z.object({
  employee_id: z.string().uuid(),
  task: z.string().min(1).max(240),
  frequency: z.enum(['daily', 'weekly', 'every_15_days', 'monthly']),
  weekday: z.number().int().min(0).max(6).optional(),
  day_of_month: z.number().int().min(1).max(31).optional(),
  monthly_days: z.array(z.number().int().min(1).max(31)).optional(),
  start_date: z.string().date(),
  due_time: z.string().time(),
  active: z.boolean(),
});
```

### 6.2 Server-Side (API Routes)

```javascript
// Example: Employee creation validation
function validatePayload(payload) {
  const name = payload?.name?.trim();
  const email = payload?.email?.trim().toLowerCase();
  const role = payload?.role;
  
  if (!name) return { error: 'Full name is required.' };
  if (name.length > 120) return { error: 'Full name must be 120 characters or fewer.' };
  if (!emailPattern.test(email)) return { error: 'A valid work email is required.' };
  if (!employeeRoles.has(role)) return { error: 'Choose a valid workspace role.' };
  // ...
}
```

### 6.3 Database Constraints

- Enum types: `app_role`, `task_status`, `task_priority`
- Check constraints: Schedule fields, completion fields, date ranges
- Unique constraints: Prevent duplicates
- Foreign keys: Referential integrity

---

## 7. Data Protection

### 7.1 Data Classification

| Data Type | Classification | Protection |
|-----------|----------------|------------|
| Employee PII (name, email, mobile) | Confidential | RLS, TLS, encrypted at rest |
| Task content | Internal | RLS, TLS |
| Performance metrics | Internal | RLS, TLS |
| Authentication tokens | Secret | HttpOnly cookie, never logged |
| Service role key | Secret | Vercel env, never in client |
| Proof screenshots | Confidential | Supabase Storage (private) |

### 7.2 Encryption

| State | Mechanism |
|-------|-----------|
| **At Rest** | Supabase managed (AES-256) |
| **In Transit** | TLS 1.2+ (Vercel ↔ Supabase, Browser ↔ Vercel) |
| **Application** | None (rely on transport + storage encryption) |

### 7.3 Data Minimization

- Only required fields collected
- No unnecessary PII stored
- Proof screenshots optional, user-controlled

---

## 8. Secrets Management

### 8.1 Secret Inventory

| Secret | Scope | Storage | Rotation |
|--------|-------|---------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Vercel Env | Manual |
| `CRON_SECRET` | Server | Vercel Env | Manual |
| `RESEND_API_KEY` | Server | Vercel Env | Manual |
| `RESEND_FROM_EMAIL` | Server | Vercel Env | Manual |
| `GREEN_API_TOKEN` | Server | Vercel Env | Manual |
| `GREEN_WEBHOOK_TOKEN` | Server | Vercel Env | Manual |
| `ANTHROPIC_API_KEY` | Server | Vercel Env | Manual |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client+Server | Vercel Env + `.env.local` | Manual |
| `NEXT_PUBLIC_SUPABASE_URL` | Client+Server | Vercel Env + `.env.local` | Manual |

### 8.2 Secret Handling Rules

1. **No secrets in code**: All via environment variables
2. **No `NEXT_PUBLIC_` for secrets**: Only publishable keys
3. **Vercel Environments**: Separate values for Production/Preview/Development
4. **Local Development**: `.env.local` (gitignored)
5. **Rotation**: Manual process; documented in operations manual

### 8.3 Credential Hygiene

- Rotate if shared in chat/email (README §8.3)
- Use Supabase Dashboard to revoke compromised keys
- Monitor Supabase logs for unusual activity

---

## 9. Encryption

### 9.1 Database Encryption

- **Provider**: Supabase (AWS RDS encrypted storage)
- **Algorithm**: AES-256
- **Key Management**: AWS KMS (managed by Supabase)

### 9.2 Network Encryption

| Connection | Protocol | Certificate |
|------------|----------|-------------|
| Browser → Vercel | HTTPS (TLS 1.3) | Vercel managed |
| Vercel → Supabase | TLS 1.2+ | Supabase managed |
| Vercel → Resend | HTTPS (TLS 1.2+) | Public CA |
| Vercel → Green API | HTTPS (TLS 1.2+) | Public CA |
| Vercel → Anthropic | HTTPS (TLS 1.2+) | Public CA |

### 9.3 Application-Level

- No field-level encryption (rely on transport + storage)
- JWT tokens signed (not encrypted) — standard practice
- Proof screenshots stored in Supabase Storage (private buckets)

---

## 10. Audit Logging

### 10.1 Immutable Audit Tables

| Table | Trigger | Captures |
|-------|---------|----------|
| `task_updates` | AFTER INSERT/UPDATE on `tasks` | All task changes |
| `checklist_item_updates` | AFTER INSERT/UPDATE on `checklist_items` | All checklist item changes |
| `checklist_non_working_day_operations` | RPC `deactivate_checklist_items_for_non_working_day` | Bulk deactivation |
| `notifications` | Database triggers | All notification events |

### 10.2 Audit Fields

| Field | Purpose |
|-------|---------|
| `created_at` | Timestamp |
| `author_user_id` / `completed_by` | Actor |
| `update_type` | Classification |
| `remark` / `proof_url` | Evidence |
| `dedupe_key` (notifications) | Idempotency |

### 10.3 Tamper Resistance

- No DELETE policies on audit tables
- No UPDATE policies (except `read_at` on notifications)
- Service role can delete but not used in normal operations
- Triggers use `SECURITY DEFINER` with revoked public execute

---

## 11. Security Risks and Mitigations

### 11.1 Identified Risks

| Risk ID | Risk | Likelihood | Impact | Mitigation |
|---------|------|------------|--------|------------|
| SEC-001 | RLS policy misconfiguration → data leak | Medium | High | Comprehensive policy tests; staging validation |
| SEC-002 | Service role key exposure | Low | Critical | Never in client; Vercel env only; rotation procedure |
| SEC-003 | Supabase Auth vulnerability | Low | High | Managed by Supabase; monitor advisories |
| SEC-004 | XSS via user content | Low | Medium | React auto-escaping; CSP headers |
| SEC-005 | CSRF | Low | Medium | SameSite=Lax cookies; Bearer tokens |
| SEC-006 | Brute force login | Medium | Medium | Supabase rate limiting; monitor logs |
| SEC-007 | Dependency vulnerability | Medium | Medium | `npm audit`; Dependabot; regular updates |
| SEC-008 | Proof screenshot exposure | Low | Medium | Private Supabase Storage; signed URLs if needed |
| SEC-009 | WhatsApp webhook spoofing | Low | Medium | `GREEN_WEBHOOK_TOKEN` validation |
| SEC-010 | Employee enumeration via API | Low | Low | RLS limits to authorized data |

### 11.2 OWASP Top 10 Coverage

| OWASP Category | Coverage | Notes |
|----------------|----------|-------|
| A01: Broken Access Control | ✅ | RLS + server checks |
| A02: Cryptographic Failures | ✅ | TLS everywhere, encrypted storage |
| A03: Injection | ✅ | Parameterized queries (Supabase client) |
| A04: Insecure Design | ✅ | Security by default, threat modeling |
| A05: Security Misconfiguration | ⚠️ | CSP could be stricter; no HSTS preload |
| A06: Vulnerable Components | ⚠️ | Dependabot enabled; regular updates needed |
| A07: Authentication Failures | ✅ | Supabase Auth managed |
| A08: Software Integrity Failures | ✅ | Vercel builds from Git; signed commits |
| A09: Logging/Monitoring Failures | ⚠️ | Basic logging; no SIEM integration |
| A10: SSRF | ✅ | No server-side fetch to user URLs |

---

## 12. Dependency Security

### 12.1 Key Dependencies (Production)

| Package | Version | Purpose | Last Audit |
|---------|---------|---------|------------|
| `@supabase/supabase-js` | ^2.55.0 | Database/Auth client | 2026-10 |
| `next` | ^15.4.0 | Framework | 2026-10 |
| `react` / `react-dom` | ^19.1.0 | UI | 2026-10 |
| `zod` | ^4.6.7 | Validation | 2026-10 |
| `@anthropic-ai/sdk` | ^1.3.0 | WhatsApp AI | 2026-10 |
| `read-excel-file` | 9.3.10 | Excel import | 2026-10 |

### 12.2 Security Practices

- `npm audit` in CI pipeline
- Dependabot alerts enabled on GitHub
- Lockfile committed (`package-lock.json`)
- Minimal dependencies (no UI framework)

---

## 13. Backup and Recovery

### 13.1 Database Backups

| Backup Type | Frequency | Retention | Recovery |
|-------------|-----------|-----------|----------|
| Automated (Supabase) | Daily | 7 days (PITR) | Point-in-time |
| Manual (Pre-migration) | On-demand | Indefinite | Full restore |

### 13.2 Code/Config Backups

| Asset | Backup Method |
|-------|---------------|
| Source Code | GitHub (primary + mirrors) |
| Vercel Config | Git-tracked (`vercel.json`, `next.config.mjs`) |
| Environment Variables | Documented in `.env.example`; stored in password manager |
| Supabase Migrations | Git-tracked (`supabase/migrations/`) |

### 13.3 Recovery Procedures

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Database corruption | < 1 hour | < 24 hours | Supabase PITR restore |
| Accidental data deletion | < 1 hour | < 24 hours | Supabase PITR restore |
| Vercel outage | < 30 min | 0 | Vercel multi-region; DNS failover |
| Secret compromise | < 1 hour | 0 | Rotate in Vercel; revoke in provider |

---

## 14. OWASP Considerations

### 14.1 Implemented Controls

| Control | Implementation |
|---------|----------------|
| **Access Control** | RLS on all tables; server-side role checks |
| **Authentication** | Supabase Auth (industry standard) |
| **Session Management** | JWT with auto-refresh; secure cookies |
| **Input Validation** | Zod schemas + database constraints |
| **Output Encoding** | React auto-escaping |
| **CSP** | Next.js defaults (`script-src 'self'`) |
| **HTTPS** | Vercel enforced |
| **Security Headers** | Next.js defaults + custom for SW |
| **Error Handling** | Generic messages; no stack traces in production |
| **Logging** | Structured logging with error codes |

### 14.2 Recommended Enhancements

| Enhancement | Priority | Effort |
|-------------|----------|--------|
| Stricter CSP (nonce-based) | Medium | Medium |
| HSTS preload | Low | Low |
| Security headers audit | Medium | Low |
| Penetration testing | High | High |
| SIEM integration | Medium | High |
| Rate limiting (application-level) | Medium | Medium |
| MFA support | Medium | High |
| SAML/OIDC federation | Low | High |

---

## 15. Security Gaps

### 15.1 Known Gaps (Requires Verification)

| Gap ID | Description | Status | Owner |
|--------|-------------|--------|-------|
| GAP-001 | No MFA support | Known limitation | Backlog |
| GAP-002 | No SAML/OIDC federation | Known limitation | Backlog |
| GAP-003 | CSP not customized (Next.js defaults only) | Identified | Security |
| GAP-004 | No application-level rate limiting | Identified | Backend |
| GAP-005 | No centralized security logging/SIEM | Identified | Ops |
| GAP-006 | Password policy not configurable (Supabase default) | Known limitation | Backlog |
| GAP-007 | No session concurrent limit | Identified | Backlog |
| GAP-008 | No automated dependency scanning in CI | Identified | DevOps |
| GAP-009 | Proof screenshots not encrypted at application layer | Accepted risk | - |
| GAP-010 | WhatsApp bot webhook lacks replay protection | Identified | Backend |

### 15.2 Accepted Risks

| Risk | Justification |
|------|---------------|
| No MFA | Internal tool; email/password sufficient for current threat model |
| No SAML/OIDC | Single workspace; no enterprise SSO requirement |
| Basic CSP | No user-generated HTML/Scripts; React prevents XSS |
| No app-level rate limiting | Vercel + Supabase provide infrastructure-level protection |

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-11-02 | Documentation Engineering Team | Initial version |

---

*End of Security Documentation*
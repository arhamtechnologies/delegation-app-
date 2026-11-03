# Operations & Maintenance Manual

**Software/Project Name:** Delegation App
**Document ID:** DOC-OPS-001
**Version:** 1.0.0
**Status:** Draft
**Author:** Documentation Engineering Team
**Creation Date:** 2026-11-02
**Last Updated:** 2026-11-02

---

## Table of Contents

1. [Routine Operational Activities](#1-routine-operational-activities)
2. [Monitoring and Health Checks](#2-monitoring-and-health-checks)
3. [Log Management](#3-log-management)
4. [Error Investigation](#4-error-investigation)
5. [Incident Response](#5-incident-response)
6. [Common Troubleshooting Procedures](#6-common-troubleshooting-procedures)
7. [Database Maintenance](#7-database-maintenance)
8. [Backup and Restoration](#8-backup-and-restoration)
9. [Dependency Updates](#9-dependency-updates)
10. [Version Upgrades](#10-version-upgrades)
11. [Production Support Procedures](#11-production-support-procedures)

---

## 1. Routine Operational Activities

### 1.1 Daily Operations

| Activity | Time | Owner | Verification |
|----------|------|-------|--------------|
| **Checklist Generation** | 00:30 UTC (auto) | Cron | Vercel Cron logs → success |
| **Proof Cleanup** | 21:00 UTC (auto) | Cron | Vercel Cron logs → success |
| **Error Log Review** | Morning | On-call | Vercel/Supabase dashboards |
| **Cron Job Status** | Morning | On-call | Vercel Cron dashboard |
| **Email Delivery** | Ongoing | System | Resend dashboard |

### 1.2 Weekly Operations

| Activity | Day | Owner | Procedure |
|----------|-----|-------|-----------|
| **Dependency Audit** | Monday | DevOps | `npm audit` → address critical/high |
| **Supabase Health** | Wednesday | DBA | Dashboard → CPU, connections, disk |
| **Vercel Analytics** | Friday | DevOps | Review function duration, errors |
| **Security Scan** | Friday | Security | GitHub Dependabot alerts |

### 1.3 Monthly Operations

| Activity | Owner | Procedure |
|----------|-------|-----------|
| **Secret Rotation** | DevOps | Rotate `CRON_SECRET`, verify Cron works |
| **Backup Verification** | DBA | Supabase PITR test restore |
| **Performance Review** | Team | Analyze slow queries, optimize |
| **Capacity Planning** | DBA | Review Supabase usage trends |

---

## 2. Monitoring and Health Checks

### 2.1 Key Metrics Dashboard

| Metric | Source | Alert Threshold | Dashboard |
|--------|--------|-----------------|-----------|
| **Function Duration (p95)** | Vercel Analytics | > 10s | Vercel → Analytics |
| **Function Error Rate** | Vercel Analytics | > 1% | Vercel → Analytics |
| **Build Success Rate** | Vercel Deployments | < 100% | Vercel → Deployments |
| **Cron Success Rate** | Vercel Cron | < 100% | Vercel → Cron |
| **Database CPU** | Supabase Dashboard | > 80% sustained | Supabase → Database |
| **Database Connections** | Supabase Dashboard | > 80% of limit | Supabase → Database |
| **Disk Usage** | Supabase Dashboard | > 80% | Supabase → Database |
| **Auth Error Rate** | Supabase Logs | Spike | Supabase → Logs |
| **Realtime Connections** | Supabase Dashboard | Drop to 0 | Supabase → Realtime |
| **Email Delivery Rate** | Resend Dashboard | < 95% | Resend → Dashboard |

### 2.2 Health Check Endpoints

```javascript
// Optional: Add to app/api/health/route.js
export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from('employees').select('id').limit(1);
    if (error) throw error;
    return Response.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      checks: { database: 'ok' }
    });
  } catch (e) {
    return Response.json({ 
      status: 'unhealthy', 
      error: e.message,
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}
```

### 2.3 Alerting Channels

| Channel | Purpose | Configuration |
|---------|---------|---------------|
| **Vercel Alerts** | Build failures, function errors | Vercel Dashboard → Notifications |
| **Supabase Alerts** | Database issues | Supabase Dashboard → Settings → Alerts |
| **GitHub Dependabot** | Security vulnerabilities | Automatic on repo |
| **Manual Escalation** | Critical incidents | Team Slack/Email |

---

## 3. Log Management

### 3.1 Log Sources

| Source | Access | Retention | Format |
|--------|--------|-----------|--------|
| **Vercel Function Logs** | Vercel Dashboard → Functions | 30 days | Structured JSON |
| **Supabase Logs** | Supabase Dashboard → Logs | 7 days | PostgreSQL/PostgREST |
| **Browser Console** | Client DevTools | Session | Console API |
| **Resend Logs** | Resend Dashboard | 30 days | JSON |
| **Green API Logs** | Green API Dashboard | 30 days | JSON |

### 3.2 Log Levels (Application)

| Level | Usage | Example |
|-------|-------|---------|
| `console.error` | Errors requiring action | `'[mis] get_work_report failed', { code, message }` |
| `console.warn` | Warnings, degraded performance | `'[mis] get_work_report returned zero visible rows'` |
| `console.info` | Performance metrics | `'[performance] work list query', { durationMs, rowCount }` |
| `console.log` | Debug (dev only) | `'[debug] Server:', data` |

### 3.3 Structured Logging Format

```javascript
// Used in codebase
console.error('[mis] get_work_report failed', {
  query: 'get_work_report',
  durationMs: 1250,
  filters: { workType: 'all', status: 'pending' },
  code: 'PGRST204',
  message: 'relation "work_items" does not exist',
  details: null,
  hint: null
});
```

### 3.4 Log Queries

**Vercel**: Dashboard → Functions → Select function → Filter by time/error

**Supabase**: Dashboard → Logs → Filter by level, time, schema

**Common Queries**:
```
# Vercel: Function errors last 1h
level:error timestamp:>1h

# Supabase: RLS violations
level:error message:"row-level security"

# Supabase: Slow queries
duration:>1000
```

---

## 4. Error Investigation

### 4.1 Error Classification

| Category | Examples | Response |
|----------|----------|----------|
| **Auth Errors** | 401, session expired | User action (re-login) |
| **Authorization** | 403, RLS violation | Check role/policy |
| **Validation** | 400, bad payload | Client fix |
| **Database** | 500, constraint, missing column | Migration/fix |
| **External API** | 503, Resend/Green API down | Retry/fallback |
| **Timeout** | 504, function timeout | Optimize query |

### 4.2 Investigation Workflow

```
1. Alert/Report Received
       ↓
2. Identify Error Category (logs, status code)
       ↓
3. Check Recent Deployments (Vercel → Deployments)
       ↓
4. Check Database Migrations (Supabase → Migrations)
       ↓
5. Reproduce Locally (if possible)
       ↓
6. Apply Fix / Rollback
       ↓
7. Verify Fix
       ↓
8. Document in Incident Log
```

### 4.3 Common Error Patterns

| Error | Pattern | Investigation |
|-------|---------|---------------|
| `PGRST116` | No rows returned | Check RLS policies, filters |
| `PGRST204` | Schema cache stale | Supabase → Database → Restart API |
| `42501` | Permission denied | Check RLS, role, service role usage |
| `23505` | Unique violation | Check duplicate handling |
| `23503` | FK violation | Check referenced record exists |
| `ETIMEDOUT` | Function timeout | Check query, add index, increase timeout |

---

## 5. Incident Response

### 5.1 Severity Levels

| Severity | Definition | Response Time | Escalation |
|----------|------------|---------------|------------|
| **SEV-1** | Complete outage, data loss | 15 min | Page on-call + lead |
| **SEV-2** | Major feature broken | 1 hour | On-call + team |
| **SEV-3** | Minor issue, workaround exists | 4 hours | Team |
| **SEV-4** | Cosmetic, non-blocking | Next sprint | Backlog |

### 5.2 Incident Response Process

```
1. DETECT
   - Alert fires or user reports
   - Create incident in tracker (GitHub Issue/Linear)

2. TRIAGE
   - Assign severity
   - Assign owner
   - Communicate to stakeholders

3. INVESTIGATE
   - Check logs (Vercel, Supabase)
   - Check recent changes (deployments, migrations)
   - Reproduce if possible

4. RESOLVE
   - Apply fix (code, config, rollback)
   - Verify in staging if risky
   - Deploy to production

5. RECOVER
   - Monitor for regression
   - Confirm user impact resolved

6. POSTMORTEM (SEV-1/2)
   - Root cause analysis
   - Action items for prevention
   - Share with team
```

### 5.3 Communication Templates

**Internal (Slack)**:
```
🚨 INCIDENT: [SEV-X] Brief description
Impact: [User-facing impact]
Owner: @person
Status: Investigating/Resolved
Updates: [Thread]
```

**External (Status Page/Email)**:
```
We're experiencing issues with [feature]. Our team is investigating.
Estimated resolution: [time]
We'll update at [interval].
```

---

## 6. Common Troubleshooting Procedures

### 6.1 Authentication Issues

| Symptom | Diagnosis | Resolution |
|---------|-----------|------------|
| Redirect loop to `/login` | `must_change_password=true` | Complete `/change-password` |
| "Auth session missing" | Cookie expired/cleared | Sign out → sign in |
| 401 on API calls | Token expired | `getAccessToken({ forceRefresh: true })` |
| Role not recognized | `employees` row missing | Create employee row for auth user |

### 6.2 Database Issues

| Symptom | Diagnosis | Resolution |
|---------|-----------|------------|
| "Column does not exist" | Migration not applied | Run missing migration in Supabase |
| "RLS policy violation" | Policy too restrictive | Verify `is_manager()`, `current_employee()` |
| "Duplicate key" | Unique constraint | Use upsert with `ignoreDuplicates` |
| Slow queries | Missing indexes | Check `pg_stat_statements`, add indexes |
| Connection pool exhausted | Too many connections | Check for connection leaks, increase pool |

### 6.3 Checklist Generation Issues

| Symptom | Diagnosis | Resolution |
|---------|-----------|------------|
| Generation fails | Missing migration (004, 006) | Apply referenced migration |
| Items not created | Template not due today | Check `isChecklistDueOnDate` logic |
| Wrong status | Timezone mismatch | Verify `CHECKLIST_TIMEZONE` env vars |
| Cron not running | Vercel Cron disabled | Check Vercel → Cron dashboard |

### 6.4 Email Issues

| Symptom | Diagnosis | Resolution |
|---------|-----------|------------|
| Invitation not sent | Resend not configured | Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Email bounce | Domain not verified | Verify domain in Resend |
| Link expired | Token > 1hr old | Request new password reset |

### 6.5 Real-time Issues

| Symptom | Diagnosis | Resolution |
|---------|-----------|------------|
| No live notifications | Realtime not enabled | Supabase → Realtime → Enable publications |
| Duplicate notifications | Missing dedupe_key | Verify `insert_notification_event` usage |
| Channel not subscribing | RLS blocks | Verify user has SELECT on table |

---

## 7. Database Maintenance

### 7.1 Regular Maintenance Tasks

| Task | Frequency | Procedure |
|------|-----------|-----------|
| **Analyze Statistics** | Weekly | `ANALYZE;` (Supabase auto) |
| **Vacuum** | Auto (autovacuum) | Supabase managed |
| **Index Review** | Monthly | `pg_stat_user_indexes` → drop unused |
| **Slow Query Review** | Weekly | `pg_stat_statements` → optimize |
| **Disk Usage Check** | Daily | Supabase Dashboard → Database |
| **Connection Count** | Daily | Supabase Dashboard → Database |

### 7.2 Index Maintenance

```sql
-- Check index usage
SELECT * FROM pg_stat_user_indexes 
WHERE idx_scan = 0 AND schemaname = 'public';

-- Check table bloat
SELECT * FROM pgstattuple('tasks');

-- Reindex if needed (during maintenance window)
REINDEX TABLE CONCURRENTLY tasks;
```

### 7.3 Partitioning (Future)

| Table | Partition Strategy | When |
|-------|-------------------|------|
| `notifications` | By month (`created_at`) | > 1M rows |
| `task_updates` | By month (`created_at`) | > 500k rows |
| `checklist_items` | By month (`due_date`) | > 500k rows |

---

## 8. Backup and Restoration

### 8.1 Backup Strategy

| Backup Type | Frequency | Retention | Location |
|-------------|-----------|-----------|----------|
| **Supabase PITR** | Continuous | 7 days | Supabase (AWS) |
| **Manual Snapshot** | Pre-migration | Indefinite | Supabase Dashboard |
| **Logical Export** | Monthly (optional) | 1 year | Application (CSV/SQL) |

### 8.2 Restoration Procedures

#### Point-in-Time Recovery (Supabase)

1. Go to **Supabase Dashboard** → **Database** → **Backups**
2. Click **Restore** → Select timestamp
3. Choose **New project** or **Existing**
4. Wait for restore (10-60 min depending on size)
5. Update Vercel env vars if new project

#### Table-Level Recovery

1. Export from backup project: `pg_dump -t table_name`
2. Import to production: `psql < dump.sql`
3. **Caution**: May violate FK constraints

#### Code Rollback (No DB Rollback)

```bash
# Vercel rollback
vercel rollback <deployment-url> --prod

# Git rollback (code only)
git revert <bad-commit>
git push origin main
```

### 8.3 Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Database corruption | < 1 hour | < 24 hours |
| Accidental DELETE | < 30 min | < 5 min (PITR) |
| Migration failure | < 15 min | 0 (pre-migration snapshot) |
| Vercel outage | < 30 min | 0 (multi-region) |

---

## 9. Dependency Updates

### 9.1 Update Schedule

| Category | Frequency | Process |
|----------|-----------|---------|
| **Security Patches** | Immediate (Dependabot) | Auto-merge if tests pass |
| **Minor Versions** | Weekly | Manual review + test |
| **Major Versions** | Quarterly | Planned sprint + full regression |

### 9.2 Update Procedure

```bash
# 1. Check outdated
npm outdated

# 2. Update (patch/minor)
npm update

# 3. Or specific package
npm install package@latest

# 4. Run tests
npm run test
npm run lint
npm run build

# 5. Commit
git add package.json package-lock.json
git commit -m "chore: update dependencies"
```

### 9.3 Critical Dependencies

| Package | Update Policy |
|---------|---------------|
| `@supabase/supabase-js` | Test thoroughly; breaking changes possible |
| `next` | Major versions: dedicated sprint |
| `react` / `react-dom` | Sync with Next.js compatibility |
| `zod` | Low risk; update freely |
| `@anthropic-ai/sdk` | Test WhatsApp bot after update |

---

## 10. Version Upgrades

### 10.1 Next.js Upgrade

| Version | Key Changes | Migration Effort |
|---------|-------------|------------------|
| 14 → 15 | App Router stable, Turbopack, React 19 | Medium (test all routes) |

### 10.2 React Upgrade

| Version | Key Changes | Migration Effort |
|---------|-------------|------------------|
| 18 → 19 | Compiler, new hooks, concurrent features | Low (mostly compatible) |

### 10.3 Supabase Platform Upgrades

- **Handled by Supabase**: PostgreSQL version, extensions, Auth
- **Monitor**: Supabase changelog for breaking changes
- **Test**: After Supabase maintenance windows

### 10.4 Upgrade Checklist

- [ ] Read release notes / migration guide
- [ ] Update in development branch
- [ ] Run full test suite
- [ ] Manual E2E testing
- [ ] Deploy to Preview
- [ ] Team review
- [ ] Deploy to Production
- [ ] Post-deploy verification

---

## 11. Production Support Procedures

### 11.1 Support Tiers

| Tier | Scope | SLA | Team |
|------|-------|-----|------|
| **L1** | User issues (login, password, basic usage) | 4 hours | Support team |
| **L2** | Technical issues (bugs, data issues) | 2 hours | Developers |
| **L3** | Infrastructure, security, critical bugs | 30 min | Leads + On-call |

### 11.2 Common Support Requests

| Request | Resolution |
|---------|------------|
| "Can't login" | Verify credentials, check `must_change_password`, reset if needed |
| "Didn't receive invitation email" | Check spam, verify Resend config, resend |
| "Checklist not generated" | Check Cron logs, manual trigger, verify template |
| "Wrong task status" | Check timezone, `eta` vs `completed_at`, manual correct |
| "Missing notification" | Check Realtime, dedupe_key, manual create |
| "Can't delete employee" | Verify not last super_admin, check work transfer |

### 11.3 Admin Operations

| Operation | Procedure |
|-----------|-----------|
| **Reset user password** | Super Admin → `/employees` → Reset Password |
| **Change user email** | Super Admin → `/employees` → Edit → Update Email |
| **Deactivate user** | Super Admin → `/employees` → Edit → Active: false |
| **Manual checklist generation** | Manager → `/checklist` → Generate button |
| **View audit logs** | Supabase → Table Editor → `task_updates`, `checklist_item_updates` |

### 11.4 Escalation Contacts

| Role | Name | Contact | Escalation |
|------|------|---------|------------|
| **On-Call** | Rotation | Slack/Phone | SEV-1/2 |
| **Tech Lead** | [Name] | Slack/Email | SEV-2/3 |
| **Engineering Manager** | [Name] | Slack/Email | SEV-1 |
| **Supabase Support** | - | Dashboard → Support | Database issues |
| **Vercel Support** | - | Dashboard → Support | Hosting issues |

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-11-02 | Documentation Engineering Team | Initial version |

---

*End of Operations & Maintenance Manual*
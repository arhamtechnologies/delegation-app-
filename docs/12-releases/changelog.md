# Change Log & Release Documentation

**Software/Project Name:** Delegation App
**Document ID:** DOC-CHANGELOG-001
**Version:** 1.0.0
**Status:** Draft
**Author:** Documentation Engineering Team
**Creation Date:** 2026-11-02
**Last Updated:** 2026-11-02

---

## Table of Contents

1. [Release History](#1-release-history)
2. [Migration History](#2-migration-history)
3. [Breaking Changes](#3-breaking-changes)
4. [Known Issues](#4-known-issues)
5. [Rollback Considerations](#5-rollback-considerations)

---

## 1. Release History

### v1.0.0 (2026-11-02) — Documentation Baseline

**Status**: Documentation suite created; codebase at commit `3323cc2`

**Summary**: Complete documentation suite generated for existing production system.

**Components Documented**:
- Software Requirements Specification (SRS)
- Software Architecture Document (SAD)
- Technical Design Document (TDD)
- Database Design Document
- API Documentation
- Security Documentation
- Deployment Guide
- Developer Onboarding Guide
- Testing Strategy
- Operations Manual

---

### Recent Code Releases (from Git History)

| Commit | Date | Title | Type |
|--------|------|-------|------|
| `3323cc2` | 2026-11-02 | Let directors and the EA set proof for checklists and existing tasks | Feature |
| `9e4a07b` | 2026-10-31 | Merge PR #22: Person report full | Feature |
| `5b599fa` | 2026-10-31 | Offer full person report in WhatsApp | Feature |
| `c053836` | 2026-10-31 | Merge PR #21: Optional proof checklist | Feature |
| `b2bdc20` | 2026-10-31 | Let director/EA choose mandatory/optional proof | Feature |
| `5b830f0` | 2026-10-31 | Make proof screenshots optional for checklists | Feature |
| `43e3a37` | 2026-10-30 | Merge PR #20: Login emails and task proof | Feature |
| `fdcaead` | 2026-10-30 | Require screenshot for proof-required tasks | Feature |
| `5c133f9` | 2026-10-30 | Email login details to existing employees | Feature |
| `3cb06a8` | 2026-10-29 | Merge PR #19: WhatsApp alert details | Feature |
| `d7a18cd` | 2026-10-29 | Full 6 PM report + EA alert details | Feature |
| `b582878` | 2026-10-28 | Merge PR #18: PWA install | Feature |
| `9370cc5` | 2026-10-28 | Phone install Delegation as app | Feature |
| `24c20d8` | 2026-10-27 | Merge PR #17: WhatsApp task alerts | Feature |
| `dddd9d7` | 2026-10-27 | WhatsApp task alerts + 6 PM summary | Feature |
| `621964c` | 2026-10-26 | Merge PR #16: Brand theme mobile | Feature |
| `ba567ca` | 2026-10-26 | Invite-link account setup + role column | Feature |
| `7efe37e` | 2026-10-25 | Rebrand with Delegation logo + shadcn | Feature |
| `4be75af` | 2026-10-24 | Merge PR #15: WhatsApp full integration | Feature |
| `d3addd5` | 2026-10-24 | Director chat with bot via manager account | Feature |

---

## 2. Migration History

| Migration File | Date Applied | Description |
|----------------|--------------|-------------|
| `001_initial_schema.sql` | 2026-01-15 | Core tables, enums, RLS, employee_mis view |
| `002_product_features.sql` | 2026-01-20 | Task enhancements, notifications, triggers |
| `003_checklist.sql` | 2026-02-01 | Checklist templates/items, RLS, triggers |
| `004_checklist_due_time.sql` | 2026-02-15 | due_time, due_at timestamptz, schedule constraint |
| `005_checklist_completion_permissions.sql` | 2026-03-01 | Completion permissions (super_admin/ea) |
| `006_checklist_monthly_days.sql` | 2026-03-15 | monthly_days array for monthly frequency |
| `007_notifications.sql` | 2026-04-01 | Extended notifications (entity_type, dedupe_key, realtime) |
| `20260817045334_checklist_non_working_day_deactivation.sql` | 2026-08-17 | Non-working day deactivation logic |
| `20260817120000_checklist_direct_non_working_days.sql` | 2026-08-17 | Direct non-working day tables |
| `20260817092856_performance_indexes.sql` | 2026-08-17 | Performance indexes |
| `20260817093132_performance_fk_indexes.sql` | 2026-08-17 | FK indexes |
| `20260821120000_allow_service_employee_transfer.sql` | 2026-08-21 | Service role employee transfer |
| `20260826050546_sync_checklist_items_on_template_update.sql` | 2026-08-26 | Sync items on template update |
| `20260826050741_sync_checklist_items_on_template_update.sql` | 2026-08-26 | Patch for sync |
| `20260826050809_backfill_open_checklist_items.sql` | 2026-08-26 | Backfill open items |
| `20260826050842_backfill_open_checklist_items.sql` | 2026-08-26 | Patch for backfill |
| `20260826061157_checklist_item_updates.sql` | 2026-08-26 | Checklist item updates table |
| `20260826061427_checklist_item_updates.sql` | 2026-08-26 | Patch for updates |
| `20260826063948_allow_checklist_item_reopen.sql` | 2026-08-26 | Allow item reopen |
| `20260826064026_allow_checklist_item_reopen.sql` | 2026-08-26 | Patch for reopen |
| `20260829081413_fix_checklist_template_sync_service_role.sql` | 2026-08-29 | Service role sync fix |
| `20260917051200_fix_checklist_template_update_guard.sql` | 2026-09-17 | Template update guard fix |
| `20261024061358_optimize_work_list_queries.sql` | 2026-10-24 | Work list query optimization (materialized view) |
| `20261026120000_whatsapp_bot.sql` | 2026-10-26 | WhatsApp bot tables |
| `20261027090000_whatsapp_bot_full.sql` | 2026-10-27 | WhatsApp bot full schema |
| `20261027120000_wa_chat_links.sql` | 2026-10-27 | WhatsApp chat links |
| `20261027150000_follow_up_work_items.sql` | 2026-10-27 | Follow-up work items view |
| `20261028130000_employee_own_tasks.sql` | 2026-10-28 | Employee own tasks |
| `20261029120000_wa_task_alerts.sql` | 2026-10-29 | WhatsApp task alerts |
| `20261031090000_wa_checklist_alerts.sql` | 2026-10-31 | WhatsApp checklist alerts |
| `20261031150000_task_proof_screenshots.sql` | 2026-10-31 | Task proof screenshots |
| `20261031170000_optional_proof_and_checklist.sql` | 2026-10-31 | Optional proof for tasks/checklists |
| `20261102100000_checklist_proof_choice.sql` | 2026-11-02 | Checklist proof choice |

---

## 3. Breaking Changes

### 3.1 API Breaking Changes

| Version | Change | Migration Required |
|---------|--------|-------------------|
| v1.0.0 | Initial documented API | No (baseline) |

### 3.2 Database Breaking Changes

| Migration | Breaking Change | Mitigation |
|-----------|-----------------|------------|
| `004_checklist_due_time.sql` | Added `due_time` NOT NULL, `due_at` NOT NULL | Backfill with defaults |
| `006_checklist_monthly_days.sql` | Added `monthly_days` array | Backfill from `day_of_month` |
| `20260817120000_checklist_direct_non_working_days.sql` | New `employee_non_working_days` table | Run alongside legacy `employee_leave_periods` |

### 3.3 Configuration Breaking Changes

| Change | Version | Action Required |
|--------|---------|-----------------|
| `CRON_SECRET` required | v1.0.0 | Set in Vercel env |
| `RESEND_API_KEY` required for invitations | v1.0.0 | Set in Vercel env |
| `NEXT_PUBLIC_CHECKLIST_TIMEZONE` required | v1.0.0 | Set in Vercel env |

---

## 4. Known Issues

| Issue ID | Description | Severity | Status | Workaround |
|----------|-------------|----------|--------|------------|
| KI-001 | WhatsApp bot requires Green API + Anthropic keys | Medium | Known limitation | Disable if not used |
| KI-002 | No MFA support | Medium | Backlog | N/A |
| KI-003 | CSP uses Next.js defaults only | Low | Identified | N/A |
| KI-004 | No application-level rate limiting | Low | Identified | Vercel defaults |
| KI-005 | Proof screenshots not encrypted at rest (beyond Supabase) | Low | Accepted risk | N/A |
| KI-006 | WhatsApp webhook lacks replay protection | Medium | Backlog | Token validation |
| KI-007 | Employee enumeration possible via API | Low | Identified | RLS limits data |
| KI-008 | No automated E2E tests | Medium | Backlog | Manual test scenarios |
| KI-009 | TypeScript not adopted | Low | Known limitation | Runtime validation |
| KI-010 | Large checklist generation may timeout | Low | Monitoring | Partial indexes help |

---

## 5. Rollback Considerations

### 5.1 Code Rollback

```bash
# Vercel instant rollback
vercel rollback <deployment-url> --prod

# Git rollback (if needed)
git revert <bad-commit>
git push origin main
```

### 5.2 Database Rollback

| Scenario | Procedure | RTO |
|----------|-----------|-----|
| Failed migration | Supabase PITR to pre-migration | < 1 hour |
| Bad data from code | Supabase PITR or manual SQL | < 30 min |
| Schema corruption | Full PITR restore | < 1 hour |

**Note**: Database rollbacks are independent of code rollbacks. Migrations are forward-only.

### 5.3 Configuration Rollback

| Config | Rollback Method |
|--------|-----------------|
| Environment Variables | Vercel Dashboard → Previous values |
| Vercel Cron Schedule | `vercel.json` git revert |
| Supabase Auth Settings | Dashboard → Previous values |
| DNS Records | DNS provider → Previous records |

### 5.4 Rollback Checklist

- [ ] Identify scope (code, database, config)
- [ ] Verify rollback target is healthy
- [ ] Execute rollback
- [ ] Verify critical paths (login, task creation, checklist)
- [ ] Monitor error rates for 30 min
- [ ] Communicate to stakeholders
- [ ] Document incident

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-11-02 | Documentation Engineering Team | Initial version |

---

*End of Change Log & Release Documentation*
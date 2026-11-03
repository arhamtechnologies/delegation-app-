# Software Requirements Specification (SRS)

**Software/Project Name:** Delegation App
**Document ID:** DOC-SRS-001
**Version:** 1.0.0
**Status:** Draft
**Author:** Documentation Engineering Team
**Creation Date:** 2026-11-02
**Last Updated:** 2026-11-02

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Functional Requirements](#2-functional-requirements)
3. [Non-Functional Requirements](#3-non-functional-requirements)
4. [User Roles and Permissions](#4-user-roles-and-permissions)
5. [System Constraints](#5-system-constraints)
6. [Dependencies](#6-dependencies)
7. [Assumptions](#7-assumptions)
8. [Acceptance Criteria](#8-acceptance-criteria)
9. [Out-of-Scope Functionality](#9-out-of-scope-functionality)
10. [Traceability Matrix](#10-traceability-matrix)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) defines the functional and non-functional requirements for the Delegation App, a task delegation and follow-up management system. It serves as the authoritative reference for development, testing, and validation.

### 1.2 Scope

The Delegation App enables workspace managers to delegate tasks, manage recurring checklists, track completion, and generate performance reports. The system is deployed on Vercel with Supabase as the backend.

### 1.3 Document Conventions

- **FR-XXX** — Functional Requirement
- **NFR-XXX** — Non-Functional Requirement
- **SEC-XXX** — Security Requirement
- **UI-XXX** — User Interface Requirement
- **API-XXX** — API Requirement
- **DB-XXX** — Database Requirement

---

## 2. Functional Requirements

### 2.1 Authentication and Session Management

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-001 | Users shall authenticate via email/password using Supabase Auth | High | Implemented |
| FR-002 | Sessions shall persist across browser restarts with auto-refresh | High | Implemented |
| FR-003 | First-time login shall enforce password change via `must_change_password` flag | High | Implemented |
| FR-004 | Password reset flow: forgot password → email link → update-password page | High | Implemented |
| FR-005 | Route protection shall check auth state on every route change | High | Implemented |
| FR-006 | Role-based redirects shall block non-managers from `/employees`, `/mis`, `/calendar` | High | Implemented |
| FR-007 | Sign-out shall clear client cache and redirect to `/login` | High | Implemented |

### 2.2 Task Management

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-010 | Managers (super_admin, assigner, ea) shall create tasks with: title, description, assignee, priority, due date/time, start date, category, instructions, proof requirement, attachments | High | Implemented |
| FR-011 | Tasks shall have statuses: `pending`, `followup`, `delayed`, `submitted`, `closed`, `not_required` | High | Implemented |
| FR-012 | Tasks shall have priorities: `normal`, `high`, `critical` | High | Implemented |
| FR-013 | Automatic status computation: overdue if ETA passed and not completed | High | Implemented |
| FR-014 | Task updates/remarks with proof attachments shall be supported | High | Implemented |
| FR-015 | Completion notes (separate from updates) shall be supported | High | Implemented |
| FR-016 | Soft delete for managers (transfers related records before deletion) | High | Implemented |
| FR-017 | Doers shall view only assigned tasks; managers view all | High | Implemented |
| FR-018 | Follower EA shall receive task updates and completion notifications | High | Implemented |

### 2.3 Checklist System (Recurring Work)

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-020 | Managers shall create checklist templates with: employee, task description, frequency, schedule parameters, start date, due time, active flag | High | Implemented |
| FR-021 | Template frequencies: `daily`, `weekly`, `every_15_days`, `monthly` | High | Implemented |
| FR-022 | Monthly frequency shall support multiple days via `monthly_days` array | High | Implemented |
| FR-023 | Vercel Cron shall run daily at 00:30 UTC to generate checklist items for active templates due today | High | Implemented |
| FR-024 | Manual generation trigger shall be available for managers | High | Implemented |
| FR-025 | Generation shall use upsert on `(template_id, due_date)` to avoid duplicates | High | Implemented |
| FR-026 | Non-working days (Sundays, Indian national holidays, employee leave) shall create items with `status='deactivated'` | High | Implemented |
| FR-027 | Doers shall complete own items; EAs/super_admins shall complete any | High | Implemented |
| FR-028 | Reopen capability via API with `completed=false` | High | Implemented |
| FR-029 | Automatic status: pending → overdue (after `due_at`) → completed | High | Implemented |
| FR-030 | Bulk edit: multi-select templates → edit employee, task, frequency, due_time, start_date, active | Medium | Implemented |
| FR-031 | Bulk delete: removes template + all generated items | Medium | Implemented |
| FR-032 | Excel import (.xlsx/.xls) with columns: Doer Name, Doer Email, Task Details, Task Type, ETA | Medium | Implemented |
| FR-033 | Import preview → confirm flow with duplicate detection | Medium | Implemented |

### 2.4 Calendar & Non-Working Days

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-040 | National holidays CRUD for country-specific holidays (default India) | High | Implemented |
| FR-041 | Employee leave: add/remove leave dates per employee | High | Implemented |
| FR-042 | Preview: see which checklist items would be deactivated for a given date | High | Implemented |
| FR-043 | Manual deactivate: execute deactivation for non-working days | High | Implemented |
| FR-044 | Automatic reconciliation during checklist generation to catch missed items | High | Implemented |
| FR-045 | Audit log for non-working day operations (`checklist_non_working_day_operations`) | High | Implemented |

### 2.5 Dashboard

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-050 | Metrics: Total, Pending, Overdue, Completed (tasks + checklists combined) | High | Implemented |
| FR-051 | Today's Work: chronologically sorted unified view of tasks and checklist items due today | High | Implemented |
| FR-052 | Grouped by status: Overdue → Pending → Completed | High | Implemented |
| FR-053 | Follow-up tasks shown with original + follow-up dates | High | Implemented |

### 2.6 MIS Reports

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-060 | Overall Report via `get_work_report` RPC: employee-wise performance (total, pending, overdue, completed, on-time %) | High | Implemented |
| FR-061 | Status breakdown with progress bars | High | Implemented |
| FR-062 | Work type mix (Tasks vs Checklist) | High | Implemented |
| FR-063 | Date range filtering, employee filter, work type filter, status filter, priority filter | High | Implemented |
| FR-064 | Drill-down: click employee row → detailed work list with pagination | High | Implemented |
| FR-065 | CSV download for overall or employee-specific data | High | Implemented |

### 2.7 Notifications

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-070 | Real-time Supabase Realtime subscription on `notifications` table | High | Implemented |
| FR-071 | Notification types: task_created, task_updated, task_completed, checklist_created, checklist_updated, checklist_completed, checklist_deactivated, checklist_non_working_day_deactivated | High | Implemented |
| FR-072 | Mark as read (individual/all) | High | Implemented |
| FR-073 | Tabs: All/Unread/Read | High | Implemented |
| FR-074 | Pagination | High | Implemented |
| FR-075 | Click-through to source item | High | Implemented |
| FR-076 | Deduplication via `dedupe_key` (SHA-256 hash) | High | Implemented |

### 2.8 Employee Management

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-080 | Add employee: creates Supabase Auth user + employee row (`must_change_password=true`) | High | Implemented |
| FR-081 | Edit: name, email (super_admin only for linked accounts), mobile, role, active status | High | Implemented |
| FR-082 | Reset password (super_admin): updates Supabase Auth password | High | Implemented |
| FR-083 | Delete: transfers all assigned work to deleter, deletes Auth user | High | Implemented |
| FR-084 | Metrics cards: total, active, doers, needs access | Medium | Implemented |
| FR-085 | Email invitation with secure password setup link (no temporary password) | High | Implemented |

### 2.9 WhatsApp Bot (Optional/Extended)

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-090 | WhatsApp Business API integration via Green API | Low | Implemented |
| FR-091 | AI-powered chat with Anthropic Claude | Low | Implemented |
| FR-092 | Task alerts to EA and directors | Low | Implemented |
| FR-093 | 6 PM daily summary report | Low | Implemented |
| FR-094 | Person report command | Low | Implemented |

---

## 3. Non-Functional Requirements

### 3.1 Performance

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| NFR-001 | Page load time (initial server render) | < 2 seconds | Implemented |
| NFR-002 | API response time (p95) | < 500ms | Implemented |
| NFR-003 | Checklist generation (Cron) completion | < 60 seconds | Implemented |
| NFR-004 | MIS report query (RPC) | < 3 seconds | Implemented |
| NFR-005 | Support concurrent users | 100+ | Implemented |

### 3.2 Scalability

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| NFR-010 | Database rows (tasks + checklist items) | 100,000+ | Implemented |
| NFR-011 | Employees per workspace | 500+ | Implemented |
| NFR-012 | Checklist templates | 1,000+ | Implemented |
| NFR-013 | Horizontal scaling via Vercel serverless | Automatic | Implemented |

### 3.3 Availability

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| NFR-020 | Uptime (Vercel SLA) | 99.9% | Implemented |
| NFR-021 | Supabase database availability | 99.95% | Implemented |
| NFR-022 | Graceful degradation on non-critical service failure (email, WhatsApp) | Yes | Implemented |

### 3.4 Security

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| NFR-030 | All data access via Row Level Security (RLS) | 100% coverage | Implemented |
| NFR-031 | Service role key never exposed to client | Enforced | Implemented |
| NFR-032 | HTTPS only in production | Enforced (Vercel) | Implemented |
| NFR-033 | CSP headers via Next.js defaults | Enforced | Implemented |
| NFR-034 | Private GitHub repository | Enforced | Implemented |
| NFR-035 | Password reset tokens via Supabase Auth (secure, expiring) | Enforced | Implemented |

### 3.5 Usability

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| NFR-040 | Mobile-first responsive design | All pages | Implemented |
| NFR-041 | PWA installation support | Yes | Implemented |
| NFR-042 | Keyboard navigation (⌘K command menu) | Yes | Implemented |
| NFR-043 | Accessible color contrast (WCAG AA) | Target | Partially Implemented |

### 3.6 Maintainability

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| NFR-050 | Code coverage (unit tests) | > 70% | Partial |
| NFR-051 | Type safety (TypeScript) | Not adopted (JavaScript) | N/A |
| NFR-052 | ESLint with zero warnings | Enforced | Implemented |
| NFR-053 | Database migrations version-controlled | Yes | Implemented |

---

## 4. User Roles and Permissions

### 4.1 Role Definitions

| Role | Code | Description | Can Create Tasks | Can Manage Checklists | Can Manage Employees | Can View MIS | Can Manage Calendar |
|------|------|-------------|------------------|----------------------|---------------------|--------------|---------------------|
| Super Admin | `super_admin` | Full workspace control | ✅ | ✅ | ✅ | ✅ | ✅ |
| Assigner | `assigner` | Delegates work to doers | ✅ | ✅ | ✅ | ✅ | ❌ |
| Executive Assistant | `ea` | Supports assigners, manages calendar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Doer | `doer` | Executes assigned work | ❌ | ❌ (own only) | ❌ | ❌ | ❌ |

### 4.2 Navigation Permissions

| Route | super_admin | assigner | ea | doer |
|-------|-------------|----------|-----|------|
| `/dashboard` | ✅ | ✅ | ✅ | ✅ |
| `/tasks` | ✅ | ✅ | ✅ | ✅ (My Tasks) |
| `/checklist` | ✅ | ✅ | ✅ | ✅ |
| `/calendar` | ✅ | ❌ | ✅ | ❌ |
| `/employees` | ✅ | ✅ | ✅ | ❌ |
| `/mis` | ✅ | ✅ | ✅ | ❌ |
| `/notifications` | ✅ | ✅ | ✅ | ✅ |
| `/follow-up-tasks` | ✅ | ✅ | ✅ | ✅ |

---

## 5. System Constraints

| Constraint ID | Constraint | Type | Impact |
|---------------|------------|------|--------|
| SC-001 | Supabase RLS Enforcement | Technical | All data access must comply with RLS policies |
| SC-002 | Vercel Serverless Limits | Technical | API routes timeout at 60s/300s; Cron jobs must complete within limits |
| SC-003 | Single Timezone Baseline | Business | Default timezone Asia/Kolkata; all scheduling relative to this |
| SC-004 | Email Delivery Dependency | External | Employee invitations require Resend API |
| SC-005 | WhatsApp Bot Optional | Feature | Green API + Anthropic integration; not core to web app |
| SC-006 | Private Repository | Security | GitHub repo must remain private |
| SC-007 | No Service Role in Client | Security | `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` must never exist |

---

## 6. Dependencies

### 6.1 External Services

| Service | Purpose | Integration Type | Criticality |
|---------|---------|------------------|-------------|
| Supabase | Database, Auth, Realtime | Primary backend | Critical |
| Vercel | Hosting, Serverless, Cron | Deployment platform | Critical |
| Resend | Transactional email | Email delivery | High |
| Green API | WhatsApp Business API | Optional bot | Low |
| Anthropic | AI for WhatsApp bot | Optional bot | Low |

### 6.2 Runtime Dependencies (Key)

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^15.4.0 | React framework |
| `react` / `react-dom` | ^19.1.0 | UI library |
| `@supabase/supabase-js` | ^2.55.0 | Supabase client |
| `@anthropic-ai/sdk` | ^1.3.0 | WhatsApp bot AI |
| `read-excel-file` | 9.3.10 | Excel import |
| `zod` | ^4.6.7 | Schema validation |

---

## 7. Assumptions

| Assumption ID | Assumption | Validation Status |
|---------------|------------|-------------------|
| ASM-001 | All users have corporate email addresses for Supabase Auth | Validated |
| ASM-002 | India national holidays are the primary holiday calendar | Validated |
| ASM-003 | Work week is Monday–Saturday (Sunday = non-working) | Validated |
| ASM-004 | Timezone for all scheduling is Asia/Kolkata unless configured otherwise | Validated |
| ASM-005 | Employee UUID mapping between Supabase Auth and `employees` table is 1:1 | Validated |
| ASM-006 | Vercel Cron runs reliably at scheduled times | Validated |
| ASM-007 | Resend domain verification is maintained for email delivery | Requires verification |

---

## 8. Acceptance Criteria

### 8.1 Critical Path Scenarios

| Scenario ID | Scenario | Acceptance Criteria |
|-------------|----------|---------------------|
| AC-001 | User login and dashboard access | Valid credentials → redirects to `/dashboard`; shows metrics and today's work |
| AC-002 | Task creation by manager | Manager creates task with all required fields → task appears in assignee's list; notification sent |
| AC-003 | Checklist generation (Cron) | Daily at 00:30 UTC → items generated for due templates; deactivated for non-working days |
| AC-004 | Checklist completion by doer | Doer completes item → status=completed, completed_at set, notification to template creator |
| AC-005 | MIS report generation | Manager opens `/mis` → report loads with employee rows, filters work, CSV exports |
| AC-006 | Employee invitation | Super_admin adds employee → Auth user created, email sent with setup link, employee row created |
| AC-007 | Password reset flow | User clicks forgot password → email received → link works → new password set → login succeeds |
| AC-008 | Non-working day deactivation | Sunday/holiday/leave date → checklist items created with status=deactivated; preview shows correct items |

### 8.2 Edge Cases

| Scenario ID | Scenario | Acceptance Criteria |
|-------------|----------|---------------------|
| AC-100 | Last super_admin deletion attempt | System prevents deletion; returns 409 error |
| AC-101 | Duplicate checklist generation | Upsert prevents duplicates; idempotent |
| AC-102 | Concurrent checklist completion | RLS prevents unauthorized completion; last write wins |
| AC-103 | Expired password reset link | Link expires → user redirected to request new link |
| AC-104 | WhatsApp bot unavailable | Web app unaffected; graceful degradation |

---

## 9. Out-of-Scope Functionality

| Out-of-Scope Item | Reason |
|-------------------|--------|
| Project/portfolio management | Focus is task delegation, not project planning |
| Resource allocation / capacity planning | No effort estimation or scheduling optimization |
| Time tracking / timesheets | Completion tracking only |
| Client/external user portal | Internal workspace only |
| Custom workflow engine | Fixed status transitions only |
| Document management | Attachments only (JSONB) |
| Mobile native apps | PWA only |
| Multi-tenancy | Single workspace per deployment |
| Advanced reporting / BI | MIS reports only |
| SSO / SAML / OIDC federation | Email/password only |

---

## 10. Traceability Matrix

| Requirement ID | Component | Test Coverage | Documentation |
|----------------|-----------|---------------|---------------|
| FR-001..FR-007 | `lib/auth.js`, `components/AppFrame.js`, `app/login/` | Unit: `work-summary.test.mjs` | API Doc, Security Doc |
| FR-010..FR-018 | `lib/task-data.js`, `app/api/tasks/`, `app/tasks/` | Integration: manual | API Doc, TDD |
| FR-020..FR-033 | `lib/checklist-data.js`, `app/api/checklist/`, `app/checklist/` | Unit: `checklist-template-update.test.mjs` | API Doc, TDD |
| FR-040..FR-045 | `lib/checklist-non-working-day.js`, `app/api/checklist/non-working-days/`, `app/calendar/` | Unit: `calendar-leave.test.mjs` | API Doc, TDD |
| FR-050..FR-053 | `lib/work-data.js`, `app/dashboard/` | Unit: `work-summary.test.mjs` | TDD |
| FR-060..FR-065 | `lib/work-data.js` (getWorkReport), `app/mis/` | Unit: `work-summary.test.mjs` | API Doc, TDD |
| FR-070..FR-076 | `lib/notifications.js`, `lib/notifications-server.js`, `app/notifications/` | Manual | API Doc, Security Doc |
| FR-080..FR-085 | `app/api/admin/employees/`, `app/employees/` | Manual | API Doc, Security Doc |
| NFR-030..NFR-035 | Database migrations, `lib/supabase-server.js` | Manual | Security Doc, SAD |

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-11-02 | Documentation Engineering Team | Initial version |

---

*End of Software Requirements Specification*
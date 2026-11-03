# Project Overview

**Software/Project Name:** Delegation App
**Document ID:** DOC-PROJ-001
**Version:** 1.0.0
**Status:** Draft
**Author:** Documentation Engineering Team
**Creation Date:** 2026-11-02
**Last Updated:** 2026-11-02

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [Software Overview](#2-software-overview)
3. [Business Objectives](#3-business-objectives)
4. [Stakeholders and User Categories](#4-stakeholders-and-user-categories)
5. [System Constraints](#5-system-constraints)
6. [Dependencies](#6-dependencies)
7. [Assumptions](#7-assumptions)
8. [Out-of-Scope Functionality](#8-out-of-scope-functionality)
9. [Glossary](#9-glossary)

---

## 1. Purpose and Scope

### 1.1 Purpose

This document provides a high-level overview of the Delegation App, establishing the project context, boundaries, and key characteristics for all stakeholders. It serves as the entry point to the complete documentation suite.

### 1.2 Scope

The Delegation App is a **full-stack task delegation and follow-up management system** designed for internal enterprise use. It enables workspace managers (directors, assigners, executive assistants) to:

- Delegate ad-hoc tasks with mandatory due dates, priorities, and assignees
- Define recurring checklist templates that auto-generate daily work items
- Track task and checklist completion with audit trails
- Monitor team performance through MIS reports
- Manage organizational calendar (holidays, leave) affecting work schedules
- Receive real-time notifications on work assignments and updates

The system is deployed as a **web application** accessible via browser on desktop and mobile devices, with Progressive Web App (PWA) installation support.

### 1.3 Project Classification

| Attribute | Value |
|-----------|-------|
| **Project Type** | Existing software (production-deployed, actively maintained) |
| **Modernization Status** | Active development with incremental feature additions |
| **Deployment Model** | Cloud-hosted (Vercel + Supabase) |
| **Access Model** | Private, authenticated users only |
| **Data Sensitivity** | Internal operational data (employee info, task details, performance metrics) |

---

## 2. Software Overview

### 2.1 Core Domain

The Delegation App operates in the **work management** domain, specifically focusing on:

- **Delegation**: Assigning work from managers to doers
- **Follow-up**: Tracking progress, updates, and completion
- **Recurring Work**: Automating repetitive tasks via checklist templates
- **Visibility**: Providing managers with real-time and historical visibility
- **Accountability**: Audit trails, completion proof, notifications

### 2.2 Key Features Summary

| Feature Area | Capabilities |
|--------------|--------------|
| **Authentication** | Email/password login, session persistence, password reset, first-login password change enforcement |
| **Task Management** | Create, update, complete, delete tasks; statuses (pending, followup, delayed, submitted, closed, not_required); priorities (normal, high, critical); attachments, proof requirements, completion notes |
| **Checklist System** | Template CRUD (daily/weekly/every_15_days/monthly); automated generation via Vercel Cron; completion/reopen; bulk operations; Excel import; non-working day handling |
| **Dashboard** | Unified metrics (total, pending, overdue, completed); today's work view (tasks + checklists); chronological sorting |
| **MIS Reports** | Employee-wise performance; status breakdowns; work type mix; date/employee/status/priority filters; CSV export |
| **Notifications** | Real-time (Supabase Realtime); types (task_created, task_updated, task_completed, checklist_created, checklist_updated, checklist_completed, checklist_deactivated, checklist_non_working_day_deactivated); mark read, pagination |
| **Employee Management** | Add (creates Auth user + employee row), edit, delete (with work transfer), password reset, role/active status management |
| **Calendar** | National holidays CRUD; employee leave management; preview/deactivate non-working day items; reconciliation |
| **Follow-up Tasks** | Follow-up date tracking; metadata preservation; unified list view |

### 2.3 User Roles

| Role | Code | Description | Primary Capabilities |
|------|------|-------------|---------------------|
| **Super Admin** | `super_admin` | Full workspace control | All permissions; last super_admin protection |
| **Assigner** | `assigner` | Delegates work to doers | Task/checklist creation, employee management, MIS |
| **Executive Assistant** | `ea` | Supports assigners, manages calendar | Task/checklist creation, employee management, MIS, calendar |
| **Doer** | `doer` | Executes assigned work | View/complete assigned tasks and checklists only |

---

## 3. Business Objectives

| Objective ID | Objective | Success Criteria |
|--------------|-----------|------------------|
| BO-001 | Reduce manual task tracking overhead | ≥80% of recurring work automated via checklists |
| BO-002 | Improve task completion visibility | Real-time dashboard showing pending/overdue/completed counts |
| BO-003 | Enable data-driven performance management | MIS reports with on-time completion %, employee drill-down |
| BO-004 | Ensure operational continuity during non-working days | Automatic deactivation of checklist items on Sundays, holidays, leave |
| BO-005 | Maintain audit trail for accountability | Immutable task updates, checklist completions, notification history |
| BO-006 | Support mobile-first workflow | PWA installation, responsive UI, touch-friendly interactions |
| BO-007 | Minimize administrative friction | Self-service password reset, email invitations, bulk operations |

---

## 4. Stakeholders and User Categories

### 4.1 Primary Stakeholders

| Stakeholder | Role | Interest |
|-------------|------|----------|
| **Workspace Directors** | Decision makers, super_admins | Strategic visibility, MIS reports, team performance |
| **Assigners/Managers** | Daily users, assigners | Task delegation, checklist management, employee oversight |
| **Executive Assistants** | Daily users, eas | Calendar management, task support, follow-up coordination |
| **Doers/Team Members** | Daily users, doers | Task execution, checklist completion, notifications |
| **IT/DevOps** | System operators | Deployment, monitoring, security, backups |

### 4.2 User Categories

| Category | Authentication | Authorization | Data Access |
|----------|---------------|---------------|-------------|
| **Internal Employees** | Supabase Auth (email/password) | Role-based (RBAC) | Own data + managed data (per role) |
| **System Processes** | Service role key (server-only) | Full bypass (RLS) | All data (Cron, admin operations) |

---

## 5. System Constraints

| Constraint ID | Constraint | Type | Impact |
|---------------|------------|------|--------|
| SC-001 | **Supabase RLS Enforcement** | Technical | All data access must comply with RLS policies; service role only for server-side admin operations |
| SC-002 | **Vercel Serverless Limits** | Technical | API routes timeout at 60s (Hobby) / 300s (Pro); Cron jobs must complete within limits |
| SC-003 | **Single Timezone Baseline** | Business | Default timezone Asia/Kolkata; all scheduling relative to this |
| SC-004 | **Email Delivery Dependency** | External | Employee invitations and password resets require Resend API |
| SC-005 | **WhatsApp Bot Optional** | Feature | Green API + Anthropic integration; not core to web app |
| SC-006 | **Private Repository** | Security | GitHub repo must remain private; no public exposure |
| SC-007 | **No Service Role in Client** | Security | `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` must never exist |

---

## 6. Dependencies

### 6.1 External Services

| Service | Purpose | Integration Type |
|---------|---------|------------------|
| **Supabase** | Database, Auth, Realtime, Storage | Primary backend (PostgreSQL + Auth) |
| **Vercel** | Hosting, Serverless Functions, Cron | Deployment platform |
| **Resend** | Transactional email (invitations, password reset) | Email delivery |
| **Green API** | WhatsApp Business API | Optional WhatsApp bot |
| **Anthropic (Claude)** | AI for WhatsApp bot | Optional WhatsApp bot |

### 6.2 Key Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^15.4.0 | React framework (App Router) |
| `react` / `react-dom` | ^19.1.0 | UI library |
| `@supabase/supabase-js` | ^2.55.0 | Supabase client (browser + server) |
| `@anthropic-ai/sdk` | ^1.3.0 | WhatsApp bot AI integration |
| `read-excel-file` | 9.3.10 | Checklist template Excel import |
| `zod` | ^4.6.7 | Schema validation |
| `lucide-react` | ^1.62.0 | Icon library |

---

## 7. Assumptions

| Assumption ID | Assumption | Validation Status |
|---------------|------------|-------------------|
| ASM-001 | All users have corporate email addresses for Supabase Auth | Validated (production) |
| ASM-002 | India national holidays are the primary holiday calendar | Validated (production) |
| ASM-003 | Work week is Monday–Saturday (Sunday = non-working) | Validated (production) |
| ASM-004 | Timezone for all scheduling is Asia/Kolkata unless configured otherwise | Validated (production) |
| ASM-005 | Employee UUID mapping between Supabase Auth and `employees` table is 1:1 | Validated (production) |
| ASM-006 | Vercel Cron runs reliably at scheduled times | Validated (production) |
| ASM-007 | Resend domain verification is maintained for email delivery | Requires verification |

---

## 8. Out-of-Scope Functionality

The following are explicitly **not** part of the current Delegation App scope:

| Out-of-Scope Item | Reason |
|-------------------|--------|
| **Project/portfolio management** | Focus is task delegation, not project planning |
| **Resource allocation / capacity planning** | No effort estimation or scheduling optimization |
| **Time tracking / timesheets** | Completion tracking only, not hours logging |
| **Client/external user portal** | Internal workspace only |
| **Custom workflow engine** | Fixed status transitions only |
| **Document management** | Attachments only (JSONB), no full DMS |
| **Mobile native apps** | PWA only |
| **Multi-tenancy** | Single workspace per deployment |
| **Advanced reporting / BI** | MIS reports only, no ad-hoc query builder |
| **SSO / SAML / OIDC federation** | Email/password only (Supabase Auth) |

---

## 9. Glossary

| Term | Definition |
|------|------------|
| **Auth User** | A user account in Supabase Authentication (auth.users) |
| **Employee** | A row in `public.employees` linked to an Auth User via `auth_user_id` |
| **Work Item** | Unified abstraction representing either a Task or Checklist Item |
| **Checklist Template** | Recurring work definition (frequency, schedule, assignee) |
| **Checklist Item** | Generated occurrence of a template for a specific date |
| **Non-Working Day** | Date where checklist items are auto-deactivated (Sunday, holiday, leave) |
| **MIS** | Management Information System — performance reporting module |
| **RLS** | Row Level Security — PostgreSQL policy-based access control |
| **Service Role** | Supabase admin key bypassing all RLS policies |
| **Vercel Cron** | Scheduled serverless function execution (daily checklist generation) |
| **Dedupe Key** | SHA-256 hash preventing duplicate notification inserts |
| **Follow-up Task** | Task with a follow-up date, carrying original scheduled date metadata |

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-11-02 | Documentation Engineering Team | Initial version |

---

*End of Project Overview*
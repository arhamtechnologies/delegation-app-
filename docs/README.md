# Delegation App — Documentation Suite

**Software/Project Name:** Delegation App
**Document ID:** DOC-README
**Version:** 1.0.0
**Status:** Draft
**Author:** Documentation Engineering Team
**Creation Date:** 2026-11-02
**Last Updated:** 2026-11-02

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Documentation Index](#documentation-index)
3. [Document Conventions](#document-conventions)
4. [Quick Reference](#quick-reference)

---

## Project Overview

The **Delegation App** is a production-ready, enterprise-grade task delegation and follow-up management system built with **Next.js 15 (App Router)**, **React 19**, and **Supabase (PostgreSQL)**. It enables workspace managers to assign tasks, track progress, manage recurring checklists, and generate Management Information System (MIS) reports.

The application is designed for deployment on **Vercel** with Supabase as the backend database and authentication provider.

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Task Management** | Ad-hoc task delegation with mandatory ETA, priority, assignee, status tracking |
| **Recurring Checklists** | Automated daily/weekly/biweekly/monthly checklist generation via Vercel Cron |
| **MIS Reports** | Employee-wise performance dashboards with filtering, drill-down, and CSV export |
| **Notifications** | Real-time in-app notification center with Supabase Realtime |
| **Calendar & Non-Working Days** | National holidays, employee leave, automatic checklist deactivation |
| **Employee Management** | Role-based access control (super_admin, assigner, ea, doer) |
| **Follow-up Tasks** | Task follow-up scheduling with metadata tracking |

### Technology Stack Summary

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend Framework | Next.js (App Router) | ^15.4.0 |
| UI Library | React | ^19.1.0 |
| Database & Auth | Supabase (PostgreSQL) | ^2.55.0 |
| Styling | Custom CSS (CSS Custom Properties) | — |
| Deployment | Vercel | — |
| Testing | Custom Node.js Test Runner | — |
| Linting | ESLint + next/core-web-vitals | ^9.39.5 |
| Package Manager | npm | — |

---

## Documentation Index

| # | Document | File Path | Description |
|---|----------|-----------|-------------|
| 1 | Project Overview | `01-project-overview/project-overview.md` | High-level project summary, scope, and objectives |
| 2 | Software Requirements Specification | `02-requirements/software-requirements-specification.md` | Functional and non-functional requirements with unique IDs |
| 3 | Software Architecture Document | `03-architecture/software-architecture-document.md` | Architectural principles, technology stack, system context, component architecture |
| 4 | System Context | `03-architecture/system-context.md` | External interfaces, actors, and system boundaries |
| 5 | Architecture Decision Records | `03-architecture/architecture-decisions/` | ADRs for significant technical decisions |
| 6 | Technical Design Document | `04-technical-design/technical-design-document.md` | Module-wise design, API interactions, business logic, security implementation |
| 7 | Database Design Document | `05-database/database-design.md` | ERD, tables, columns, relationships, indexes, constraints, migrations |
| 8 | API Documentation | `06-api/api-documentation.md` | Endpoint descriptions, request/response schemas, authentication |
| 9 | Security Documentation | `07-security/security-documentation.md` | Authentication, authorization, RBAC, data protection, security gaps |
| 10 | Deployment & Infrastructure Guide | `08-deployment/deployment-guide.md` | Infrastructure, environments, CI/CD, secrets management, rollback |
| 11 | Developer Onboarding Guide | `09-developer-guide/developer-onboarding.md` | Prerequisites, setup, installation, testing, debugging |
| 12 | Testing & Quality Assurance | `10-testing/testing-strategy.md` | Testing strategy, unit/integration/e2e tests, scenarios, limitations |
| 13 | Operations & Maintenance Manual | `11-operations/operations-maintenance-manual.md` | Monitoring, logging, incident response, backup, troubleshooting |
| 14 | Change Log & Release Documentation | `12-releases/changelog.md` | Version history, changes, migrations, known issues |
| 15 | Documentation Review Report | `reports/documentation-review-report.md` | Consistency validation results, gaps, recommendations |

---

## Document Conventions

### Status Values
- **Draft** — Initial version, under review
- **In Review** — Being reviewed by stakeholders
- **Approved** — Signed off and baselined
- **Obsolete** — Superseded or retired

### Requirement ID Format
- **FR-XXX** — Functional Requirement
- **NFR-XXX** — Non-Functional Requirement
- **ADR-XXX** — Architecture Decision Record
- **SEC-XXX** — Security Requirement/Control

### Terminology

| Term | Definition |
|------|------------|
| **Manager** | User with role `super_admin`, `assigner`, or `ea` |
| **Doer** | User with role `doer` (execution-only) |
| **RLS** | Row Level Security (PostgreSQL/Supabase) |
| **MIS** | Management Information System |
| **EA** | Executive Assistant |
| **Work Item** | Unified representation of a Task or Checklist Item |
| **Non-Working Day** | Sunday, national holiday, or employee leave date |
| **Service Role** | Supabase admin key bypassing RLS (server-only) |

---

## Quick Reference

### Key URLs (Production)
- **Application:** `https://task.arham.app` (configured via `NEXT_PUBLIC_SITE_URL`)
- **Supabase Dashboard:** `https://supabase.com/dashboard/project/<project-ref>`
- **Vercel Dashboard:** `https://vercel.com/<team>/delegation-app`

### Critical Environment Variables

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Service role key (NEVER expose to client) |
| `CRON_SECRET` | Server | Vercel Cron authentication token |
| `CHECKLIST_TIMEZONE` | Server | Server timezone for checklist generation |
| `NEXT_PUBLIC_CHECKLIST_TIMEZONE` | Client | Client timezone for checklist scheduling |
| `RESEND_API_KEY` | Server | Email delivery (employee invitations) |
| `RESEND_FROM_EMAIL` | Server | Verified sender email address |

### Role Permissions Matrix

| Feature | super_admin | assigner | ea | doer |
|---------|-------------|----------|-----|------|
| Create Tasks | ✅ | ✅ | ✅ | ❌ |
| Manage Checklists | ✅ | ✅ | ✅ | Own only |
| Manage Employees | ✅ | ✅ | ✅ | ❌ |
| View MIS Reports | ✅ | ✅ | ✅ | ❌ |
| Manage Calendar | ✅ | ❌ | ✅ | ❌ |
| Delete Employees | ✅ | ✅ | ✅ | ❌ |
| Reset Passwords | ✅ | ❌ | ❌ | ❌ |

### Default Timezone
- **Asia/Kolkata** (IST, UTC+5:30) — configurable via environment variables

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-11-02 | Documentation Engineering Team | Initial documentation suite creation |

---

*End of README*
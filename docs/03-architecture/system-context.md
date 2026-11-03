# System Context

**Software/Project Name:** Delegation App
**Document ID:** DOC-SYSCTX-001
**Version:** 1.0.0
**Status:** Draft
**Author:** Documentation Engineering Team
**Creation Date:** 2026-11-02
**Last Updated:** 2026-11-02

---

## Table of Contents

1. [System Boundary](#1-system-boundary)
2. [External Actors](#2-external-actors)
3. [External Systems](#3-external-systems)
4. [Interfaces](#4-interfaces)
5. [Data Flows Across Boundaries](#5-data-flows-across-boundaries)
6. [Deployment Context](#6-deployment-context)

---

## 1. System Boundary

The Delegation App system encompasses:

```
┌─────────────────────────────────────────────────────────────────┐
│                      DELEGATION APP SYSTEM                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Frontend   │  │    Backend   │  │     Database         │  │
│  │  (Next.js)   │  │  (API Routes)│  │  (Supabase PostgreSQL)│ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│         │                │                    │                  │
│         └────────────────┼────────────────────┘                  │
│                          ▼                                      │
│              ┌──────────────────────┐                          │
│              │  Auth & Realtime     │                          │
│              │  (Supabase Services) │                          │
│              └──────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### In-Scope Components

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Web Application | Next.js 15 + React 19 | User interface, client-side logic |
| API Layer | Next.js Route Handlers | Server-side business logic, authorization |
| Database | Supabase PostgreSQL | Data persistence, RLS enforcement |
| Authentication | Supabase Auth | User management, sessions, JWT |
| Real-time | Supabase Realtime | Live notification delivery |
| Scheduler | Vercel Cron | Automated checklist generation |

### Out-of-Scope (External Dependencies)

| Component | Provider | Integration Point |
|-----------|----------|-------------------|
| Hosting/CDN | Vercel | Platform |
| Email Delivery | Resend | API |
| WhatsApp Business | Green API | API + Webhook |
| AI (Claude) | Anthropic | API |

---

## 2. External Actors

### 2.1 Human Actors

| Actor | Role | Description | Access Level |
|-------|------|-------------|--------------|
| **Super Admin** | System Administrator | Full workspace control, user management, configuration | All |
| **Assigner** | Work Delegator | Creates tasks/checklists, manages team, views MIS | Manager |
| **Executive Assistant** | Support Role | Assists assigner, manages calendar, completes checklists for others | Manager + Calendar |
| **Doer** | Task Executor | Completes assigned tasks and checklists | Employee |
| **IT Operations** | System Operator | Monitors deployment, manages secrets, handles incidents | Infrastructure |

### 2.2 System Actors

| Actor | Description | Interaction |
|-------|-------------|-------------|
| **Vercel Cron Scheduler** | Triggers daily checklist generation at 00:30 UTC | HTTPS POST to `/api/checklist/generate` |
| **Vercel Cron Scheduler** | Triggers proof screenshot cleanup at 21:00 UTC | HTTPS POST to `/api/tasks/proofs/cleanup` |
| **Supabase Realtime** | Pushes database changes to subscribed clients | WebSocket (WSS) |
| **Green API Webhook** | Delivers incoming WhatsApp messages | HTTPS POST to `/api/whatsapp` |

---

## 3. External Systems

### 3.1 Supabase Platform

| Service | Purpose | Protocol | Auth |
|---------|---------|----------|------|
| **PostgreSQL Database** | Primary data store | HTTPS (PostgREST) | JWT (anon/service) |
| **Authentication** | User management, sessions | HTTPS | JWT |
| **Realtime** | Live subscriptions | WebSocket (WSS) | JWT |
| **Storage** | File attachments (proofs) | HTTPS | JWT |

**Network**: Supabase project in same region as Vercel (Singapore/syd1) for low latency.

### 3.2 Vercel Platform

| Service | Purpose | Protocol |
|---------|---------|----------|
| **Hosting** | Next.js app deployment | HTTPS |
| **Serverless Functions** | API route execution | HTTPS |
| **Edge Network** | Global CDN, middleware | HTTPS |
| **Cron Jobs** | Scheduled function execution | HTTPS (internal) |

### 3.3 Resend (Email)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Transactional emails (invitations, password reset) |
| **Protocol** | HTTPS REST API |
| **Authentication** | API Key (server-only) |
| **Requirements** | Verified domain, sender email verification |
| **Rate Limits** | Per Resend plan |

### 3.4 Green API (WhatsApp - Optional)

| Attribute | Value |
|-----------|-------|
| **Purpose** | WhatsApp Business API messaging |
| **Protocol** | HTTPS REST API + Webhooks |
| **Authentication** | Instance ID + API Token |
| **Webhook** | Inbound messages to `/api/whatsapp` |
| **Rate Limits** | Per Green API plan |

### 3.5 Anthropic (Claude - Optional)

| Attribute | Value |
|-----------|-------|
| **Purpose** | AI-powered WhatsApp bot responses |
| **Protocol** | HTTPS REST API |
| **Authentication** | API Key (server-only) |
| **Model** | Claude (via `@anthropic-ai/sdk`) |

---

## 4. Interfaces

### 4.1 User-Facing Interfaces

| Interface | URL Pattern | Description |
|-----------|-------------|-------------|
| **Login** | `/login` | Email/password authentication |
| **Dashboard** | `/dashboard` | Metrics + today's work |
| **Tasks** | `/tasks`, `/tasks/[id]` | Task list and detail |
| **Checklist** | `/checklist`, `/tasks/checklist/[id]` | Templates + items |
| **Calendar** | `/calendar` | Holidays + leave management |
| **MIS Reports** | `/mis` | Performance reports |
| **Notifications** | `/notifications` | Notification center |
| **Employees** | `/employees` | Employee management |
| **Follow-up Tasks** | `/follow-up-tasks` | Follow-up work view |
| **Password Reset** | `/forgot-password`, `/update-password`, `/change-password` | Auth flows |

### 4.2 API Interfaces

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/checklist/templates` | GET, POST, PATCH, DELETE | User Token + Manager Role | Template CRUD |
| `/api/checklist/generate` | GET, POST | CRON_SECRET or Manager Token | Daily generation |
| `/api/checklist/[id]/complete` | POST | User Token | Complete/reopen item |
| `/api/checklist/import` | POST | Manager Token | Excel import |
| `/api/checklist/bulk-update` | POST | Manager Token | Bulk edit templates |
| `/api/checklist/bulk-delete` | POST | Manager Token | Bulk delete templates |
| `/api/checklist/non-working-days` | GET, POST, DELETE | Manager Token | Leave management |
| `/api/checklist/holidays` | GET, POST, PATCH, DELETE | Manager Token | Holiday CRUD |
| `/api/checklist/deactivate-non-working-day/preview` | GET | Manager Token | Preview deactivation |
| `/api/checklist/deactivate-non-working-day` | POST | Manager Token | Execute deactivation |
| `/api/tasks` | DELETE | Manager Token | Delete task |
| `/api/admin/employees` | POST, DELETE | Manager Token | Employee CRUD |
| `/api/admin/employees/update-email` | POST | Super Admin Token | Email change |
| `/api/admin/employees/reset-password` | POST | Super Admin Token | Password reset |
| `/api/account/complete-password-change` | POST | User Token | First password change |
| `/api/tasks/proofs/cleanup` | POST | CRON_SECRET | Proof cleanup |
| `/api/whatsapp` | POST | Webhook Token | WhatsApp webhook |

### 4.3 Data Interfaces

| Interface | Format | Direction | Description |
|-----------|--------|-----------|-------------|
| **Supabase Client** | JSON/PostgREST | Bidirectional | Primary data access |
| **Realtime Subscription** | JSON/WebSocket | Inbound | Live notifications |
| **Resend API** | JSON | Outbound | Email sending |
| **Green API** | JSON | Bidirectional | WhatsApp messaging |
| **Anthropic API** | JSON | Outbound | AI completion |

---

## 5. Data Flows Across Boundaries

### 5.1 User Authentication Flow

```
User Browser → Supabase Auth (HTTPS) → JWT Tokens
     ↓
User Browser → Vercel (HTTPS) → dl_access_token cookie
     ↓
Vercel Server → Supabase (HTTPS, JWT) → RLS-scoped client
```

### 5.2 Task Delegation Flow

```
Manager Browser → Vercel API (HTTPS, JWT) → Supabase (RLS: is_manager())
     ↓
Supabase Trigger → notify_task_events() → notifications table
     ↓
Supabase Realtime → Push to assignee browser (WSS)
```

### 5.3 Checklist Generation Flow (Scheduled)

```
Vercel Cron (00:30 UTC) → Vercel API (HTTPS, CRON_SECRET) 
     → Supabase Admin (Service Role) → Generate items
     → reconcileOpenChecklistItemsForNonWorkingDays()
     → notify_checklist_item_events() → notifications
     → Supabase Realtime → Push to employees (WSS)
```

### 5.4 Employee Invitation Flow

```
Super Admin Browser → Vercel API (HTTPS, JWT) 
     → Supabase Admin (Service Role) → Create Auth user
     → Insert employees row (must_change_password=true)
     → Supabase Admin → Generate recovery link
     → Resend API (HTTPS, API Key) → Send invitation email
     → Employee clicks link → /update-password → Set password
```

### 5.5 MIS Report Flow

```
Manager Browser → Vercel (HTTPS) → Supabase RPC get_work_report() (RLS)
     → work_items view (security_invoker) → Aggregated JSON
     → Browser renders report
```

### 5.6 WhatsApp Bot Flow (Optional)

```
WhatsApp User → Green API → Webhook → Vercel API (HTTPS)
     → Anthropic API (HTTPS) → AI Response
     → Supabase (Service Role) → Query data
     → Green API → WhatsApp User
```

---

## 6. Deployment Context

### 6.1 Environments

| Environment | Purpose | Supabase Project | Vercel Project | Domain |
|-------------|---------|------------------|----------------|--------|
| **Development** | Local development | Local/Dev project | `npm run dev` | `localhost:3000` |
| **Preview** | PR/branch deploys | Preview branch DB | Vercel Preview | `delegation-app-git-<branch>.vercel.app` |
| **Production** | Live application | Production project | Vercel Production | `task.arham.app` |

### 6.2 Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        INTERNET                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌────────────────┐ ┌───────────────┐ ┌──────────────┐
│   USERS        │ │  VERCEL       │ │  SUPABASE    │
│  (Browsers)    │ │  (syd1)       │ │  (Singapore) │
└───────┬────────┘ └───────┬───────┘ └──────┬───────┘
        │                  │                 │
        │ HTTPS/WSS        │                 │
        └────────┬─────────┘                 │
                 ▼                           │
        ┌───────────────┐                    │
        │  NEXT.JS APP  │                    │
        │  (Serverless) │                    │
        └───────┬───────┘                    │
                │                            │
        ┌───────┴───────┐                    │
        │               │                    │
        ▼               ▼                    ▼
┌───────────────┐ ┌───────────┐    ┌──────────────────┐
│  CRON JOBS    │ │  RESEND   │    │  POSTGRESQL      │
│  (00:30 UTC)  │ │  (Email)  │    │  + AUTH + RT     │
└───────────────┘ └───────────┘    └──────────────────┘
                                        │
                                        │
                              ┌─────────┴─────────┐
                              ▼                   ▼
                       ┌───────────┐        ┌───────────┐
                       │  GREEN API │        │ ANTHROPIC │
                       │ (WhatsApp) │        │  (Claude) │
                       └───────────┘        └───────────┘
```

### 6.3 Network Security

| Boundary | Protection |
|----------|------------|
| **Internet → Vercel** | Vercel Edge Network (DDoS, WAF) |
| **Vercel → Supabase** | Supabase IP allowlist / VPC peering (if configured) |
| **Vercel → Resend** | HTTPS + API Key (server-only) |
| **Vercel → Green API** | HTTPS + Instance ID + Token (server-only) |
| **Vercel → Anthropic** | HTTPS + API Key (server-only) |
| **Browser → Supabase** | HTTPS + JWT (anon key for client, service role never exposed) |

### 6.4 Secrets Management

| Secret | Scope | Storage | Rotation |
|--------|-------|---------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Vercel Environment Variables | Manual |
| `CRON_SECRET` | Server-only | Vercel Environment Variables | Manual |
| `RESEND_API_KEY` | Server-only | Vercel Environment Variables | Manual |
| `GREEN_API_TOKEN` | Server-only | Vercel Environment Variables | Manual |
| `ANTHROPIC_API_KEY` | Server-only | Vercel Environment Variables | Manual |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client + Server | Vercel + `.env.local` | Manual |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Vercel + `.env.local` | Manual |

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-11-02 | Documentation Engineering Team | Initial version |

---

*End of System Context Document*
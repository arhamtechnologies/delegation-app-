# Developer Onboarding Guide

**Software/Project Name:** Delegation App
**Document ID:** DOC-DEV-001
**Version:** 1.0.0
**Status:** Draft
**Author:** Documentation Engineering Team
**Creation Date:** 2026-11-02
**Last Updated:** 2026-11-02

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Required Software and Versions](#2-required-software-and-versions)
3. [Repository Setup](#3-repository-setup)
4. [Installation Instructions](#4-installation-instructions)
5. [Environment Configuration](#5-environment-configuration)
6. [Database Initialization](#6-database-initialization)
7. [Running Locally](#7-running-locally)
8. [Testing Commands](#8-testing-commands)
9. [Build Commands](#9-build-commands)
10. [Debugging](#10-debugging)
11. [Common Development Issues](#11-common-development-issues)
12. [Contribution Guidelines](#12-contribution-guidelines)
13. [Project Structure Overview](#13-project-structure-overview)
14. [Key Development Patterns](#14-key-development-patterns)

---

## 1. Prerequisites

### 1.1 Knowledge Requirements

| Area | Level | Resources |
|------|-------|-----------|
| JavaScript/ES2022 | Proficient | MDN Web Docs |
| React 19 + Next.js 15 App Router | Proficient | Next.js Docs, React Docs |
| Supabase (PostgreSQL, Auth, Realtime) | Familiar | Supabase Docs |
| CSS (Custom Properties, Flexbox, Grid) | Proficient | CSS-Tricks, MDN |
| Git/GitHub | Proficient | GitHub Guides |

### 1.2 Access Requirements

- GitHub repository access (private)
- Vercel team access (for deployments)
- Supabase project access (for database)
- Resend account (for email testing)

---

## 2. Required Software and Versions

| Tool | Version | Install Command | Verification |
|------|---------|-----------------|--------------|
| **Node.js** | 20.x (LTS) | `nvm install 20` | `node --version` |
| **npm** | 10.x | Included with Node | `npm --version` |
| **Git** | 2.x | `brew install git` / `winget install Git` | `git --version` |
| **VS Code** | Latest | Download from code.visualstudio.com | `code --version` |
| **Supabase CLI** | Latest (optional) | `npm i -g supabase` | `supabase --version` |

### 2.3 Recommended VS Code Extensions

| Extension | ID | Purpose |
|-----------|----|---------|
| ESLint | `dbaeumer.vscode-eslint` | Linting |
| Prettier | `esbenp.prettier-vscode` | Formatting |
| Tailwind CSS IntelliSense | `bradlc.vscode-tailwindcss` | CSS (if using Tailwind) |
| PostgreSQL | `mtxr.sqltools` | Database queries |
| GitLens | `eamodio.gitlens` | Git history |
| Thunder Client | `rangav.vscode-thunder-client` | API testing |

---

## 3. Repository Setup

### 3.1 Clone Repository

```bash
# HTTPS (requires GitHub credentials)
git clone https://github.com/OWNER/delegation-app.git

# Or SSH (if SSH key configured)
git clone git@github.com:OWNER/delegation-app.git

cd delegation-app
```

### 3.2 Verify Repository

```bash
# Check git status
git status

# Check remote
git remote -v

# Check current branch
git branch
```

### 3.3 Branch Strategy

| Branch | Purpose | Protection |
|--------|---------|------------|
| `main` | Production-ready code | Required PR, CI checks |
| `feature/*` | New features | Short-lived |
| `fix/*` | Bug fixes | Short-lived |
| `chore/*` | Maintenance | Short-lived |

---

## 4. Installation Instructions

### 4.1 Install Dependencies

```bash
# Clean install (recommended for first time)
npm ci

# Or regular install
npm install
```

### 4.2 Verify Installation

```bash
# Check for vulnerabilities
npm audit

# List installed packages
npm list --depth=0
```

---

## 5. Environment Configuration

### 5.1 Create Local Environment File

```bash
# Copy template
cp .env.example .env.local
```

### 5.2 Configure `.env.local`

```env
# Required - Replace with your Supabase dev project values
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_DEV_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY

# Optional - For server features (email, Cron, etc.)
# SUPABASE_SERVICE_ROLE_KEY=sb_secret_YOUR_KEY
# CRON_SECRET=your_random_string
# CHECKLIST_TIMEZONE=Asia/Kolkata
# RESEND_API_KEY=re_YOUR_KEY
# RESEND_FROM_EMAIL=Delegation <no-reply@your-domain.com>
# NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 5.3 Get Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your development project
3. Go to **Settings** → **API**
4. Copy **Project URL** and **Publishable (anon) key**

---

## 6. Database Initialization

### 6.1 Option A: Use Existing Dev Supabase Project

1. Ensure migrations are applied (check with team)
2. Create first admin user (see Deployment Guide §6.3)

### 6.2 Option B: Local Supabase (Recommended for Isolation)

```bash
# Start local Supabase
supabase start

# Apply all migrations
supabase db reset

# Or apply specific migration
supabase migration up
```

### 6.3 Verify Database

```bash
# Check Supabase status
supabase status

# Connect via psql
supabase db shell

# Run test query
# SELECT * FROM employees LIMIT 1;
```

---

## 7. Running Locally

### 7.1 Start Development Server

```bash
npm run dev
```

### 7.2 Access Application

- **URL**: `http://localhost:3000`
- **Redirects**: Automatically to `/login` if not authenticated

### 7.3 First Login

1. Open `http://localhost:3000`
2. Use admin credentials created in Supabase
3. First login → redirected to `/change-password`
4. Set new password → redirected to `/dashboard`

### 7.4 Development Features

| Feature | URL | Description |
|---------|-----|-------------|
| Dashboard | `/dashboard` | Metrics + today's work |
| Tasks | `/tasks` | Task management |
| Checklist | `/checklist` | Templates + items |
| Calendar | `/calendar` | Holidays + leave |
| MIS | `/mis` | Reports |
| Notifications | `/notifications` | Notification center |
| Employees | `/employees` | Employee management (managers) |

### 7.5 Hot Reloading

- **Server Components**: Full page reload on save
- **Client Components**: Fast refresh (state preserved)
- **CSS**: Hot reload via PostCSS

---

## 8. Testing Commands

### 8.1 Run All Tests

```bash
npm run test
```

### 8.2 Test Files

| Test File | Purpose |
|-----------|---------|
| `tests/work-summary.test.mjs` | Status computation, summaries |
| `tests/checklist-template-update.test.mjs` | Template update validation |
| `tests/calendar-leave.test.mjs` | Leave classification |
| `tests/follow-up-tasks.test.mjs` | Follow-up metadata |
| `tests/work-items.test.mjs` | Work item transformers |
| `tests/whatsapp-*.test.mjs` | WhatsApp bot tests |

### 8.3 Test Output

```
✓ 1. pending item
✓ 2. overdue item
✓ 3. completed past-due item keeps completion precedence
...
# 45 passing (1.2s)
```

### 8.4 Run Specific Test

```bash
# Node.js test runner doesn't support filtering natively
# Run single file:
node tests/work-summary.test.mjs
```

---

## 9. Build Commands

### 9.1 Production Build

```bash
npm run build
```

### 9.2 Build Output

- **Directory**: `.next/`
- **Static Assets**: `.next/static/`
- **Serverless Functions**: `.next/server/`
- **Prerendered Pages**: `.next/server/app/`

### 9.3 Start Production Server (Local)

```bash
npm run start
# Runs on http://localhost:3000
```

### 9.4 Linting

```bash
# Check linting
npm run lint

# Auto-fix (if configured)
npm run lint -- --fix
```

---

## 10. Debugging

### 10.1 VS Code Debugging

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: Debug Server",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev"
    },
    {
      "name": "Next.js: Debug Client",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000",
      "webRoot": "${workspaceFolder}"
    }
  ],
  "compounds": [
    {
      "name": "Next.js: Full Stack",
      "configurations": ["Next.js: Debug Server", "Next.js: Debug Client"]
    }
  ]
}
```

### 10.2 Console Logging

```javascript
// Server-side (API routes, server components)
console.log('[debug] Server:', data);

// Client-side (components, lib)
console.log('[debug] Client:', data);

// Structured logging (used in codebase)
console.info('[performance] work list query', { durationMs, page, rowCount });
console.error('[mis] get_work_report failed', { query, durationMs, filters, code, message });
```

### 10.3 Supabase Query Debugging

```javascript
// Enable PostgREST query logging
const supabase = createClient(url, key, {
  global: { headers: { 'Accept': 'application/json' } }
});

// Log all queries (development only)
if (process.env.NODE_ENV !== 'production') {
  const originalFetch = global.fetch;
  global.fetch = async (input, init) => {
    console.log('[supabase]', init?.method || 'GET', input);
    return originalFetch(input, init);
  };
}
```

### 10.4 React DevTools

- Install React DevTools browser extension
- Inspect component tree, props, state
- Profile renders

### 10.5 Network Debugging

- Browser DevTools → Network tab
- Filter: `Fetch/XHR` for API calls
- Check: Request/Response headers, payload, timing

---

## 11. Common Development Issues

### 11.1 Authentication Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Auth session missing" | Cookie not set / expired | Sign out → sign in; check `NEXT_PUBLIC_SUPABASE_URL` |
| "Server authentication not configured" | Missing env vars | Verify `.env.local` has required vars |
| Redirect loop to `/login` | `must_change_password=true` | Complete `/change-password` flow |
| RLS policy violation | User lacks role/ownership | Check `is_manager()` and `employee_id` match |

### 11.2 Database Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Migration X not applied" | Missing migration in Supabase | Run referenced `.sql` in SQL Editor |
| "Column does not exist" | Schema out of sync | Apply missing migrations |
| "RLS policy violation" | Policy too restrictive | Verify policies in `001_initial_schema.sql` + patches |
| "Duplicate key" | Unique constraint | Handle in code (upsert with ignoreDuplicates) |

### 11.3 Build/Deploy Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Build fails on Vercel | Missing env vars | Add all required vars in Vercel Dashboard |
| Cron not running | `CRON_SECRET` mismatch | Ensure `CRON_SECRET` in Vercel matches nothing (Vercel sends it) |
| Function timeout | Long-running query | Optimize query; add indexes; use RPC |
| "Module not found" | Missing dependency | `npm install`; check `package.json` |

### 11.4 Real-time Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Notifications not real-time | Realtime not enabled | Check Supabase → Realtime → Publications |
| Duplicate notifications | Missing dedupe_key | Verify `insert_notification_event` usage |
| Channel not subscribing | RLS blocks subscription | Verify user has SELECT on table |

### 11.5 Timezone Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Wrong business date | Timezone mismatch | Ensure `CHECKLIST_TIMEZONE` = `NEXT_PUBLIC_CHECKLIST_TIMEZONE` |
| Overdue calculation wrong | Server/client timezone diff | Use `getChecklistBusinessDate()` consistently |
| Cron runs at wrong time | UTC vs local | Cron is UTC; business logic uses `Asia/Kolkata` |

---

## 12. Contribution Guidelines

### 12.1 Code Style

- **ESLint**: `npm run lint` must pass (zero warnings)
- **Formatting**: Prettier (if configured) or consistent style
- **Naming**: camelCase for JS, PascalCase for components
- **Imports**: Absolute imports via `@/` alias (`jsconfig.json`)

### 12.2 Git Workflow

```bash
# 1. Create feature branch
git checkout -b feature/your-feature-name

# 2. Make changes, commit frequently
git add .
git commit -m "feat: add your feature description"

# 3. Push branch
git push origin feature/your-feature-name

# 4. Open Pull Request
#    - Fill PR template
#    - Link related issues
#    - Request review
```

### 12.3 Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `style` | Formatting |
| `refactor` | Code restructuring |
| `test` | Tests |
| `chore` | Maintenance |

### 12.4 Pull Request Requirements

- [ ] All tests pass (`npm run test`)
- [ ] Lint clean (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] No console.log/debugger in production code
- [ ] Documentation updated (if applicable)
- [ ] Migration files included (if schema changes)

### 12.5 Code Review Checklist

- [ ] Logic correct and handles edge cases
- [ ] RLS policies considered for new tables/columns
- [ ] Error handling appropriate
- [ ] Performance implications considered
- [ ] Security implications reviewed
- [ ] Tests added/updated

---

## 13. Project Structure Overview

```
delegation-app/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes (serverless)
│   │   ├── account/              # Password change
│   │   ├── admin/employees/      # Employee management
│   │   ├── checklist/            # Checklist endpoints
│   │   ├── tasks/                # Task endpoints
│   │   └── whatsapp/             # WhatsApp webhook
│   ├── calendar/                 # Calendar page
│   ├── checklist/                # Checklist page
│   ├── dashboard/                # Dashboard page
│   ├── employees/                # Employees page
│   ├── follow-up-tasks/          # Follow-up tasks page
│   ├── login/                    # Login page
│   ├── mis/                      # MIS reports page
│   ├── notifications/            # Notifications page
│   ├── tasks/                    # Tasks pages
│   ├── globals.css               # Global styles
│   ├── layout.js                 # Root layout
│   └── page.js                   # Home redirect
├── components/                   # React Components
│   ├── AppFrame.js               # Main layout + auth
│   ├── AppShell.js               # Page container
│   ├── CalendarSettings.js       # Calendar UI
│   ├── DashboardTodayWork.js     # Today's work (dynamic)
│   ├── Icons.js                  # SVG icons
│   ├── UI.js                     # UI primitives
│   └── ui/                       # Radix UI wrappers
├── lib/                          # Business Logic
│   ├── auth.js                   # Auth helpers
│   ├── checklist-data.js         # Client checklist ops
│   ├── checklist-server.js       # Server checklist auth
│   ├── checklist-time.js         # Timezone utilities
│   ├── checklist-non-working-day.js # Non-working day logic
│   ├── notifications.js          # Client notifications
│   ├── notifications-server.js   # Server notifications
│   ├── supabase-browser.js       # Browser client
│   ├── supabase-server.js        # Server clients
│   ├── task-data.js              # Client task ops
│   ├── task-server.js            # Server task auth
│   ├── work-data.js              # Unified work items
│   ├── work-items.mjs            # Work item transformers
│   ├── work-summary.mjs          # Status computation
│   ├── work-list.mjs             # Pagination/validation
│   └── ...                       # Other utilities
├── supabase/
│   └── migrations/               # Database migrations
├── tests/                        # Test files
├── public/                       # Static assets
├── .env.example                  # Env template
├── .env.local                    # Local env (gitignored)
├── next.config.mjs               # Next.js config
├── vercel.json                   # Vercel config
├── package.json                  # Dependencies
└── README.md                     # Deployment guide
```

---

## 14. Key Development Patterns

### 14.1 Server Component Data Loading

```javascript
// app/dashboard/page.js
import { getServerSession } from '@/lib/server-session';
import { loadDashboardData } from '@/lib/page-data';

export default async function DashboardPage() {
  const session = await getServerSession();
  const initial = session ? await loadDashboardData({ 
    employee: session.employee, 
    client: session.client 
  }).catch(() => null) : null;
  return <DashboardView initialData={withRenderTime(initial?.data || null)} />;
}
```

### 14.2 Client-Side Data Fetching

```javascript
// components/DashboardView.js
'use client';
import { useEffect, useState } from 'react';
import { getUnifiedDashboardData } from '@/lib/work-data';

export default function DashboardView({ initialData }) {
  const [data, setData] = useState(initialData);
  
  useEffect(() => {
    let active = true;
    getUnifiedDashboardData().then(({ data, error }) => {
      if (active && !error) setData(withRenderTime(data));
    });
    return () => { active = false; };
  }, []);
  
  // Render with data...
}
```

### 14.3 API Route Pattern

```javascript
// app/api/checklist/templates/route.js
import { authorizeChecklistManager } from '@/lib/checklist-server';
import { createTemplate } from '@/lib/server/checklist-template-rules';

export async function POST(request) {
  const authorization = await authorizeChecklistManager(request);
  if (authorization.response) return authorization.response;
  
  const payload = await request.json();
  return Response.json(await createTemplate(authorization.admin, payload));
}
```

### 14.4 Supabase Client Usage

```javascript
// Client-side (browser)
import { supabaseBrowser } from '@/lib/supabase-browser';
const supabase = supabaseBrowser();
const { data, error } = await supabase.from('tasks').select('*').eq('assignee_id', userId);

// Server-side (with user token)
import { createSupabaseUserClient } from '@/lib/supabase-server';
const supabase = createSupabaseUserClient(accessToken);

// Server-side (admin, bypasses RLS)
import { createSupabaseAdminClient } from '@/lib/supabase-server';
const admin = createSupabaseAdminClient();
```

### 14.5 Error Handling Pattern

```javascript
try {
  const { data, error } = await supabase.from('table').select('*');
  if (error) throw error;
  return { data, error: null };
} catch (error) {
  console.error('Operation failed', { code: error.code, message: error.message });
  return { data: null, error: { message: 'User-friendly message' } };
}
```

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-11-02 | Documentation Engineering Team | Initial version |

---

*End of Developer Onboarding Guide*
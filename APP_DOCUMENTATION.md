# Delegation App — Complete Documentation

## Overview

The **Delegation App** is a full-stack task delegation and follow-up management system built with **Next.js 15**, **React 19**, and **Supabase** (PostgreSQL). It enables workspace managers to assign tasks, track progress, manage recurring checklists, and generate MIS reports. The app is designed for deployment on **Vercel** with Supabase as the backend database and authentication provider.

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend Framework** | Next.js (App Router) | ^15.4.0 |
| **UI Library** | React | ^19.1.0 |
| **Database & Auth** | Supabase (PostgreSQL) | ^2.55.0 |
| **Styling** | Custom CSS (globals.css) | — |
| **Deployment** | Vercel | — |
| **Testing** | Custom Node.js test runner | — |
| **Linting** | ESLint + next/core-web-vitals | ^9.39.5 |
| **Package Manager** | npm | — |

### Key Dependencies

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.55.0",
    "next": "^15.4.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "read-excel-file": "9.3.10"
  },
  "devDependencies": {
    "eslint": "^9.39.5",
    "eslint-config-next": "^15.5.22"
  }
}
```

---

## Architecture

### Project Structure

```
delegation-app/
├── app/                          # Next.js App Router pages & API routes
│   ├── api/                      # Server-side API endpoints
│   │   ├── account/              # Password change completion
│   │   ├── admin/employees/      # Employee CRUD (super_admin only)
│   │   ├── checklist/            # Checklist templates, items, generation, import
│   │   │   ├── [id]/complete/    # Complete/reopen checklist items
│   │   │   ├── bulk-update/      # Bulk edit checklist templates
│   │   │   ├── bulk-delete/      # Bulk delete checklist templates
│   │   │   ├── deactivate-non-working-day/  # Non-working day handling
│   │   │   ├── generate/         # Vercel Cron: daily checklist generation
│   │   │   ├── holidays/         # National holidays CRUD
│   │   │   ├── import/           # Excel import for checklist templates
│   │   │   ├── non-working-days/ # Employee leave / non-working days
│   │   │   └── templates/        # Checklist template CRUD
│   │   └── tasks/                # Task deletion
│   ├── calendar/                 # Calendar settings page
│   ├── checklist/                # Checklist management page
│   ├── dashboard/                # Main dashboard
│   ├── employees/                # Employee management page
│   ├── follow-up-tasks/          # Follow-up tasks page
│   ├── login/                    # Login page
│   ├── mis/                      # MIS reports page
│   ├── notifications/            # Notifications center
│   ├── tasks/                    # Task management
│   │   ├── [id]/                 # Task detail page
│   │   └── checklist/[id]/       # Checklist item detail page
│   ├── change-password/          # First-time password change
│   ├── forgot-password/          # Password reset request
│   ├── update-password/          # Password reset via email link
│   ├── globals.css               # Global styles
│   ├── layout.js                 # Root layout
│   └── page.js                   # Redirects to /login
├── components/                   # Shared React components
│   ├── AppShell.js               # Main layout with sidebar, auth, navigation
│   ├── CalendarSettings.js       # Calendar/non-working day management UI
│   ├── DashboardTodayWork.js     # Today's work component (dynamic import)
│   ├── Icons.js                  # Inline SVG icon library
│   ├── TaskTextTooltip.js        # Tooltip for long task titles
│   └── UI.js                     # Reusable UI primitives (badges, modals, etc.)
├── lib/                          # Client & server-side business logic
│   ├── auth.js                   # Authentication helpers, session management
│   ├── calendar-leave.mjs        # Leave classification logic
│   ├── checklist-data.js         # Checklist client-side operations
│   ├── checklist-import.js       # Excel import parsing
│   ├── checklist-non-working-day.js  # Non-working day reconciliation
│   ├── checklist-server.js       # Server-side checklist authorization
│   ├── checklist-template-errors.mjs # Template error helpers
│   ├── checklist-time.js         # Timezone & date utilities (Asia/Kolkata)
│   ├── follow-up-tasks.mjs       # Follow-up task metadata
│   ├── notifications.js          # Client-side notification helpers
│   ├── notifications-server.js   # Server-side notification creation
│   ├── supabase-browser.js       # Browser Supabase client (singleton)
│   ├── supabase-server.js        # Server Supabase clients (user/admin)
│   ├── task-data.js              # Task client-side operations
│   ├── task-server.js            # Server-side task authorization
│   ├── work-data.js              # Unified work items (tasks + checklists)
│   ├── work-list.mjs             # Pagination & validation helpers
│   └── work-summary.mjs          # Status computation & summaries
├── supabase/
│   └── migrations/               # Database schema migrations (7 core + patches)
├── tests/                        # Unit/integration tests
├── next.config.mjs               # Next.js configuration
├── vercel.json                   # Vercel Cron configuration
├── package.json
└── README.md                     # Deployment handoff guide
```

---

## Database Schema

The Supabase database uses **Row Level Security (RLS)** extensively. All tables have policies that restrict access based on the authenticated user's role and employee profile.

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `employees` | Workspace roster linked to Supabase Auth | `id`, `auth_user_id` (FK), `name`, `email`, `role` (enum), `active`, `must_change_password`, `department_id`, `designation_id`, `shift_id` |
| `tasks` | Ad-hoc delegated tasks | `id`, `title`, `description`, `priority`, `status` (enum), `eta`, `assignee_id` (FK), `created_by` (FK), `follower_ea_id`, `category`, `start_date`, `instructions`, `proof_required`, `completion_notes`, `attachments` (JSONB) |
| `task_updates` | Audit trail for tasks | `id`, `task_id` (FK), `author_user_id` (FK), `update_type`, `remark`, `proof_url` |
| `checklist_templates` | Recurring checklist definitions | `id`, `employee_id` (FK), `task`, `frequency` (daily/weekly/every_15_days/monthly), `weekday`, `day_of_month`, `monthly_days` (smallint[]), `start_date`, `due_time`, `active`, `created_by` |
| `checklist_items` | Generated checklist occurrences | `id`, `template_id` (FK), `employee_id` (FK), `task`, `due_date`, `due_at` (timestamptz), `status` (pending/completed/overdue/deactivated), `completed_at`, `completed_by` |
| `checklist_item_updates` | Audit trail for checklist items | `id`, `checklist_item_id` (FK), `author_user_id` (FK), `update_type`, `remark`, `proof_url` |
| `notifications` | In-app notification center | `id`, `recipient_employee_id` (FK), `actor_employee_id`, `task_id`, `kind`, `title`, `body`, `entity_type`, `entity_id`, `dedupe_key`, `read_at` |
| `national_holidays` | Country-specific holidays | `id`, `holiday_date`, `name`, `country`, `is_active` |
| `employee_non_working_days` | Employee-specific leave dates | `id`, `employee_id` (FK), `non_working_date`, `reason` (employee_leave), `created_by` |
| `checklist_non_working_day_operations` | Audit log for non-working day actions | `id`, `operation_id`, `date`, `employee_id`, `item_id`, `action`, `performed_by`, `reason`, `created_at` |
| `shifts` | Work shift definitions | `id`, `name`, `work_days` (int[]), `start_time`, `end_time`, `active` |
| `departments` | Department master | `id`, `name`, `active` |
| `designations` | Designation master | `id`, `name`, `active` |

### Enums

```sql
app_role:        'super_admin' | 'assigner' | 'ea' | 'doer'
task_status:     'pending' | 'followup' | 'delayed' | 'submitted' | 'closed' | 'not_required'
task_priority:   'normal' | 'high' | 'critical'
checklist_freq:  'daily' | 'weekly' | 'every_15_days' | 'monthly'
```

### Key Database Functions & Triggers

| Function/Trigger | Purpose |
|------------------|---------|
| `current_employee()` | Returns the employee row for the current auth user |
| `is_manager()` | Returns true if current user has manager role (super_admin, assigner, ea) |
| `guard_checklist_item_update()` | Prevents modification of immutable fields; enforces completion rules |
| `notify_task_events()` | Creates notifications on task insert/update (assignment, updates, completion) |
| `notify_task_update_event()` | Creates notifications on task_updates insert |
| `notify_checklist_template_events()` | Creates notifications on checklist template changes |
| `notify_checklist_item_events()` | Creates notifications on checklist item creation/completion |
| `insert_notification_event()` | Idempotent notification insert with dedupe_key |
| `deactivate_checklist_items_for_non_working_day()` | RPC for bulk deactivation with audit |
| `get_work_report()` | RPC for MIS report aggregation |

### Row Level Security Policies

- **Employees**: Managers can read all; users read own row; managers manage all
- **Tasks**: Managers read all; assignees/follower EAs read assigned; managers create; managers/assignees update
- **Task Updates**: Read if can read parent task; insert if author
- **Checklist Templates**: Managers full CRUD; employees read own template via items
- **Checklist Items**: Managers read all; employees read own; employees can only complete own items
- **Notifications**: Recipient or manager can read/update `read_at`; only triggers insert

---

## User Roles & Permissions

| Role | Description | Can Create Tasks | Can Manage Checklists | Can Manage Employees | Can View MIS | Can Manage Calendar |
|------|-------------|------------------|----------------------|---------------------|--------------|---------------------|
| **super_admin** | Full workspace control | ✅ | ✅ | ✅ | ✅ | ✅ |
| **assigner** | Delegates work to doers | ✅ | ✅ | ✅ | ✅ | ❌ |
| **ea** (Executive Assistant) | Supports assigners, manages calendar | ✅ | ✅ | ✅ | ✅ | ✅ |
| **doer** | Executes assigned work | ❌ | ❌ (own only) | ❌ | ❌ | ❌ |

### Role-Based Navigation (AppShell)

- **Managers** (super_admin, assigner, ea): Dashboard, Tasks, Checklist, Calendar, Employees, MIS
- **Doers**: Dashboard, My Tasks, Checklist

---

## Core Features

### 1. Authentication & Session Management

- **Email/password login** via Supabase Auth
- **Session persistence** with auto-refresh
- **First-login password change** enforced via `must_change_password` flag
- **Password reset flow**: forgot password → email link → update-password page
- **Route protection**: AppShell checks auth state on every route change
- **Role-based redirects**: Non-managers blocked from /employees, /mis, /calendar

### 2. Task Management

**Pages**: `/tasks` (list), `/tasks/[id]` (detail)

**Features**:
- Create tasks with: title, description, assignee, priority, due date/time, start date, category, instructions, proof requirement, attachments
- Statuses: `pending` → `followup` → `delayed` → `submitted` → `closed` / `not_required`
- Automatic status computation: overdue if `eta` passed and not completed
- Task updates/remarks with proof attachments
- Completion notes (separate from updates)
- Soft delete for managers (transfers related records before deletion)

**API**: `POST /api/tasks` (create), `DELETE /api/tasks` (delete)

### 3. Checklist System (Recurring Work)

**Pages**: `/checklist` (templates + today's items), `/tasks/checklist/[id]` (item detail)

**Template Frequencies**:
- **Daily**: Every business day
- **Weekly**: Specific weekday (0=Sunday..6=Saturday)
- **Every 15 days**: From start_date, every 15th day
- **Monthly**: Specific day(s) of month (supports multiple days via `monthly_days` array)

**Generation**:
- **Vercel Cron**: Runs daily at 00:30 UTC (`vercel.json`)
- **Manual trigger**: Button in UI for managers
- Generates `checklist_items` for active templates due today
- Uses `upsert` on `(template_id, due_date)` to avoid duplicates
- **Non-working day handling**: Sundays, Indian national holidays, employee leave → items created with `status='deactivated'`

**Completion**:
- Doers complete own items; EAs/super_admins can complete any
- Reopen capability (via API `/api/checklist/[id]/complete` with `completed=false`)
- Automatic status: pending → overdue (after `due_at`) → completed

**Bulk Operations**:
- Multi-select templates → bulk edit (employee, task, frequency, due_time, start_date, active)
- Bulk delete (removes template + all generated items)

**Import**:
- Excel (.xlsx/.xls) import with columns: Doer Name, Doer Email, Task Details, Task Type, ETA
- Preview → confirm flow with duplicate detection

### 4. Calendar & Non-Working Days

**Page**: `/calendar` (CalendarSettings component)

**Features**:
- **National Holidays**: CRUD for country-specific holidays (default India)
- **Employee Leave**: Add/remove leave dates per employee
- **Preview**: See which checklist items would be deactivated for a given date
- **Deactivate**: Manually deactivate items for non-working days
- **Reconciliation**: Automatic reconciliation runs during checklist generation to catch missed items

### 5. Dashboard

**Page**: `/dashboard`

**Metrics**: Total, Pending, Overdue, Completed (tasks + checklists combined)
**Today's Work**: Chronologically sorted unified view of tasks and checklist items due today
- Grouped by status: Overdue → Pending → Completed
- Follow-up tasks shown with original + follow-up dates

### 6. MIS Reports

**Page**: `/mis`

**Overall Report** (via `get_work_report` RPC):
- Employee-wise performance: total, pending, overdue, completed, on-time %
- Status breakdown with progress bars
- Work type mix (Tasks vs Checklist)
- Date range filtering, employee filter, work type filter, status filter

**Drill-down**: Click employee row → detailed work list with pagination
**Export**: CSV download for overall or employee-specific data

### 7. Notifications

**Page**: `/notifications`

**Real-time**: Supabase Realtime subscription on `notifications` table
**Types**: task_created, task_updated, task_completed, checklist_created, checklist_updated, checklist_completed, checklist_deactivated, checklist_non_working_day_deactivated
**Features**: Mark as read (individual/all), tabs (All/Unread/Read), pagination, click-through to source item

### 8. Employee Management

**Page**: `/employees` (managers only)

**Features**:
- Add employee: creates Supabase Auth user + employee row (must_change_password=true)
- Edit: name, email (super_admin only for linked accounts), mobile, role, active status
- Reset password (super_admin): updates Supabase Auth password
- Delete: transfers all assigned work to deleter, deletes Auth user
- Metrics cards: total, active, doers, needs access

---

## API Endpoints

### Checklist

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/checklist/templates` | List templates (paginated, filtered) |
| POST | `/api/checklist/templates` | Create template |
| PATCH | `/api/checklist/templates` | Update template (syncs generated items) |
| DELETE | `/api/checklist/templates` | Delete template + generated items |
| POST | `/api/checklist/generate` | Trigger daily generation (Cron or manual) |
| POST | `/api/checklist/[id]/complete` | Complete/reopen checklist item |
| POST | `/api/checklist/import` | Preview/import Excel checklist templates |
| POST | `/api/checklist/bulk-update` | Bulk edit selected templates |
| POST | `/api/checklist/bulk-delete` | Bulk delete selected templates |
| GET/POST | `/api/checklist/non-working-days` | Get/save employee leave & holidays |
| DELETE | `/api/checklist/non-working-days` | Remove leave date |
| GET/POST/PATCH/DELETE | `/api/checklist/holidays` | National holiday CRUD |
| GET | `/api/checklist/deactivate-non-working-day/preview` | Preview deactivation for date |
| POST | `/api/checklist/deactivate-non-working-day` | Execute deactivation |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| DELETE | `/api/tasks` | Delete task (manager only) |

### Admin - Employees

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/employees` | Create employee + Auth user |
| DELETE | `/api/admin/employees` | Delete employee (transfers work) |
| POST | `/api/admin/employees/update-email` | Update employee email (super_admin) |
| POST | `/api/admin/employees/reset-password` | Reset employee Auth password (super_admin) |

### Account

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/account/complete-password-change` | Complete first-time password change |

---

## Key Business Logic

### Timezone Handling

- **Default timezone**: `Asia/Kolkata` (IST, UTC+5:30)
- Configurable via `NEXT_PUBLIC_CHECKLIST_TIMEZONE` and `CHECKLIST_TIMEZONE` env vars
- All checklist due times stored as `timestamptz` (`due_at` column)
- Business date computed in configured timezone

### Unified Work Items

The `work-data.js` module merges tasks and checklist items into a single "work item" type for:
- Dashboard today view
- Tasks page (unified list with filters)
- MIS reports
- Notifications

### Follow-up Tasks

- Tasks can have follow-up dates (`followUpDate`, `originalScheduledDate`)
- Created when a task is marked followup
- Appear in unified lists with special labeling

### Status Computation

```javascript
// Tasks: based on task_status enum + completed_at + eta
// Checklists: based on status column + completed_at + due_at
// Deactivated: non-working day items (excluded from most views)
// Overdue: due_at < now AND not completed
// Pending: due_at >= now AND not completed
// Completed: status=completed OR completed_at not null
```

### Notification Deduplication

- Every notification has a `dedupe_key` (SHA-256 hash of identifying parts)
- `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING` prevents duplicates
- Keys include: entity IDs, timestamps, change hashes

---

## Environment Variables

### Required (All Environments)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `NEXT_PUBLIC_CHECKLIST_TIMEZONE` | Timezone for checklist scheduling (default: Asia/Kolkata) |

### Server-Only (Vercel)

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations (password reset, Cron) |
| `CRON_SECRET` | Long random string; sent by Vercel Cron to `/api/checklist/generate` |
| `CHECKLIST_TIMEZONE` | Server-side timezone for generation (must match client) |

### Supabase Auth Settings

- **Site URL**: `https://your-domain.com`
- **Redirect URLs**: `https://your-domain.com/update-password`

---

## Deployment Guide

### 1. GitHub Repository
```bash
git init
git add .
git commit -m "Initial delegation app deployment"
git branch -M main
git remote add origin https://github.com/OWNER/delegation-app.git
git push -u origin main
```

### 2. Supabase Project
1. Create project, save database password
2. Run migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_product_features.sql`
   - `supabase/migrations/003_checklist.sql`
   - `supabase/migrations/004_checklist_due_time.sql`
   - `supabase/migrations/005_checklist_completion_permissions.sql`
   - `supabase/migrations/006_checklist_monthly_days.sql`
   - `supabase/migrations/007_notifications.sql`
   - Additional patch migrations as needed
3. Copy Project URL and Publishable Key from Settings → API Keys

### 3. First Administrator
1. Supabase Auth → Add user (email/password, email confirmed)
2. Copy user UUID
3. Table Editor → `employees` → Insert:
   - `auth_user_id`: copied UUID
   - `name`, `email`: same as login
   - `role`: `super_admin`
   - `active`: true
   - `must_change_password`: false

### 4. Local Development
```bash
# Create .env.local
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

npm install
npm run dev
```

### 5. Vercel Deployment
1. Import GitHub repo
2. Add environment variables (Production, Preview, Development):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_CHECKLIST_TIMEZONE`
3. Add server-only variables:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` (generate: `openssl rand -hex 32`)
   - `CHECKLIST_TIMEZONE`
4. Deploy
5. Configure custom domain in Vercel → Settings → Domains

---

## Testing

```bash
npm run test
```

**Test Files**:
- `work-summary.test.mjs` — Status computation, summaries
- `checklist-template-update.test.mjs` — Template update validation
- `calendar-leave.test.mjs` — Leave classification
- `follow-up-tasks.test.mjs` — Follow-up metadata

---

## Security Considerations

1. **Never expose service role key** to browser (no `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`)
2. **RLS enabled** on all tables
3. **Publishable key only** in client code
4. **Private GitHub repository**
5. **Rotate keys** if shared in chat/email
6. **HTTPS only** in production (Vercel default)
7. **CSP headers** via Next.js defaults

---

## Migration History

| Migration | Description |
|-----------|-------------|
| `001_initial_schema.sql` | Core tables, enums, RLS, employee_mis view |
| `002_product_features.sql` | Task enhancements, notifications, triggers |
| `003_checklist.sql` | Checklist templates/items, RLS, triggers |
| `004_checklist_due_time.sql` | due_time column, due_at timestamptz, schedule constraint |
| `005_checklist_completion_permissions.sql` | Completion permission fixes |
| `006_checklist_monthly_days.sql` | monthly_days array for multiple monthly days |
| `007_notifications.sql` | Extended notifications (entity_type, dedupe_key, realtime, new triggers) |
| `20260817045334_checklist_non_working_day_deactivation.sql` | Non-working day deactivation logic |
| `20260817120000_checklist_direct_non_working_days.sql` | Direct non-working day tables |
| `20260821120000_allow_service_employee_transfer.sql` | Service role employee transfer |
| `20260826050546_sync_checklist_items_on_template_update.sql` | Sync generated items on template update |
| `20260826050741_sync_checklist_items_on_template_update.sql` | Patch for sync |
| `20260826050809_backfill_open_checklist_items.sql` | Backfill open items |
| `20260826050842_backfill_open_checklist_items.sql` | Patch for backfill |
| `20260826061157_checklist_item_updates.sql` | Checklist item updates table |
| `20260826061427_checklist_item_updates.sql` | Patch for updates |
| `20260826063948_allow_checklist_item_reopen.sql` | Reopen completed items |
| `20260826064026_allow_checklist_item_reopen.sql` | Patch for reopen |
| `20260829081413_fix_checklist_template_sync_service_role.sql` | Service role sync fix |
| `20260917051200_fix_checklist_template_update_guard.sql` | Template update guard fix |
| `20261024061358_optimize_work_list_queries.sql` | Work list query optimization (materialized view) |

---

## CSS Architecture (globals.css)

The app uses a **custom design system** with CSS custom properties:

### Color Tokens
- `--color-bg`, `--color-surface`, `--color-border`
- `--color-text`, `--color-text-muted`
- `--color-blue`, `--color-purple`, `--color-orange`, `--color-red`, `--color-green`, `--color-mint`, `--color-slate`

### Component Classes
- `.button`, `.button-primary`, `.button-ghost`, `.button-small`
- `.input`, `.search-box`
- `.panel`, `.metric-card`, `.badge`
- `.modal`, `.modal-backdrop`, `.modal-wide`
- `.task-row`, `.task-list`, `.mobile-task-card`
- `.checklist-template-row`, `.checklist-item-card`
- `.sidebar`, `.nav-link`, `.nav-section`
- `.filter-bar`, `.filter-control`
- `.loading-list`, `.skeleton-shimmer`
- `.empty-state`, `.inline-alert`

### Layout
- `.app-shell` (grid: sidebar + main)
- `.page-container`, `.page-header`
- `.detail-layout` (main + sidebar)

---

## Extensibility Points

1. **Add new task statuses**: Extend `task_status` enum + update status logic
2. **New checklist frequencies**: Add to `checklistFrequencies` + `isChecklistDueOnDate`
3. **Custom notification kinds**: Use `insert_notification_event` with new `kind`
4. **Additional employee fields**: Add columns to `employees` + update forms
5. **New MIS metrics**: Extend `get_work_report` RPC
6. **Webhook integrations**: Add Supabase Edge Functions on table changes

---

## Troubleshooting

| Issue | Cause | Resolution |
|-------|-------|------------|
| "Database migration X not applied" | Missing migration in Supabase | Run the referenced `.sql` in SQL Editor |
| "Checklist generation failed" | Missing `due_at`/`monthly_days` columns | Apply `004_checklist_due_time.sql` and `006_checklist_monthly_days.sql` |
| "Non-working day feature requires migration" | Missing `national_holidays`/`employee_non_working_days` | Apply `checklist_direct_non_working_days.sql` |
| "RLS policy violation" | User lacks manager role or ownership | Check `is_manager()` and employee_id match |
| "Auth session missing" | Cookie/token expired | Sign out → sign in; check `NEXT_PUBLIC_SUPABASE_URL` |
| Vercel Cron not running | `CRON_SECRET` mismatch | Ensure `CRON_SECRET` in Vercel matches nothing (Vercel sends it automatically) |

---

## File Reference: Key Modules

### lib/auth.js
- `getCurrentEmployee()` — Cached current user + employee profile
- `getAuthenticatedUser()` — Raw Supabase auth user
- `getAccessToken()` — Access token with auto-refresh
- `syncAuthSession()`, `clearAuthCache()` — Session sync
- `canCreateTasks(role)` — Role check for task creation
- `invalidateCurrentEmployee()` — Cache invalidation

### lib/supabase-browser.js
- `supabaseBrowser()` — Singleton browser client (persistSession, autoRefreshToken)
- `supabaseRecoveryBrowser()` — PKCE flow for password recovery

### lib/supabase-server.js
- `createSupabaseUserClient(accessToken)` — RLS-scoped client
- `createSupabaseAdminClient()` — Service role client (bypasses RLS)
- `getBearerToken(request)` — Extract Bearer token from request

### lib/checklist-data.js (Client)
- `getChecklistTemplatesPage()` — Paginated template list
- `getChecklistItems()` — Filtered checklist items
- `setChecklistCompletion()` — Complete/reopen via API
- `triggerChecklistGeneration()` — Manual generation trigger
- `getChecklistDashboardData()` — Today's items + metrics
- `formatChecklistDays()`, `formatChecklistTime()` — Display helpers

### lib/task-data.js (Client)
- `getTasks()` — Filtered task list
- `getTask()` — Single task detail
- `createTask()` — Create new task
- `setTaskCompletion()` — Complete/reopen task
- `getTaskEmployees()`, `getTaskAssignees()` — Employee lists

### lib/work-data.js (Client)
- `getWorkItemsPage()` — Unified paginated work items (from `work_items` view)
- `getWorkReport()` — MIS report via RPC
- `getUnifiedDashboardData()` — Dashboard metrics + today items
- `getUnifiedWorkItems()` — Full work list for export

### lib/work-summary.mjs
- `getUnifiedWorkItemStatus()` — Single status function for tasks + checklists
- `getWorkSummary()` — Aggregate counts
- `filterWorkItems()` — In-memory filtering

### lib/checklist-time.js
- `getChecklistBusinessDate()` — Date in configured timezone
- `localDateTimeToIso()` — Local date+time → ISO timestamptz
- `formatChecklistDueAt()` — Display formatter
- `isChecklistDueOnDate()` — Frequency matching logic

### lib/checklist-non-working-day.js
- `reconcileOpenChecklistItemsForNonWorkingDays()` — Generation-time reconciliation
- `getNonWorkingDayPreview()` — Preview deactivation for date
- `deactivateNonWorkingDayItems()` — Execute deactivation + notifications

### components/AppShell.js
- Authentication state machine (checking → authenticated/signed_out/password_change_required)
- Sidebar navigation with role-based items
- Real-time notification count via Realtime + polling
- Route guards for manager-only pages

---

## Conclusion

The Delegation App is a production-ready, role-based task management system with a strong focus on:
- **Recurring work automation** (checklists with cron generation)
- **Auditability** (updates, notifications, completion tracking)
- **Manager visibility** (MIS reports, unified dashboard)
- **Operational realism** (non-working days, timezone handling, follow-ups)
- **Security** (RLS, service-role isolation, idempotent notifications)

The codebase follows modern React/Next.js patterns with clear separation between client components, server API routes, and shared business logic in `lib/`.
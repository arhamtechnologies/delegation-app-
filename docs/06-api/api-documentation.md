# API Documentation

**Software/Project Name:** Delegation App
**Document ID:** DOC-API-001
**Version:** 1.0.0
**Status:** Draft
**Author:** Documentation Engineering Team
**Creation Date:** 2026-11-02
**Last Updated:** 2026-11-02

---

## Table of Contents

1. [API Overview](#1-api-overview)
2. [Base URLs and Environments](#2-base-urls-and-environments)
3. [Authentication](#3-authentication)
4. [Error Responses](#4-error-responses)
5. [Checklist API](#5-checklist-api)
6. [Task API](#6-task-api)
7. [Admin Employee API](#7-admin-employee-api)
8. [Account API](#8-account-api)
9. [WhatsApp API](#9-whatsapp-api)
10. [Rate Limits](#10-rate-limits)
11. [OpenAPI Specification](#11-openapi-specification)

---

## 1. API Overview

The Delegation App exposes RESTful API endpoints via Next.js Route Handlers. All endpoints are serverless functions deployed on Vercel.

### Design Principles

- **Resource-oriented** URLs
- **JSON** request/response bodies
- **Standard HTTP status codes**
- **Bearer token** authentication (Supabase JWT)
- **RLS-enforced** authorization (database-level)
- **Idempotent** operations where applicable

### Content Type

```
Content-Type: application/json
Accept: application/json
```

---

## 2. Base URLs and Environments

| Environment | Base URL |
|-------------|----------|
| **Development** | `http://localhost:3000/api` |
| **Preview** | `https://delegation-app-git-<branch>.vercel.app/api` |
| **Production** | `https://task.arham.app/api` |

---

## 3. Authentication

### 3.1 Authentication Methods

| Method | Header | Description |
|--------|--------|-------------|
| **User Token** | `Authorization: Bearer <access_token>` | Standard user requests (RLS-enforced) |
| **Cron Secret** | `Authorization: Bearer <CRON_SECRET>` | Vercel Cron jobs only |
| **Service Role** | Internal only | Server-side admin operations (never exposed) |

### 3.2 Obtaining User Token

1. User signs in via `/login` (Supabase Auth)
2. Supabase returns session with `access_token`
3. Client stores token in memory; mirrors to `dl_access_token` cookie
4. Client includes `Authorization: Bearer <access_token>` in API requests
5. Server validates via `createSupabaseUserClient(token)`

### 3.3 Token Refresh

- Supabase client auto-refreshes (`autoRefreshToken: true`)
- `lib/auth.js` → `getAccessToken({ forceRefresh })` forces refresh if expiry < 30s
- Call before any API mutation

---

## 4. Error Responses

### 4.1 Standard Error Format

```json
{
  "error": "Human-readable error message",
  "success": false
}
```

### 4.2 Checklist API Error Format

```json
{
  "success": false,
  "error": "Human-readable error message",
  "created": 0,
  "skipped": 0
}
```

### 4.3 HTTP Status Codes

| Code | Meaning | Typical Causes |
|------|---------|----------------|
| `200` | OK | Successful GET, PATCH |
| `201` | Created | Successful POST |
| `400` | Bad Request | Invalid JSON, missing fields, validation failure |
| `401` | Unauthorized | Missing/invalid token, expired session |
| `403` | Forbidden | Insufficient role permissions |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Duplicate, constraint violation, last super_admin protection |
| `500` | Internal Server Error | Database error, unexpected exception |
| `503` | Service Unavailable | Missing server configuration (service role, Resend, etc.) |

### 4.4 Common Error Messages

| Message | Cause | Resolution |
|---------|-------|------------|
| "You must be signed in to..." | Missing/invalid token | Re-authenticate |
| "Your session is invalid or has expired" | Token expired | Sign in again |
| "Only checklist managers can..." | Role not in (super_admin, assigner, ea) | Check user role |
| "Server authentication is not configured" | Missing `NEXT_PUBLIC_SUPABASE_*` env vars | Configure Vercel env |
| "Employee provisioning is not configured" | Missing `SUPABASE_SERVICE_ROLE_KEY` | Configure Vercel env |
| "Email invitations are not configured" | Missing `RESEND_API_KEY` | Configure Vercel env |
| "Checklist database migration X is not applied" | Missing migration | Run migration in Supabase |

---

## 5. Checklist API

### 5.1 Template CRUD

#### List Templates

```
GET /api/checklist/templates
```

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 0 | Page number |
| `pageSize` | integer | 50 | Items per page |
| `search` | string | "" | Search term (task, employee name, email) |
| `employeeId` | uuid | "all" | Filter by employee |
| `frequency` | string | "all" | Filter by frequency |
| `status` | string | "all" | Filter by active status |

**Headers**: `Authorization: Bearer <user_token>`

**Response 200**

```json
{
  "data": [
    {
      "id": "uuid",
      "employee_id": "uuid",
      "task": "string",
      "frequency": "daily|weekly|every_15_days|monthly",
      "weekday": 0-6,
      "day_of_month": 1-31,
      "monthly_days": [1,15],
      "start_date": "2026-01-01",
      "due_time": "17:00:00",
      "active": true,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z",
      "employee_name": "string",
      "employee_email": "string"
    }
  ],
  "count": 100
}
```

**Authorization**: Manager role required

---

#### Create Template

```
POST /api/checklist/templates
```

**Request Body**

```json
{
  "employee_id": "uuid",
  "task": "string (1-240 chars)",
  "frequency": "daily|weekly|every_15_days|monthly",
  "weekday": 0-6,
  "day_of_month": 1-31,
  "monthly_days": [1,15],
  "start_date": "2026-01-01",
  "due_time": "17:00:00",
  "active": true
}
```

**Validation Rules**

| Frequency | Required Fields |
|-----------|-----------------|
| `daily` | `employee_id`, `task`, `start_date`, `due_time` |
| `weekly` | `employee_id`, `task`, `weekday`, `start_date`, `due_time` |
| `every_15_days` | `employee_id`, `task`, `start_date`, `due_time` |
| `monthly` | `employee_id`, `task`, `day_of_month`, `monthly_days`, `start_date`, `due_time` |

**Response 201**

```json
{
  "success": true,
  "data": { "id": "uuid", ... }
}
```

**Authorization**: Manager role required

---

#### Update Template

```
PATCH /api/checklist/templates
```

**Request Body**

```json
{
  "id": "uuid",
  "employee_id": "uuid",
  "task": "string",
  "frequency": "daily|weekly|every_15_days|monthly",
  "weekday": 0-6,
  "day_of_month": 1-31,
  "monthly_days": [1,15],
  "start_date": "2026-01-01",
  "due_time": "17:00:00",
  "active": true
}
```

**Behavior**: Updates template; syncs generated items for future dates if schedule changed.

**Response 200**

```json
{
  "success": true,
  "data": { "id": "uuid", ... }
}
```

**Authorization**: Manager role required

---

#### Delete Template

```
DELETE /api/checklist/templates
```

**Request Body**

```json
{
  "id": "uuid"
}
```

**Behavior**: Deletes template + all generated checklist items (cascade via trigger).

**Response 200**

```json
{
  "success": true
}
```

**Authorization**: Manager role required

---

### 5.2 Checklist Generation

#### Trigger Generation

```
GET|POST /api/checklist/generate
```

**Headers**: 
- `Authorization: Bearer <CRON_SECRET>` (Vercel Cron)
- OR `Authorization: Bearer <user_token>` (Manual trigger by manager)

**Response 200**

```json
{
  "success": true,
  "ok": true,
  "date": "2026-01-15",
  "scanned": 150,
  "due": 45,
  "created": 42,
  "skipped": 3,
  "deactivatedNonWorkingDayItems": 5,
  "markedOverdue": 2
}
```

**Response 500** (Missing Migration)

```json
{
  "success": false,
  "error": "Checklist database migration 004_checklist_due_time.sql is not applied."
}
```

**Authorization**: CRON_SECRET or Manager role

---

### 5.3 Item Completion

#### Complete/Reopen Item

```
POST /api/checklist/[id]/complete
```

**Path Parameter**: `id` (checklist_item UUID)

**Request Body**

```json
{
  "completed": true
}
```

**Response 200**

```json
{
  "success": true,
  "data": { "id": "uuid", "status": "completed", "completed_at": "..." }
}
```

**Response 200** (Reopen)

```json
{
  "success": true,
  "data": { "id": "uuid", "status": "pending", "completed_at": null }
}
```

**Authorization**: 
- Doer: Own items only
- EA/Super Admin: Any item

---

### 5.4 Bulk Operations

#### Bulk Update Templates

```
POST /api/checklist/bulk-update
```

**Request Body**

```json
{
  "ids": ["uuid1", "uuid2"],
  "updates": {
    "employee_id": "uuid",
    "task": "string",
    "frequency": "daily|weekly|every_15_days|monthly",
    "weekday": 0-6,
    "day_of_month": 1-31,
    "monthly_days": [1,15],
    "start_date": "2026-01-01",
    "due_time": "17:00:00",
    "active": true
  }
}
```

**Response 200**

```json
{
  "success": true,
  "updated": 2
}
```

**Authorization**: Manager role required

---

#### Bulk Delete Templates

```
POST /api/checklist/bulk-delete
```

**Request Body**

```json
{
  "ids": ["uuid1", "uuid2"]
}
```

**Response 200**

```json
{
  "success": true,
  "deleted": 2
}
```

**Authorization**: Manager role required

---

### 5.5 Excel Import

#### Import Preview/Confirm

```
POST /api/checklist/import
```

**Request Body** (multipart/form-data)

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Excel (.xlsx/.xls) |
| `confirm` | boolean | `true` to commit, `false` for preview |

**Excel Columns**

| Column | Required | Description |
|--------|----------|-------------|
| Doer Name | Yes | Employee name |
| Doer Email | Yes | Employee email (matches employees table) |
| Task Details | Yes | Task description |
| Task Type | Yes | `daily`, `weekly`, `every_15_days`, `monthly` |
| ETA | Yes | Due time (HH:MM) |

**Response 200** (Preview)

```json
{
  "success": true,
  "preview": true,
  "templates": [
    { "employee_id": "uuid", "task": "...", "frequency": "...", "due_time": "17:00", "warnings": [] }
  ],
  "duplicates": [],
  "errors": []
}
```

**Response 200** (Confirm)

```json
{
  "success": true,
  "created": 5,
  "skipped": 1
}
```

**Authorization**: Manager role required

---

### 5.6 Non-Working Days

#### List Employee Leave

```
GET /api/checklist/non-working-days
```

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `employeeId` | uuid | Filter by employee |

**Response 200**

```json
{
  "data": [
    { "id": "uuid", "employee_id": "uuid", "non_working_date": "2026-01-15", "reason": "employee_leave", "created_at": "..." }
  ]
}
```

**Authorization**: Manager role required

---

#### Add Employee Leave

```
POST /api/checklist/non-working-days
```

**Request Body**

```json
{
  "employee_id": "uuid",
  "dates": ["2026-01-15", "2026-01-16"]
}
```

**Response 200**

```json
{
  "success": true,
  "data": { "employee_id": "uuid", "saved_count": 2 }
}
```

**Authorization**: Super Admin or EA

---

#### Remove Employee Leave

```
DELETE /api/checklist/non-working-days
```

**Request Body**

```json
{
  "employee_id": "uuid",
  "date": "2026-01-15"
}
```

**Response 200**

```json
{
  "success": true
}
```

**Authorization**: Super Admin or EA

---

### 5.7 National Holidays

#### List Holidays

```
GET /api/checklist/holidays
```

**Response 200**

```json
{
  "data": [
    { "id": "uuid", "holiday_date": "2026-01-26", "name": "Republic Day", "country": "India", "is_active": true }
  ]
}
```

**Authorization**: Any authenticated user

---

#### Create Holiday

```
POST /api/checklist/holidays
```

**Request Body**

```json
{
  "holiday_date": "2026-01-26",
  "name": "Republic Day",
  "country": "India"
}
```

**Authorization**: Super Admin or EA

---

#### Update Holiday

```
PATCH /api/checklist/holidays
```

**Request Body**

```json
{
  "id": "uuid",
  "name": "Updated Name",
  "is_active": false
}
```

**Authorization**: Super Admin or EA

---

#### Delete Holiday

```
DELETE /api/checklist/holidays
```

**Request Body**

```json
{
  "id": "uuid"
}
```

**Authorization**: Super Admin or EA

---

### 5.8 Non-Working Day Deactivation

#### Preview Deactivation

```
GET /api/checklist/deactivate-non-working-day/preview?date=2026-01-15
```

**Response 200**

```json
{
  "date": "2026-01-15",
  "isSunday": false,
  "isNationalHoliday": true,
  "holidayNames": ["Republic Day"],
  "employeesOnLeave": 3,
  "eligibleCount": 12,
  "items": [
    { "id": "uuid", "employeeId": "uuid", "employee": {...}, "task": "...", "dueDate": "2026-01-15", "dueAt": "...", "status": "pending", "reasons": ["National Holiday"] }
  ]
}
```

**Authorization**: Super Admin or EA

---

#### Execute Deactivation

```
POST /api/checklist/deactivate-non-working-day
```

**Request Body**

```json
{
  "date": "2026-01-15",
  "itemIds": ["uuid1", "uuid2"]
}
```

**Response 200**

```json
{
  "success": true,
  "deactivated": [...],
  "matchedCount": 12,
  "notificationsQueued": 10,
  "operationId": "uuid"
}
```

**Authorization**: Super Admin or EA

---

## 6. Task API

### 6.1 Delete Task

```
DELETE /api/tasks
```

**Request Body**

```json
{
  "id": "uuid"
}
```

**Behavior**: Soft delete — transfers related records to deleter, then deletes task.

**Response 200**

```json
{
  "success": true
}
```

**Authorization**: Manager role required

---

## 7. Admin Employee API

### 7.1 Create Employee

```
POST /api/admin/employees
```

**Headers**: `Authorization: Bearer <user_token>`

**Request Body**

```json
{
  "name": "string (1-120 chars)",
  "email": "valid email",
  "mobile": "string (optional, max 40)",
  "role": "super_admin|assigner|ea|doer",
  "active": true
}
```

**Process**:
1. Creates Supabase Auth user (random password, email_confirmed=true)
2. Inserts employees row (must_change_password=true)
3. Generates recovery link → `/update-password`
4. Sends invitation email via Resend

**Response 201**

```json
{
  "employee": { "id": "uuid", "auth_user_id": "uuid", "name": "...", "email": "...", "role": "...", "active": true, "must_change_password": true },
  "email_sent": true
}
```

**Errors**:
- `409`: Email already exists in Auth
- `503`: Resend not configured
- `403`: Not a manager

**Authorization**: Manager role required

---

### 7.2 Delete Employee

```
DELETE /api/admin/employees
```

**Request Body**

```json
{
  "employee_id": "uuid"
}
```

**Process**:
1. Verifies not last super_admin
2. Transfers all work to requester (tasks, checklists, audit records)
3. Deletes employees row
4. Deletes Auth user

**Response 200**

```json
{
  "success": true,
  "employee_id": "uuid"
}
```

**Errors**:
- `409`: Last super_admin, work transfer failed
- `403`: Not a manager, self-deletion

**Authorization**: Manager role required

---

### 7.3 Update Employee Email (Super Admin)

```
POST /api/admin/employees/update-email
```

**Request Body**

```json
{
  "employee_id": "uuid",
  "email": "new@email.com"
}
```

**Authorization**: Super Admin only

---

### 7.4 Reset Employee Password (Super Admin)

```
POST /api/admin/employees/reset-password
```

**Request Body**

```json
{
  "employee_id": "uuid"
}
```

**Process**: Generates recovery link, sends email via Resend.

**Authorization**: Super Admin only

---

## 8. Account API

### 8.1 Complete Password Change

```
POST /api/account/complete-password-change
```

**Request Body**

```json
{
  "password": "new_password"
}
```

**Context**: Called from `/change-password` page (first login or password reset).

**Response 200**

```json
{
  "success": true
}
```

**Authorization**: Authenticated user (must_change_password=true)

---

## 9. WhatsApp API (Optional)

### 9.1 Webhook

```
POST /api/whatsapp
```

**Headers**: `X-Green-API-Token: <webhook_token>`

**Request Body**: Green API webhook payload

**Process**: Validates token, processes inbound message via AI agent.

**Response 200**

```json
{ "success": true }
```

---

## 10. Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| All API routes | 100 req/min | Per IP (Vercel default) |
| `/api/checklist/generate` | 1 req/min | Per CRON_SECRET |
| `/api/admin/employees` | 10 req/min | Per user |
| WhatsApp webhook | 30 req/sec | Green API limit |

**Note**: No application-level rate limiting; relies on Vercel/Green API defaults.

---

## 11. OpenAPI Specification

```yaml
openapi: 3.0.3
info:
  title: Delegation App API
  version: 1.0.0
  description: Task delegation and checklist management API
servers:
  - url: https://task.arham.app/api
    description: Production
  - url: http://localhost:3000/api
    description: Development
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    Error:
      type: object
      properties:
        error:
          type: string
        success:
          type: boolean
          default: false
    ChecklistTemplate:
      type: object
      properties:
        id:
          type: string
          format: uuid
        employee_id:
          type: string
          format: uuid
        task:
          type: string
          maxLength: 240
        frequency:
          type: string
          enum: [daily, weekly, every_15_days, monthly]
        weekday:
          type: integer
          minimum: 0
          maximum: 6
        day_of_month:
          type: integer
          minimum: 1
          maximum: 31
        monthly_days:
          type: array
          items:
            type: integer
            minimum: 1
            maximum: 31
        start_date:
          type: string
          format: date
        due_time:
          type: string
          format: time
        active:
          type: boolean
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time
        employee_name:
          type: string
        employee_email:
          type: string
paths:
  /checklist/templates:
    get:
      summary: List checklist templates
      security:
        - BearerAuth: []
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 0
        - name: pageSize
          in: query
          schema:
            type: integer
            default: 50
        - name: search
          in: query
          schema:
            type: string
        - name: employeeId
          in: query
          schema:
            type: string
            format: uuid
        - name: frequency
          in: query
          schema:
            type: string
        - name: status
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Paginated template list
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/ChecklistTemplate'
                  count:
                    type: integer
    post:
      summary: Create checklist template
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChecklistTemplate'
      responses:
        '201':
          description: Created template
    patch:
      summary: Update checklist template
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChecklistTemplate'
      responses:
        '200':
          description: Updated template
    delete:
      summary: Delete checklist template
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [id]
              properties:
                id:
                  type: string
                  format: uuid
      responses:
        '200':
          description: Deleted
  /checklist/generate:
    get:
      summary: Trigger checklist generation
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Generation result
    post:
      summary: Trigger checklist generation
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Generation result
  /checklist/{id}/complete:
    post:
      summary: Complete/reopen checklist item
      security:
        - BearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [completed]
              properties:
                completed:
                  type: boolean
      responses:
        '200':
          description: Completion result
  /checklist/bulk-update:
    post:
      summary: Bulk update templates
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [ids, updates]
              properties:
                ids:
                  type: array
                  items:
                    type: string
                    format: uuid
                updates:
                  $ref: '#/components/schemas/ChecklistTemplate'
      responses:
        '200':
          description: Bulk update result
  /checklist/bulk-delete:
    post:
      summary: Bulk delete templates
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [ids]
              properties:
                ids:
                  type: array
                  items:
                    type: string
                    format: uuid
      responses:
        '200':
          description: Bulk delete result
  /checklist/import:
    post:
      summary: Import checklist templates from Excel
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                confirm:
                  type: boolean
      responses:
        '200':
          description: Import result
  /checklist/non-working-days:
    get:
      summary: List employee leave
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Leave list
    post:
      summary: Add employee leave
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [employee_id, dates]
              properties:
                employee_id:
                  type: string
                  format: uuid
                dates:
                  type: array
                  items:
                    type: string
                    format: date
      responses:
        '200':
          description: Leave added
    delete:
      summary: Remove employee leave
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [employee_id, date]
              properties:
                employee_id:
                  type: string
                  format: uuid
                date:
                  type: string
                  format: date
      responses:
        '200':
          description: Leave removed
  /checklist/holidays:
    get:
      summary: List national holidays
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Holiday list
    post:
      summary: Create holiday
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [holiday_date, name, country]
              properties:
                holiday_date:
                  type: string
                  format: date
                name:
                  type: string
                country:
                  type: string
      responses:
        '201':
          description: Holiday created
    patch:
      summary: Update holiday
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [id]
              properties:
                id:
                  type: string
                  format: uuid
                name:
                  type: string
                is_active:
                  type: boolean
      responses:
        '200':
          description: Holiday updated
    delete:
      summary: Delete holiday
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [id]
              properties:
                id:
                  type: string
                  format: uuid
      responses:
        '200':
          description: Holiday deleted
  /checklist/deactivate-non-working-day/preview:
    get:
      summary: Preview non-working day deactivation
      security:
        - BearerAuth: []
      parameters:
        - name: date
          in: query
          required: true
          schema:
            type: string
            format: date
      responses:
        '200':
          description: Preview data
  /checklist/deactivate-non-working-day:
    post:
      summary: Execute non-working day deactivation
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [date, itemIds]
              properties:
                date:
                  type: string
                  format: date
                itemIds:
                  type: array
                  items:
                    type: string
                    format: uuid
      responses:
        '200':
          description: Deactivation result
  /tasks:
    delete:
      summary: Delete task
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [id]
              properties:
                id:
                  type: string
                  format: uuid
      responses:
        '200':
          description: Task deleted
  /admin/employees:
    post:
      summary: Create employee
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, email, role, active]
              properties:
                name:
                  type: string
                  maxLength: 120
                email:
                  type: string
                  format: email
                mobile:
                  type: string
                  maxLength: 40
                role:
                  type: string
                  enum: [super_admin, assigner, ea, doer]
                active:
                  type: boolean
      responses:
        '201':
          description: Employee created
    delete:
      summary: Delete employee
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [employee_id]
              properties:
                employee_id:
                  type: string
                  format: uuid
      responses:
        '200':
          description: Employee deleted
  /admin/employees/update-email:
    post:
      summary: Update employee email (super_admin)
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [employee_id, email]
              properties:
                employee_id:
                  type: string
                  format: uuid
                email:
                  type: string
                  format: email
      responses:
        '200':
          description: Email updated
  /admin/employees/reset-password:
    post:
      summary: Reset employee password (super_admin)
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [employee_id]
              properties:
                employee_id:
                  type: string
                  format: uuid
      responses:
        '200':
          description: Password reset email sent
  /account/complete-password-change:
    post:
      summary: Complete first-time password change
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [password]
              properties:
                password:
                  type: string
                  minLength: 8
      responses:
        '200':
          description: Password changed
```

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-11-02 | Documentation Engineering Team | Initial version |

---

*End of API Documentation*
# Testing & Quality Assurance Document

**Software/Project Name:** Delegation App
**Document ID:** DOC-TEST-001
**Version:** 1.0.0
**Status:** Draft
**Author:** Documentation Engineering Team
**Creation Date:** 2026-11-02
**Last Updated:** 2026-11-02

---

## Table of Contents

1. [Testing Strategy](#1-testing-strategy)
2. [Test Pyramid](#2-test-pyramid)
3. [Unit Testing](#3-unit-testing)
4. [Integration Testing](#4-integration-testing)
5. [API Testing](#5-api-testing)
6. [End-to-End Testing](#6-end-to-end-testing)
7. [Security Testing](#7-security-testing)
8. [Performance Testing](#8-performance-testing)
9. [Test Environments](#9-test-environments)
10. [Test Scenarios](#10-test-scenarios)
11. [Expected Results](#11-expected-results)
12. [Known Limitations](#12-known-limitations)
13. [Release Acceptance Criteria](#13-release-acceptance-criteria)
14. [Test Automation](#14-test-automation)

---

## 1. Testing Strategy

### 1.1 Testing Philosophy

| Principle | Application |
|-----------|-------------|
| **Test Pyramid** | Many unit tests, fewer integration tests, minimal E2E |
| **Shift Left** | Test during development, not after |
| **Risk-Based** | Focus on critical paths (auth, data integrity, payments) |
| **Automation First** | CI runs tests on every PR |
| **Realistic Data** | Tests use production-like data shapes |

### 1.2 Quality Gates

| Gate | Tool | Threshold |
|------|------|-----------|
| **Lint** | ESLint | Zero warnings |
| **Type Check** | N/A (JavaScript) | N/A |
| **Unit Tests** | Custom Node.js runner | 100% pass |
| **Build** | Next.js | Successful |
| **Security Audit** | npm audit | No critical/high |

---

## 2. Test Pyramid

```
        ┌─────────────┐
        │   E2E Tests │  ← Few (critical paths only)
        │  (Manual)   │
        └─────────────┘
      ┌───────────────────┐
      │ Integration Tests │  ← Some (API + DB)
      │  (Node.js tests)  │
      └───────────────────┘
    ┌─────────────────────────┐
    │      Unit Tests         │  ← Many (pure functions)
    │  (Node.js tests)        │
    └─────────────────────────┘
```

### 2.3 Current Coverage

| Layer | Coverage | Target |
|-------|----------|--------|
| Unit Tests | ~60% (business logic) | > 80% |
| Integration Tests | Partial (API routes) | > 50% |
| E2E Tests | Manual only | Critical paths |
| Security Tests | Manual + npm audit | Automated |

---

## 3. Unit Testing

### 3.1 Test Framework

- **Runner**: Custom Node.js (`tests/run-tests.mjs`)
- **Assertion**: Node.js built-in `assert` module
- **Structure**: ES modules (`.mjs`)
- **Execution**: `npm run test`

### 3.2 Existing Unit Tests

| Test File | Module Under Test | Scenarios |
|-----------|-------------------|-----------|
| `work-summary.test.mjs` | `lib/work-summary.mjs` | Status computation, filtering, summaries |
| `checklist-template-update.test.mjs` | `lib/server/checklist-template-rules.mjs` | Template validation, sync logic |
| `calendar-leave.test.mjs` | `lib/calendar-leave.mjs` | Leave classification, holiday logic |
| `follow-up-tasks.test.mjs` | `lib/follow-up-tasks.mjs` | Follow-up metadata |
| `work-items.test.mjs` | `lib/work-items.mjs` | Transformers, sorting, deduplication |
| `whatsapp-*.test.mjs` | WhatsApp bot modules | Commands, formatting, permissions |

### 3.3 Unit Test Example

```javascript
// tests/work-summary.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnifiedWorkItemStatus, getWorkSummary, filterWorkItems } from '../lib/work-summary.mjs';

const now = new Date('2026-09-16T06:30:00.000Z');
const pendingTask = { id: 'task-pending', kind: 'task', assignee_id: 'employee-a', status: 'pending', eta: '2026-09-16T07:30:00.000Z' };
const overdueTask = { id: 'task-overdue', kind: 'task', assignee_id: 'employee-b', status: 'pending', eta: '2026-09-16T05:30:00.000Z' };

test('1. pending item', () => assert.equal(getUnifiedWorkItemStatus(pendingTask, now), 'pending'));
test('2. overdue item', () => assert.equal(getUnifiedWorkItemStatus(overdueTask, now), 'overdue'));
test('8. mixed dataset summarized', () => assert.deepEqual(getWorkSummary(mixedItems, now), { total: 4, pending: 2, overdue: 1, completed: 1 }));
```

### 3.4 Running Unit Tests

```bash
# All tests
npm run test

# Single test file
node tests/work-summary.test.mjs

# With coverage (if nyc configured)
npx nyc npm run test
```

---

## 4. Integration Testing

### 4.1 API Route Testing

Currently tested via unit tests that mock Supabase client. Future: Testcontainers or Supabase local.

### 4.2 Database Integration

| Test | Method |
|------|--------|
| Migration application | Manual in staging |
| RLS policy verification | Manual SQL queries |
| RPC function testing | Manual in Supabase SQL Editor |
| Trigger testing | Manual via UI actions |

### 4.3 Recommended Integration Test Setup

```javascript
// Future: Integration test with Supabase local
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'http://localhost:54321', // Local Supabase
  'local-anon-key'
);

test('Task creation enforces RLS', async () => {
  const { data, error } = await supabase.from('tasks').insert({...});
  // Assert RLS behavior
});
```

---

## 5. API Testing

### 5.1 Manual API Testing

**Tool**: Thunder Client (VS Code) / Postman / curl

### 5.2 Key API Test Scenarios

| Endpoint | Test Cases |
|----------|------------|
| `POST /api/checklist/templates` | Valid/invalid payload, auth, RLS, duplicate |
| `POST /api/checklist/generate` | Cron secret, manager auth, idempotency |
| `POST /api/checklist/[id]/complete` | Owner, EA, super_admin, unauthorized |
| `POST /api/admin/employees` | Valid/invalid, email duplicate, email send |
| `DELETE /api/admin/employees` | Self-delete, last super_admin, work transfer |
| `POST /api/account/complete-password-change` | Valid/invalid, must_change_password flag |

### 5.3 API Test Checklist

- [ ] Authentication required (401 without token)
- [ ] Authorization enforced (403 wrong role)
- [ ] Input validation (400 bad payload)
- [ ] Success response (200/201 correct shape)
- [ ] Error responses (consistent format)
- [ ] Idempotency (duplicate requests safe)
- [ ] Rate limiting (if applicable)

---

## 6. End-to-End Testing

### 6.1 Current Approach

**Manual E2E testing** for critical user journeys:

| Journey | Steps | Verification |
|---------|-------|--------------|
| **User Login** | 1. Open `/login` 2. Enter credentials 3. Submit | Redirects to `/dashboard` |
| **First Password Change** | 1. New user login 2. Redirected to `/change-password` 3. Set password | Redirects to `/dashboard`, `must_change_password=false` |
| **Task Creation** | 1. Manager creates task 2. Assigns to doer 3. Doer logs in | Task visible to doer, notification sent |
| **Checklist Generation** | 1. Create template 2. Trigger generation 3. Doer completes | Item created, status updates, notification |
| **Employee Invitation** | 1. Super admin adds employee 2. Email sent 3. Employee sets password | Employee can login, appears in roster |
| **MIS Report** | 1. Manager opens `/mis` 2. Applies filters 3. Exports CSV | Data loads, filters work, CSV downloads |

### 6.2 Recommended E2E Automation

```javascript
// Future: Playwright/Cypress tests
import { test, expect } from '@playwright/test';

test('Complete task flow', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'manager@test.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL('/dashboard');
  
  await page.goto('/tasks?create=1');
  await page.fill('input[name="title"]', 'Test Task');
  // ... complete form
  await page.click('button[type="submit"]');
  
  await expect(page.locator('text=Test Task')).toBeVisible();
});
```

---

## 7. Security Testing

### 7.1 Automated

| Test | Tool | Frequency |
|------|------|-----------|
| Dependency Audit | `npm audit` | Every CI run |
| Secret Scanning | GitHub Secret Scanning | Every push |
| SAST | GitHub CodeQL (if enabled) | Weekly |

### 7.2 Manual

| Test | Method | Frequency |
|------|--------|-----------|
| RLS Policy Verification | SQL queries as different roles | Per migration |
| Auth Flow Testing | Browser + network tab | Per release |
| XSS/Injection Attempts | Manual payloads | Per release |
| CSP Verification | Browser DevTools | Per release |

### 7.3 RLS Test Matrix

| Role | Table | Operation | Expected |
|------|-------|-----------|----------|
| doer | tasks | SELECT own | ✅ |
| doer | tasks | SELECT other | ❌ |
| assigner | tasks | SELECT all | ✅ |
| doer | checklist_items | UPDATE own | ✅ |
| doer | checklist_items | UPDATE other | ❌ |
| ea | checklist_items | UPDATE any | ✅ |

---

## 8. Performance Testing

### 8.1 Current Metrics

| Operation | Target | Current |
|-----------|--------|---------|
| Page Load (TTFB) | < 2s | ~1s |
| Dashboard Load | < 1.5s | ~800ms |
| API Response (p95) | < 500ms | ~300ms |
| Checklist Generation | < 60s | ~10s |
| MIS Report Query | < 3s | ~1s |

### 8.2 Load Testing (Recommended)

```bash
# Future: k6 load test
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 },
  ],
};

export default function() {
  const res = http.get('https://task.arham.app/dashboard', {
    headers: { Authorization: `Bearer ${__ENV.TOKEN}` },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

### 8.3 Database Performance

| Query | Optimization |
|-------|--------------|
| `work_items` pagination | Partial indexes + `sort_group/sort_key` |
| `get_work_report` RPC | Materialized CTE, server-side aggregation |
| Checklist generation | Upsert with `ON CONFLICT` |
| Notification count | Cached (2s TTL) + Realtime |

---

## 9. Test Environments

| Environment | Purpose | Data | Access |
|-------------|---------|------|--------|
| **Local** | Development | Synthetic/minimal | Developer machine |
| **Preview** | PR validation | Shared dev DB | Vercel Preview URL |
| **Staging** | Pre-production | Production-like | Internal team |
| **Production** | Live | Real | End users |

### 9.1 Environment Parity

| Aspect | Local | Preview | Staging | Production |
|--------|-------|---------|---------|------------|
| Supabase Project | Local/Dev | Dev | Staging | Prod |
| Vercel Project | N/A | Preview | N/A | Prod |
| Environment Vars | `.env.local` | Preview scope | N/A | Prod scope |
| Data Volume | Minimal | Medium | High | Highest |

---

## 10. Test Scenarios

### 10.1 Functional Test Scenarios

#### Authentication
| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| F-001 | Valid login | Enter correct credentials | Redirect to dashboard |
| F-002 | Invalid login | Enter wrong password | Error message |
| F-003 | Expired session | Wait > 1hr, refresh | Redirect to login |
| F-004 | Password reset | Forgot password → email → link → new password | Login with new password |
| F-005 | First login change | New user login | Redirect to change-password |

#### Task Management
| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| F-010 | Create task | Manager fills form, submits | Task appears in list |
| F-011 | Assign task | Select doer, submit | Doer sees task, notification |
| F-012 | Complete task | Doer clicks complete | Status=closed, completed_at set |
| F-013 | Add remark | Open task, add remark | Remark in updates, notification |
| F-014 | Delete task | Manager deletes | Task removed, work transferred |

#### Checklist System
| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| F-020 | Create template | Manager creates daily template | Template in list |
| F-021 | Auto generation | Wait for Cron (or manual trigger) | Items created for today |
| F-022 | Non-working day | Sunday/holiday/leave | Items created with deactivated status |
| F-023 | Complete item | Doer clicks complete | Status=completed, notification |
| F-024 | Reopen item | EA/super_admin reopens | Status=pending |
| F-025 | Bulk edit | Select multiple, edit | All updated |
| F-026 | Excel import | Upload file, confirm | Templates created |

#### Calendar
| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| F-030 | Add holiday | EA adds national holiday | Appears in list |
| F-031 | Add leave | EA adds employee leave | Appears in list |
| F-032 | Preview deactivation | Select date, preview | Shows affected items |
| F-033 | Execute deactivation | Click deactivate | Items status=deactivated |

#### MIS Reports
| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| F-040 | View overall | Open `/mis` | Summary + employee table |
| F-041 | Filter by date | Set date range | Data filtered |
| F-042 | Filter by employee | Select employee | Single employee data |
| F-043 | Drill down | Click employee row | Detail view opens |
| F-044 | Export CSV | Click export | CSV downloads |

### 10.2 Non-Functional Test Scenarios

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| NF-001 | Concurrent users | 50 users simultaneous | No errors, < 2s response |
| NF-002 | Large dataset | 10k tasks, 50k checklist items | Queries < 3s |
| NF-003 | Network latency | Simulate 200ms RTT | Usable, no timeouts |
| NF-004 | Offline resilience | Disconnect network | Graceful degradation |

---

## 11. Expected Results

### 11.1 Pass Criteria

- All unit tests pass (`npm run test`)
- Lint clean (`npm run lint`)
- Build succeeds (`npm run build`)
- Manual E2E scenarios verified
- No critical/high npm audit findings

### 11.2 Failure Handling

| Failure Type | Action |
|--------------|--------|
| Unit test fail | Block merge; fix test or code |
| Lint warning | Block merge; fix code |
| Build fail | Block merge; fix build |
| E2E fail | Investigate; block release if critical |
| Security audit fail | Block merge; update dependency |

---

## 12. Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| No TypeScript | No compile-time type safety | Runtime validation (Zod), tests |
| No E2E automation | Manual regression testing | Documented test scenarios |
| No contract testing | API changes may break client | Versioned API, careful changes |
| No load testing in CI | Performance regressions undetected | Manual load test pre-release |
| No visual regression | UI changes undetected | Manual review |
| No mutation testing | Test quality unknown | Code review + coverage |

---

## 13. Release Acceptance Criteria

### 13.1 Pre-Release Checklist

- [ ] All unit tests pass
- [ ] Lint clean (zero warnings)
- [ ] Build succeeds
- [ ] `npm audit` — no critical/high vulnerabilities
- [ ] Manual E2E scenarios verified (F-001 through F-044)
- [ ] Database migrations tested in staging
- [ ] Environment variables configured in Vercel
- [ ] Custom domain verified (if changed)
- [ ] Rollback plan documented

### 13.2 Post-Release Verification

- [ ] Production login works
- [ ] Cron jobs executing (check Vercel logs)
- [ ] Email delivery working (test invitation)
- [ ] Real-time notifications working
- [ ] Error rates normal (Vercel + Supabase dashboards)
- [ ] Performance metrics within targets

---

## 14. Test Automation

### 14.1 Current CI (Vercel + GitHub)

```yaml
# Implicit via Vercel GitHub integration
# On push: Preview deploy + build
# On PR: Preview deploy + build
# On merge to main: Production deploy
```

### 14.2 Recommended CI Enhancement

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
      - run: npm audit --audit-level=high
```

### 14.3 Test Reporting

| Report | Tool | Location |
|--------|------|----------|
| Unit Test Results | Console output | CI logs |
| Lint Results | ESLint | CI logs |
| Build Logs | Next.js | Vercel Dashboard |
| Audit Report | npm audit | CI logs |

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0.0 | 2026-11-02 | Documentation Engineering Team | Initial version |

---

*End of Testing & Quality Assurance Document*
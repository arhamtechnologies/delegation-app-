# WhatsApp bot: full app integration, token-lean

Date: 2026-10-27 · Status: draft for approval

## Intent

The WhatsApp bot (Green API → `app/api/whatsapp/webhook` → `lib/wa/*`, Claude Haiku via `@anthropic-ai/sdk`) is live at `https://task.arham.app`. Today it covers only part of the task module. The owners want to run the whole app from WhatsApp, so that a director or the EA rarely needs to open the web app. They pay for every Claude call, so the bot must give accurate answers without spending tokens it doesn't need.

## Who uses it

- **Two directors and one EA.** In the app these are the manager roles (`super_admin`, `assigner`, `ea`; `taskManagerRoles` in `lib/task-server.js`).
- Each person is identified by `employees.whatsapp_chat_id`. Their chat ID must also be listed in the `ALLOWED_CHAT_IDS` environment variable. One director (`919770207789@c.us`) is already linked. Linking the other two people is a setup step: an `employees` update plus a Vercel environment change. No code is needed for it.
- **Role limits follow the app (builder's call, from review).** The app does not treat all manager roles the same:
  - `nonWorkingDayManagerRoles` (`lib/checklist-server.js`) is `super_admin` + `ea` only.
  - An `assigner` can complete or reopen only their own checklist items.
  - The bot applies the same per-role limits through the shared modules (§3). It also leaves blocked actions out of that person's help text.
  - In today's database the manager accounts are one `super_admin` (Administrator, already linked) and two `ea` (Priyanka Shrivastava, Ravi Sir EA). Both roles have full rights, so nobody loses anything today.
- Employees (`doer`) do **not** use the bot. Unknown numbers keep getting the existing "not linked" reply.

## Goals

1. **Feature parity with the web app** for the things managers do day to day:
   - **Tasks.** The bot already lists, shows, creates, edits, reassigns, changes status, cancels and adds remarks. **New: remove.** "Remove / delete" means a *permanent delete*, following the app's existing rule in `app/api/tasks/route.js`. Remarks are cascade-deleted. Remove is never mapped to cancel or to complete.
   - **Creating tasks.** Gains the app form's optional fields: `proof_required` (the app defaults to true), `start_date`, `instructions` and `category`.
   - **Checklist items** (`checklist_items`, generated daily from templates):
     - list them by person, date and status (pending / overdue / completed)
     - mark one done; reopen one
     - add a remark (`checklist_item_updates`)
     - These follow the same rules as `app/api/checklist/[id]/complete/route.js`, including the rules for deactivated items, Sundays and holidays.
   - **Recurring checklist tasks** (`checklist_templates`):
     - list
     - create, with daily / weekly (by weekday) / every 15 days (from a start date) / monthly (on chosen days), plus a due time
     - edit
     - pause or resume (`active`)
     - delete. This is permanent and also deletes the generated items, as in `app/api/checklist/templates/route.js` DELETE.
     - The validation is the same as that route's `normalizeRecord`.
   - **Follow-up.** Same scope as the Follow-up page: both tasks and checklist items in follow-up (`getUnifiedWorkItems({ followUpOnly: true })` semantics).
   - **Updates / summary.** The existing daily report gains a checklist section: done / pending / overdue counts for the day.
   - **MIS.** A per-employee report for a date range (default this month): assigned, completed, completed on time, overdue, for tasks and checklist together. It matches the numbers on the MIS page (`get_work_report` RPC / `buildWorkEmployeePerformanceRows`).
   - **Leaves and holidays.** Mark an employee on leave for dates, list or remove a leave, add or remove a national holiday. Same rules as `app/api/checklist/non-working-days` and `.../holidays`.
2. **Every write is confirmed.** Every create, change and delete goes through the existing proposal → "Reply 1 to confirm, 2 to cancel" flow (`wa_pending_actions`, 10-minute expiry, at most 5 changes per confirmation). Permanent deletes are labelled `PERMANENT DELETE … cannot be undone`. Reads never need confirmation.
3. **Accuracy.** The bot computes results with the same logic as the app. It must never "approximate" counts or statuses in the model. Numbers in replies come from tool or command output, never from the model's own arithmetic.
4. **Spend fewer tokens.** Targets:
   - The most common messages cost **zero** Claude tokens.
   - A message that does go to Claude averages **≤ 1,500 input tokens per call** and **≤ 2 calls**.
   - Every Claude call's usage is recorded, so cost can be checked.

## Non-goals

- Employee admin from WhatsApp (create, deactivate, email, password reset). It touches logins and is rare.
- Bulk checklist import, bulk update and bulk delete.
- Media: photos, voice notes and completion-proof uploads. Non-text messages keep the "Please send text only." reply.
- Messaging employees on WhatsApp. In-app notifications still fire from the existing database triggers.
- Any UI change to the web app.

## Anti-goals (a failure even if it "works")

- "Remove #12" closes or cancels the task instead of deleting it. Or "done" deletes something.
- Any write that happens without a 1 confirmation.
- The bot reports a count or status that differs from what the same person sees in the app.
- Bypassing a rule the app enforces, for example:
  - completing a proof-required task with no proof
  - completing a deactivated checklist item
  - assigning to a manager or an inactive employee
- Token use goes *up* versus today for the same messages.

## How it works (decided)

### 1. A command layer that skips Claude

Extend `parseQuickCommand` (`lib/wa/updates.mjs`, or a new `lib/wa/commands.mjs`). Every message is matched against fixed patterns before Claude is considered. English plus common Hinglish phrasing:

| Example message | Result |
|---|---|
| `help`, `?` | help text |
| `updates`, `updates yesterday`, `aaj ka update` | daily report (now with checklist) |
| `#12` | task details |
| `#12 done` / `complete #12` | propose close |
| `remove #12` / `delete #12` | propose **permanent delete** |
| `cancel #12` | propose cancel |
| `overdue`, `pending`, `follow up` | lists |
| `<name> tasks`, `tasks of <name>` | that person's open tasks |
| `checklist`, `checklist today`, `checklist <name>`, `checklist overdue` | checklist items |
| `C45 done`, `reopen C45` | propose checklist done / reopen |
| `mis`, `mis this month`, `mis last month` | MIS report |

Anything that doesn't match exactly goes to Claude. Matching must be strict: a false match that does the wrong action is worse than calling Claude.

Write commands found by this layer still only *propose*. They use the same confirmation as the Claude path.

### 2. References for checklist items

Checklist items and templates have no human-friendly numbers. A migration adds `short_code bigint generated by default as identity unique` to `checklist_items` and `checklist_templates`, the same way as `tasks.short_code` in `20261026120000_whatsapp_bot.sql`. The bot shows them as:

- `C<n>` for a checklist item (a single day's instance)
- `R<n>` for a recurring checklist task (template)
- `#<n>` for a task, unchanged

### 3. Shared server logic (parity)

The app's rules currently live inside route handlers. Some, like `setTaskCompletion` and `createTask`, are browser-only. The bot already mirrors some of this in `lib/wa/actions.js`. For the new areas (checklist completion and reopen, template create / edit / delete, task delete, leave and holiday writes), extract the rule logic from each route into a server module that both the route and the bot call. That way the bot can't drift from the app. Each route keeps its HTTP and auth wrapper and its exact current behaviour.

### 4. Tools for Claude: few and grouped

Replace the 10 single-purpose tools with about 6 grouped tools that take an `action` field:

- `tasks` (find / get / summary)
- `task_change` (create / update / reassign / status / cancel / delete / remark)
- `checklist` (find items, item done / reopen / remark, templates list / create / update / pause / delete)
- `reports` (updates / mis / follow-up)
- `leave` (list / add / remove leave, add / remove holiday)

Descriptions are one line each, and schemas have no prose that repeats the system prompt. All write actions only propose.

### 5. Prompt diet

- Assignees are listed as names only. The server already resolves names, and ambiguous names come back to the model as errors.
- History is the last 4 messages, each cut to about 200 characters. Bot replies longer than that are cut down to their first line.
- `max_tokens` drops to about 400, and the tool loop to 3 rounds.
- Tool results stay compact, one line per item, and lists are capped (for example 15 rows with a "+N more" line).
- When a tool returns a finished report (updates, MIS), it is sent to WhatsApp **directly by the server**. The model does not re-type it, which saves the output tokens.

### 6. Prompt caching

The prompt is ordered so the fixed part (tool definitions and the static system instructions) comes first, with a `cache_control` breakpoint. The changing part comes after it: date, actor, assignee names, history. Before relying on caching, the builder checks the current minimum cacheable prompt length for the model used. If the fixed part is below that minimum, caching is skipped rather than padding the prompt to reach it.

### 7. Usage logging

Add `model`, `input_tokens`, `output_tokens`, `cache_read_tokens` and `cache_write_tokens` (nullable) to `wa_messages`, and fill them on the outgoing row of each message that used Claude. The totals are summed across rounds. A message answered by the command layer has nulls, which is how you can tell it cost nothing.

### 8. Model and effort

- Stay on Haiku (`claude-haiku-5-5`, `HAIKU_MODEL` in `lib/wa/agent.js`).
- **Found in review:** Claude Haiku 5.5 runs adaptive thinking **on by default at effort `medium`**. The current code sets neither, so every call pays for thinking tokens, which are billed as output.
- Set `output_config: { effort: "low" }`.
- Keep thinking adaptive. Disabling it risks tool calls being written as plain text.
- Keep `max_tokens` around 1024 rather than 400, so the low-effort thinking plus the reply is never cut off.
- Keep passing `response.content` back unchanged in the tool loop. Thinking blocks must be returned as they were received.

### 9. How the token target is measured (builder's call, from review)

- Claude Haiku 5.5's minimum cacheable prefix is **512 tokens**. The fixed part (tools plus static instructions) will be above that, so caching applies.
- "≤ 1,500 input tokens per call" means **uncached input tokens** (`usage.input_tokens`). Cache reads are logged separately.
- The tool set stays fixed for every call, so the cache is not invalidated. Choosing tools per message is out.
- Baseline: before swapping the prompt, use `messages.countTokens` on today's prompt and on the new one for the same sample messages. That's free and needs no real traffic, and it gives the "must not go up" check its number. If no API key is available locally, the usage log (§7) provides the baseline from production instead.

## Constraints

- Production runs on Vercel with Next.js App Router and the Node runtime. Processing happens in `after()` from the webhook. Keep it inside the route's `maxDuration` (60s).
- Supabase: the bot uses the service-role client, so it must enforce app rules itself (see §3). Migrations go in `supabase/migrations/` and must be applied to the production Supabase project before deploy.
- Times are India time (`Asia/Kolkata`). Reuse `lib/checklist-time.js`.
- Do not run `next build` while the dev server is running (it overwrites `.next`).
- The existing tests (`npm test` → `tests/run-tests.mjs`, `tests/whatsapp-updates.test.mjs`) must keep passing. Add tests for the command layer and the new handlers.

## Left to the builder

- File layout inside `lib/wa/`, and the exact names of the grouped tools and their actions.
- The exact regex set for the command layer, within the "strict" rule above.
- Reply wording, kept short and in the user's language. Emoji use stays as it is today.
- How to page long lists ("+N more, reply 'more'" or just a cap).
- Whether the MIS report reuses the `get_work_report` RPC (it is `security invoker` and granted to `authenticated` only) or recomputes the numbers on the server with the same shared functions. The requirement is identical numbers.

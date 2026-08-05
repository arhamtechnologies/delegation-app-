# Delegation App — Deployment Handoff

This repository is a clean Supabase + Next.js + Vercel deployment package reconstructed from the approved Delegation App requirements.

## Included
- Email/password login
- Role-ready employee master: super admin, assigner, EA, doer
- Task creation with mandatory ETA, priority, assignee and status
- Statuses: pending, followup, delayed, submitted, closed, not required
- Dashboard and employee MIS
- Supabase SQL schema with Row Level Security

## 1. Create the new GitHub repository
1. Extract this ZIP.
2. Create an empty private GitHub repository, suggested name: `delegation-app`.
3. From the extracted folder run:
```bash
git init
git add .
git commit -m "Initial delegation app deployment"
git branch -M main
git remote add origin https://github.com/OWNER/delegation-app.git
git push -u origin main
```
Do not upload `.env.local`.

## 2. Create the new Supabase project
1. Sign into the developer's Supabase account and create a project.
2. Save the database password securely.
3. Open **SQL Editor → New query**.
4. Copy the complete contents of `supabase/migrations/001_initial_schema.sql`, paste, and run it once.
5. Open **Project Settings / Connect / API Keys** and copy:
   - Project URL
   - Publishable key (`sb_publishable_...`)

## 3. Create the first administrator
1. Supabase → Authentication → Users → Add user.
2. Create the owner login with email/password and mark email confirmed.
3. Copy that user's UUID.
4. Supabase → Table Editor → `employees` → Insert row:
   - `auth_user_id`: copied UUID
   - `name`: administrator name
   - `email`: same login email
   - `role`: `super_admin`
   - `active`: true
   - `must_change_password`: false
5. Every future login user must also have a matching `employees` row with their Auth UUID.

## 4. Test locally
Create `.env.local` in the project root:
```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```
Then run:
```bash
npm install
npm run dev
```
Open `http://localhost:3000` and test login, employee creation and task creation.

## 5. Deploy on Vercel
1. Sign into Vercel using the developer's GitHub account.
2. Select **Add New → Project** and import the new `delegation-app` repository.
3. Framework should be detected as Next.js. Keep root directory as `./`.
4. Add environment variables for Production, Preview and Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Click Deploy.
6. After deployment, open the Vercel URL and test login.

## 6. Custom domain
In Vercel Project → Settings → Domains, add the required domain. At the DNS provider, add exactly the record Vercel displays. Do not delete the old production DNS until the new deployment is tested.

## 7. Important security notes
- Never expose a Supabase secret/service-role key in browser environment variables.
- Keep Row Level Security enabled.
- Use the publishable key in this app; it is designed to work with RLS.
- Make the GitHub repository private.
- Rotate passwords and keys if they have been shared in chat or email.

## 8. Data migration
This package creates a fresh database. Existing users/tasks are not copied because the old Supabase account is inaccessible. To migrate old data later, obtain a database export from the old account owner and import it only after mapping user UUIDs.

## Developer completion checklist
- [ ] SQL migration runs without error
- [ ] First super-admin Auth user and employee row created
- [ ] Local `npm run build` succeeds
- [ ] GitHub repository is private
- [ ] Vercel environment variables added to all environments
- [ ] Login works on production URL
- [ ] Employee and task creation tested
- [ ] RLS tested with a doer account
- [ ] Domain/DNS switched only after testing

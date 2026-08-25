# Juan Ortiz Lessor — Property Manager

A private, single-admin property management system: units, tenants, billing with
proof-of-payment, contracts & renewal alerts, maintenance logs, and a permits/document
archive. Built with **Next.js**, **Supabase** (Postgres + Storage + Auth), deployed on **Vercel**.

## What it does

- **Units** — residential & commercial units, each with a photo and status.
- **Contracts** — lease terms per unit, uploaded contract file, automatic
  "expiring soon" status and renewal alerts.
- **Billing** — monthly rent per tenant, upload of payment receipt + deposit slip,
  paid/pending/overdue tracking, and a one-click **generate follow-up billing**
  action for anything unpaid.
- **Maintenance** — repair log per unit with materials cost, before/after photos,
  and materials receipt upload.
- **Permits** — Mayor's Permit, DTI, Barangay Clearance, Fire Permit, Tax
  Declarations (Property & Building), Real Property Tax (Property & Building),
  Zonal Clearance, Occupancy Permit, Building Plan — each with expiry tracking.
- **Dashboard** — one place to see pending payments, upcoming renewals, and
  permits about to expire.

All files (photos, receipts, contracts, permits) are stored in **private** Supabase
Storage buckets — nothing is publicly accessible; every view link is a short-lived
signed URL.

---

## 1. Set up Supabase (the database)

1. Go to [supabase.com](https://supabase.com) → **New project**. Note the project URL
   and anon public key (Project Settings → API).
2. Open the **SQL Editor** → New query → paste the entire contents of
   `supabase/schema.sql` → **Run**. This creates all tables, storage buckets, security
   rules, and the alert-generating functions.
3. Create your login: **Authentication → Users → Add user**. Use your own email and
   a password — this is the only account you'll use to sign in.

## 2. Configure the app

1. Copy `.env.local.example` to `.env.local`.
2. Fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

## 3. Run locally (optional, to preview before deploying)

```bash
npm install
npm run dev
```
Visit `http://localhost:3000` and sign in with the user you created in step 1.3.

## 4. Deploy to Vercel

1. Push this project to a GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new) → import the repo.
3. Add the same two environment variables from `.env.local` in the Vercel project
   settings (Settings → Environment Variables).
4. Deploy. Your app will be live at `your-project.vercel.app`.

## 5. Keeping alerts current

The dashboard has a **"Refresh alerts"** button that checks for:
- unpaid bills → generates follow-up billing reminders
- contracts entering their renewal window
- permits expiring within 60 days

For fully automatic daily checks without opening the app, you can schedule the
`run_all_alert_checks()` SQL function using **Supabase → Database → Cron Jobs**
(pg_cron), e.g. once a day at 8 AM:
```sql
select cron.schedule('daily-alerts', '0 8 * * *', 'select run_all_alert_checks();');
```

## Notes

- This is built for **single-admin use** (just you, signed in with the one account
  you created). If you later want staff logins with limited access, the RLS
  policies in `supabase/schema.sql` are the place to add per-role rules.
- Storage buckets are private; every "View" link in the app generates a signed URL
  valid for 1 hour.

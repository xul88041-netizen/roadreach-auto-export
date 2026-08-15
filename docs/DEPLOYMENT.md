# Deployment Guide

The MVP uses only free-tier-compatible components: GitHub Pages for static public/admin assets and Supabase Free Tier for PostgreSQL, Auth, Storage and Edge Functions. No paid server or domain is required.

## USER ACTION REQUIRED — Supabase

### Create and link a project

1. Create a free project at [Supabase](https://supabase.com/dashboard).
2. Save the project URL and browser-safe publishable key from **Project Settings → API Keys**.
3. Install/use the CLI, authenticate and link:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

On Windows, if the npm wrapper cannot resolve its CLI binary, install the official Supabase CLI with Scoop or use the standalone release, then run the same commands without the `npx` prefix. A Docker-compatible runtime is required only for the optional local Supabase stack; linking and pushing to a hosted project do not require local Docker.

`db push` applies `supabase/migrations/202608160001_admin_v1.sql`, including tables, functions, RLS, storage bucket/policies and the daily sold-archive cron job.

### Create the one administrator

1. In **Authentication → Users**, create `xuli58836@gmail.com` with a strong unique password.
2. Confirm the email if required.
3. In **Authentication settings**, disable public user sign-ups. Admin users should be created only from the dashboard.
4. Do not create or commit a default password. The migration allowlists this email but does not create an Auth password.

### Configure and deploy Edge Functions

```powershell
npx supabase secrets set RATE_LIMIT_SALT="GENERATE_A_LONG_RANDOM_VALUE" ROADREACH_SERVICE_KEY="sb_secret_..." ALLOWED_ORIGINS="https://xul88041-netizen.github.io,http://localhost:4173,http://127.0.0.1:4173"
npx supabase functions deploy submit-inquiry
npx supabase functions deploy gmail-sync
```

The hosted runtime provides the Supabase URL. Store the elevated `ROADREACH_SERVICE_KEY` only as a Function Secret; it is never a browser, GitHub Variable, source-control, or Gmail value. Gmail secrets are separate; follow [GMAIL_SETUP.md](GMAIL_SETUP.md).

### Local runtime configuration

Copy `.env.example` to `.env` and use the values only in your terminal. Generate the browser config:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
node scripts/write-runtime-config.mjs
npx --yes http-server . -p 4173 -c-1
```

Open:

- Public showroom: `http://127.0.0.1:4173/`
- Admin: `http://127.0.0.1:4173/admin/`

Only the Supabase URL and publishable key enter `config.js`. They are designed for browser use with RLS. Never substitute a secret/service-role key.

## USER ACTION REQUIRED — GitHub Pages

The existing workflow deploys on pushes to `main`. This implementation intentionally remains on `admin-v1`; do not merge or deploy it as production until reviewed.

After explicit approval to merge later:

1. In the GitHub repository open **Settings → Secrets and variables → Actions → Variables**.
2. Add `SUPABASE_URL`.
3. Add `SUPABASE_PUBLISHABLE_KEY`.
4. Remove the obsolete `PUBLIC_API_URL` variable after confirming the new deployment.
5. Open **Settings → Pages** and keep **Source: GitHub Actions**.
6. Merge only after review, then the existing workflow publishes the same free URL:
   `https://xul88041-netizen.github.io/roadreach-auto-export/`
7. Verify `/` and `/admin/`, then submit a test inquiry and confirm it appears in Admin.

No production deployment or `main` merge is performed by this implementation.

## USER ACTION REQUIRED — Gmail

Create the Google Cloud OAuth client and set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` and `GMAIL_MAILBOX` as Supabase Function secrets. Exact steps are in [GMAIL_SETUP.md](GMAIL_SETUP.md).

## Email notification status

Inquiry database persistence is complete. Automatic email notification is intentionally `NOT_CONFIGURED` because no verified free transactional mail provider/domain credential was supplied. The UI never claims an email was sent. A later notification function can send to `xuli58836@gmail.com` and copy `xul88041@gmail.com` after a provider is chosen and its secret is stored server-side.

## Post-deployment checks

1. Run `npm run check` locally.
2. Create a Draft vehicle; verify it is absent publicly.
3. Publish it; verify it appears with only masked VIN for In Stock.
4. Change it to Available to Source; verify no VIN appears.
5. Mark Sold; verify it moves to Recently Sold and CTA says Find Similar Vehicle.
6. Archive it; verify it disappears.
7. Submit two inquiries with the same email; verify one Customer and two Inquiries.
8. Attempt `/admin/` while logged out and with a non-allowlisted user.
9. Inspect browser network responses to confirm no full VIN, RMB costs, profit or CRM fields.
10. Check widths 375px, 390px, 430px and desktop.

## Migration and rollback

Migrations are forward-only source of truth. Do not hand-create production tables. Before a future destructive migration, take a Supabase backup/export and request explicit approval. This migration creates new independent data only and does not touch `roadreach-personal-app` or old Gmail messages.

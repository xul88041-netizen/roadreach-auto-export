# RoadReach Auto Export — Implementation Report

Report date: 2026-08-16
Branch: `admin-v1`
Baseline: `origin/main` at `9da2dda`

## 1. Current architecture

- **Public and admin frontend:** static HTML/CSS/JavaScript on GitHub Pages, retaining the RoadReach deep-navy/orange identity.
- **Database/Auth/Storage:** independent Supabase Free Tier project.
- **Public read boundary:** `public_vehicle_catalog` security-invoker view with safe columns only.
- **Public write boundary:** rate-limited `submit-inquiry` Edge Function and service-role-only transactional RPC.
- **Administration:** `/admin/`, Supabase email/password Auth plus `admin_allowlist`.
- **Gmail:** authenticated `gmail-sync` Edge Function using Gmail API OAuth and `gmail.readonly` only.
- **Mainland China:** no stability guarantee is made for free overseas services; SQL migrations and static frontend keep migration paths open.

## 2. Major changed/added files

- Public application: `index.html`, `assets/styles.css`, `assets/public.js`, `assets/pricing.js`, `config.js`.
- Admin application: `admin/index.html`, `admin/admin.css`, `admin/admin.js`.
- Database: `supabase/migrations/202608160001_admin_v1.sql`, `supabase/config.toml`.
- Edge Functions: `supabase/functions/submit-inquiry/index.ts`, `supabase/functions/gmail-sync/index.ts`, shared CORS helper.
- Deployment/test scripts: `.github/workflows/pages.yml`, `scripts/write-runtime-config.mjs`, `scripts/verify.mjs`, `package.json`.
- Documentation: `docs/CURRENT_AUDIT.md`, `docs/SECURITY.md`, `docs/GMAIL_SETUP.md`, `docs/DEPLOYMENT.md`, this report.

## 3. Database tables

`admin_allowlist`, `vehicles`, `vehicle_images`, `customers`, `inquiries`, `followups`, `quotes`, `deals`, `customer_email_messages`, `gmail_sync_state`, `inquiry_rate_limits`.

Storage bucket: `vehicle-images` (public object delivery, administrator-only mutations).

## 4. RLS policies

- One administrator can CRUD operational tables through `is_admin()`.
- Anonymous vehicle rows are limited to Published and Sold-under-90-days.
- Anonymous column grants/view exclude full VIN, RMB costs, profit/margin and CRM data.
- Public vehicle-image metadata follows parent vehicle visibility.
- CRM, inquiries, follow-ups, quotes, deals and Gmail metadata have no anonymous policy.
- Storage upload/update/delete/select-management requires authenticated allowlisted admin.

See `docs/SECURITY.md` for the full boundary.

## 5. Entrypoints

- Local admin: `http://127.0.0.1:4173/admin/`
- Production admin after approved deployment: `https://xul88041-netizen.github.io/roadreach-auto-export/admin/`
- Local public: `http://127.0.0.1:4173/`
- Existing production public URL (unchanged until approved merge): `https://xul88041-netizen.github.io/roadreach-auto-export/`

## 6. Completed scope

- Phase 0 audit and isolated branch.
- Independent schema, migrations, Auth allowlist, RLS and storage policies.
- Vehicle CRUD, Draft/Published/Sold/Archived lifecycle, separate sourcing status and automatic VIN masking.
- Pricing calculator, manual public reference FOB override and internal profit calculations.
- Up to 15 images, multi-select upload, cover/order/delete and mobile arrow controls.
- Professional public filters, separate Recently Sold, Find Similar Vehicle CTA and pricing disclaimer.
- Inquiry persistence, honeypot/rate limit, Customer upsert by exact email and follow-up suggestion.
- Customer duplicate detection with administrator-only Merge/Keep Separate; no similarity auto-merge.
- Dashboard, Follow-ups, Quotes, Deals and private actual-profit records.
- Gmail historical/incremental import foundation, thread timelines and exclusion rules.
- EN/RU fixed UI dictionary and responsive public/admin layouts.

## 7. Test status

- `npm run check`: **passed** — 7/7 Node tests plus static architecture/security verification.
- `node --check assets/public.js admin/admin.js`: **passed**.
- Edge Function TypeScript parse/bundle check with esbuild: **passed** for both functions.
- `git diff --check`: **passed** (only Windows LF/CRLF informational warnings).
- Browser responsive verification: **passed** at 375px, 390px, 430px and 1280px for the public page and admin login; no horizontal overflow or page console errors.
- EN → RU → EN → RU browser toggle: **passed**.
- `supabase/tests/database.sql`: prepared with 11 pgTAP assertions, but not executed because this workstation has no Docker-compatible runtime and no user Supabase project/credentials. Live Auth/RLS/CRUD/inquiry/Gmail smoke tests remain a deployment step; they are not reported as passed.

## 8. USER ACTION REQUIRED

- Create a Supabase Free project and administrator Auth user.
- Apply migrations and deploy both Edge Functions.
- Configure GitHub Actions variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
- Create Gmail OAuth credentials/refresh token with `gmail.readonly` and store them as Function secrets.
- Optionally choose a transactional email provider later. Notification delivery is not falsely represented as active.

Exact steps: `docs/DEPLOYMENT.md` and `docs/GMAIL_SETUP.md`.

## 9. Remaining risks

- External free-tier availability and mainland China connectivity.
- Basic MVP rate limiting is not a WAF.
- Gmail filter heuristics require review after the first real historical import; import never sends or modifies email.
- A Google OAuth app left in External/Testing normally issues Gmail refresh tokens that expire after 7 days; continuing sync requires production publishing and any verification Google requests.
- Actual database/RLS behavior must be smoke-tested after credentials and migration are available.
- Public storage is appropriate only for public vehicle imagery.

## 10. Git safety

- `main` was fetched and verified clean before branch creation.
- No merge to `main` was performed.
- No push to `main` was performed.
- No commit or push was performed; the implementation remains as a reviewable working tree on local `admin-v1`.
- `roadreach-personal-app` was not cloned, read, modified or referenced as a runtime dependency.

# RoadReach Auto Export — Current Audit

Audit date: 2026-08-16
Audited baseline: `origin/main` at `9da2dda`
Implementation branch: `admin-v1`

## A. Current capabilities

- A static, single-page public showroom is deployed by GitHub Actions to GitHub Pages.
- The existing visual language is consistent: deep navy, orange accents, compact B2B typography, responsive cards, hero, process, FAQ and contact areas.
- `config.js` receives `PUBLIC_API_URL` at deployment time. Vehicle data and inquiries use `/api/public/export-vehicles` and `/api/public/inquiries` on that external origin.
- The page has featured inventory, body-type filters, a vehicle detail modal, photo galleries, status labels and WhatsApp/email calls to action.
- The existing inquiry flow has name/contact/destination/vehicle/budget/quantity and a honeypot.
- Basic layouts exist for desktop, tablet and mobile; the one-column 620px layout is a useful foundation.
- Public inventory is not hardcoded in `index.html`; a deployment verification script checks several public API assumptions.

## B. Missing capabilities

- No independent database, authentication, storage, admin application or CRM exists in this repository.
- No admin login, administrator allowlist, dashboard, vehicle lifecycle CRUD, image ordering, pricing calculator, customer records, follow-ups, quotes or deals.
- No Gmail OAuth historical importer or incremental sync foundation.
- No English/Russian language toggle or translation dictionary.
- Public filters do not cover brand, model, year, fuel, steering, stock status and price ranges.
- The inquiry schema lacks customer type, city, preferred model, purchase timing, source page, language and VIN request.
- There is no dedicated Recently Sold area or automatic 90-day archive mechanism.
- There are no database migrations, RLS policies, security documentation or database-boundary tests.

## C. Current risks

- The public site depends on an API outside this project, so RoadReach Auto Export is not an independent system.
- The old API contract uses different names and status concepts (`availabilityStatus`, `priceType`) and cannot represent publication lifecycle separately from sourcing status.
- The public response boundary is enforced by the old API rather than by migrations in this repository, so this project cannot prove that full VIN, RMB cost, profit or customer data are excluded.
- Honeypot-only spam protection has no demonstrable rate limiting.
- The current success copy states that an inquiry was sent, but the repository cannot prove database persistence or notification delivery.
- There is no authenticated storage boundary for upload/delete operations.
- Mobile support covers the public page only; there is no mobile admin workflow.
- External hero imagery depends on Unsplash availability. Supabase Free Tier and other overseas services cannot be represented as guaranteed stable from mainland China.

## D. Safe to retain and reuse

- Brand direction, palette, logo treatment, typography scale, hero/process/about/FAQ copy structure and public GitHub Pages URL.
- GitHub Pages deployment pattern, runtime-generated public configuration and secret-free browser configuration.
- Existing locally stored vehicle images and the WhatsApp contact route.
- Vehicle detail modal and responsive grid concepts.
- The existing principle that inventory data belongs outside the static repository.

## E. Required refactoring

- Replace the legacy `PUBLIC_API_URL` integration with a dedicated Supabase project configured by public URL and publishable key.
- Split the static page into maintainable HTML/CSS/JS while preserving the public visual identity.
- Query a safe public view, never the full `vehicles` table, and submit inquiries only through a controlled Edge Function.
- Add an independent `/admin/` application using Supabase email/password Auth and a database-backed administrator allowlist.
- Implement migrations for all operational tables, calculated values, triggers, constraints, RLS, storage policies and the 90-day sold lifecycle.
- Model `sourcing_status` and `publication_status` as separate fields.
- Add Gmail import/sync as server-side Edge Function code using `gmail.readonly`; no Gmail connector or browser-stored OAuth secret/token.

## F. Phase 1 delivery

- Independent Supabase schema, enums, tables, indexes, triggers, pricing calculations and timestamps.
- Safe public catalog view, controlled public inquiry RPC/Edge Function, administrator allowlist and RLS.
- Public vehicle image bucket with authenticated-admin write/delete rules.
- Security and deployment documentation with explicit secret boundaries.

## G. Phase 2 delivery

- Mobile-capable admin app and public inventory integration.
- Inquiry/Customer CRM, follow-ups, quotes and deals.
- Gmail historical import and incremental sync foundation.
- EN/RU public experience, responsive verification, security tests and final implementation report.

## Baseline observations

- GitHub Pages workflow deploys only `main`, which protects the stable public site while work remains on `admin-v1`.
- `origin/main` was clean and synchronized before branch creation.
- No files from `roadreach-personal-app` are present or referenced. That application is outside the work scope and will not be changed.

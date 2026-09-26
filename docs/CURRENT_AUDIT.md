# RoadReach Auto Export — Current System Audit & Resolution Report

Audit date: 2026-09-26  
Audited baseline: `origin/main`  
Status: **P0 / P1 Security & Architecture Items Fully Resolved**

---

## 1. System Overview & Capabilities

- **Public Showroom**: Deployed to GitHub Pages via automated GitHub Actions CI/CD.
  - Multi-language support across 6 global trade languages: English (EN), Russian (RU), Arabic (AR with RTL support), Spanish (ES), French (FR), Simplified Chinese (ZH).
  - High-performance vehicle cards with photo counts, lazy loading, FOB request pricing boundaries, and WhatsApp direct CTAs.
  - Interactive modal with multi-image gallery, keyboard navigation, and responsive thumbnails.
  - Live statistics counter, trust verification badges, and sticky navbar.
- **Backend & Database**: Fully independent Supabase architecture with PostgreSQL.
  - Security-invoker public view `public.public_vehicle_catalog` strictly excludes internal RMB costs, profit margins, and full VINs.
  - Row Level Security (RLS) enabled on all 11 operational tables (`vehicles`, `vehicle_images`, `customers`, `inquiries`, `followups`, `quotes`, `deals`, `customer_email_messages`, `gmail_sync_state`, `inquiry_rate_limits`, `admin_allowlist`).
  - Edge Functions for public inquiries (`submit-inquiry`) and Gmail mailbox synchronization (`gmail-sync`).
- **Admin Application**: Located at `/admin/`, authenticated via Supabase Auth with database-enforced `is_admin()` allowlist.
  - Complete CRM: Vehicle CRUD, image ordering, FOB price calculator, customer management, inquiry review, follow-up scheduling, and deal pipeline.

---

## 2. Issues Identified in Audit & Resolutions Applied

### [P0 - Resolved] Public Inventory Dual-Source & Invalid Inquiry UUID
- **Finding**: `assets/public.js` previously hardcoded a static `permanentVehicles` array that merged into remote data, bypassing database lifecycle, RLS, and admin moderation. The static vehicle IDs (e.g., `lynkco-02-2019`) were non-UUID strings, causing database foreign key errors when customers submitted inquiries for them.
- **Resolution**:
  - Removed `permanentVehicles` entirely from `public.js`.
  - Refactored `loadInventory()` so that `public_vehicle_catalog` is the sole source of truth for public vehicles.
  - Added graceful degradation: if Supabase is unreachable or unconfigured, the catalog displays a localized unavailable message (`inventoryUnavailable`) instead of fake static cars.
  - Added UUID validation in `startInquiry()`, guaranteeing that only valid UUIDs are submitted as `vehicle_id`.

### [P0 - Resolved] Automated Scripts Bypassing Admin Moderation & Direct Push to Main
- **Finding**: `scripts/auto_cache_publisher.py` wrote directly to frontend JavaScript, automatically generated synthetic VINs, set status to `PUBLISHED`, and ran `git push origin main`.
- **Resolution**:
  - Disabled all automatic git commit and push operations.
  - Refactored `publish_vehicle_from_cache` to generate local draft files (`drafts/{stock_id}.json`) with `publication_status: "DRAFT"`.
  - Eliminated synthetic VIN generation; real full VIN entry is deferred to authorized administrators during review in `/admin/`.
  - Updated the Windows launcher batch script to reflect the new draft-only, human-in-the-loop workflow.

### [P0 - Resolved] Packet Sniffer Global Proxy & Root Certificate Security Risks
- **Finding**: `start_sniffer.py` automatically modified Windows registry settings for global system proxy, while `install_cert.py` attempted to inject untrusted self-signed root certificates into the Windows user trust store.
- **Resolution**:
  - Added hard compliance blocks: `start_sniffer.py` and `install_cert.py` now refuse execution by default, printing explicit risk warnings regarding system security and third-party platform authorization.
  - Guaranteed automatic cleanup of system proxy settings (`set_windows_proxy(False)`).
  - Modified `wechat_sniffer.py` to strictly enforce `publish_now=False`, preventing automated public dissemination.

### [P1 - Resolved] Automated Scripts Restricted to DRAFT-Only Storage
- **Finding**: Automated tools (`auto_cache_publisher.py`, `supabase_publisher.py`) previously had paths that could set vehicles directly to `PUBLISHED` or bypass review.
- **Resolution**:
  - Enforced permanent draft-only insertion (`publication_status = "DRAFT"`).
  - All automated PATCH to `PUBLISHED` logic was permanently eliminated.
  - Added rigorous image upload validation; if any image fails to upload or link, an automated rollback triggers immediately, deleting uploaded storage objects and removing the orphan draft vehicle record.
  - The ONLY permitted path to transition a vehicle from `DRAFT` to `PUBLISHED` is an explicit manual action by an authenticated administrator in `/admin/`.

### [P1 - Resolved] Inquiry Rate Limit Race Condition, UUID Enforcement & Fail-Closed Salt
- **Finding**: The `submit-inquiry` Edge Function performed rate limiting via a read-then-write sequence on `inquiry_rate_limits`, allowing concurrent bursts to bypass limits. Additionally, `RATE_LIMIT_SALT` fell back to a generic default, and malformed `vehicle_id` was not rejected at the Edge layer.
- **Resolution**:
  - Created an atomic database function `public.check_inquiry_rate_limit(p_fingerprint_hash, p_window_started_at, p_max_requests)` with atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` locking, set `search_path = public, pg_temp`, revoked execution from public/anon/authenticated, and granted solely to `service_role`.
  - Added strict backend UUID validation rejecting malformed or non-UUID `vehicle_id` with HTTP 400.
  - Enforced fail-closed behavior: `submit-inquiry` immediately rejects requests with HTTP 503 if `RATE_LIMIT_SALT` is missing, eliminating fallback defaults.

### [Resolved] Hygiene, Ignored Artifacts & CDN Pinning
- **Finding**: Tracked `__pycache__` and `test_output` files were present in the Git tree, `.gitignore` lacked wildcard recursive patterns, and Supabase JS used floating `@2` CDN tags.
- **Resolution**:
  - Removed all cached `.pyc` and `test_output` assets from Git index (`git rm --cached`).
  - Strengthened `.gitignore` with `**/__pycache__/`, `*.py[cod]`, `scripts/crawler/test_output/`, and `drafts/`.
  - Pinned `@supabase/supabase-js` CDN links across `index.html`, `admin/index.html`, and `admin/reset-password.html` to stable `@2.49.1`.

---

## 3. Recommended Future Enhancements

1. **Per-Vehicle SEO Landing Pages**: Generate static slug routes or lightweight SSR/dynamic metadata for published vehicles to enhance organic search discovery on Google/Yandex.
2. **End-to-End Supabase Testing**: Complement the existing 10 contract tests with automated Supabase local migration & Edge Function integration tests in GitHub Actions.
3. **Responsive Image Delivery**: Implement dynamic thumbnail downsizing / responsive `srcset` for mobile cards.

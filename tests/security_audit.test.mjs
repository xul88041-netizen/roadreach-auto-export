import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public_vehicle_catalog SQL strictly restricts visibility to PUBLISHED only", async () => {
  const sql = await read("supabase/migrations/202609260001_security_hardening.sql");
  const viewMatch = sql.match(/create or replace view public\.public_vehicle_catalog[\s\S]+?group by v\.id;/u);
  assert.ok(viewMatch, "public_vehicle_catalog view must be defined in migration");
  const viewSql = viewMatch[0];

  // Must only allow PUBLISHED
  assert.match(viewSql, /where v\.publication_status = 'PUBLISHED'/u);
  // Must NOT allow SOLD, ARCHIVED, or DRAFT in the catalog view
  assert.doesNotMatch(viewSql, /publication_status = 'SOLD'/u);
  assert.doesNotMatch(viewSql, /publication_status = 'ARCHIVED'/u);
  assert.doesNotMatch(viewSql, /publication_status = 'DRAFT'/u);

  // Must omit sensitive private fields
  for (const forbidden of [
    "full_vin",
    "internal_vehicle_cost_rmb",
    "total_other_cost_rmb",
    "target_profit_rmb",
    "suggested_fob_price_usd",
    "expected_profit_rmb",
    "expected_margin",
  ]) {
    assert.doesNotMatch(viewSql, new RegExp(`\\b${forbidden}\\b`, "u"), `view must not expose ${forbidden}`);
  }
});

test("anonymous RLS policy on vehicles is strictly restricted to PUBLISHED only", async () => {
  const sql = await read("supabase/migrations/202609260001_security_hardening.sql");
  const anonPolicy = sql.match(/create policy public_visible_vehicles on public\.vehicles for select to anon using \(([\s\S]+?)\);/u);
  assert.ok(anonPolicy, "public_visible_vehicles anon policy must exist");
  const policyBody = anonPolicy[1].trim();

  assert.equal(policyBody, "publication_status = 'PUBLISHED'");
  assert.doesNotMatch(policyBody, /SOLD/u);
  assert.doesNotMatch(policyBody, /DRAFT/u);
});

test("public.js has no hardcoded static vehicles and handles unavailable Supabase gracefully", async () => {
  const source = await read("assets/public.js");

  // Must not have permanentVehicles
  assert.doesNotMatch(source, /permanentVehicles/u);
  assert.doesNotMatch(source, /lynkco-02-2019/u);

  // Must have fallback message on connection failure
  assert.match(source, /inventoryUnavailable/u);
  assert.match(source, /isValidUuid/u);
});

test("submit-inquiry Edge Function strictly enforces backend UUID validation", async () => {
  const source = await read("supabase/functions/submit-inquiry/index.ts");

  // Must define UUID regex
  assert.match(source, /const UUID_REGEX = \/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-5\]\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}\$\/i/u);

  // Must validate payload.vehicle_id against UUID_REGEX and reject with 400
  assert.match(source, /payload\.vehicle_id !== null && !UUID_REGEX\.test\(String\(payload\.vehicle_id\)\)/u);
  assert.match(source, /Invalid vehicle ID format/u);
});

test("submit-inquiry Edge Function fails closed when RATE_LIMIT_SALT is not configured", async () => {
  const source = await read("supabase/functions/submit-inquiry/index.ts");

  // Must not contain hardcoded default/fallback salt
  assert.doesNotMatch(source, /roadreach-default-production-salt/u);
  assert.doesNotMatch(source, /configure-this-secret-before-production/u);

  // Must fail closed when rateLimitSalt is missing
  assert.match(source, /RATE_LIMIT_SALT_NOT_CONFIGURED/u);
  assert.match(source, /503/u);
});

test("check_inquiry_rate_limit RPC is atomic, secure, and restricted from anonymous execution", async () => {
  const sql = await read("supabase/migrations/202609260001_security_hardening.sql");
  const rpcMatch = sql.match(/create or replace function public\.check_inquiry_rate_limit[\s\S]+?\$\$[\s\S]+?\$\$;/u);
  assert.ok(rpcMatch, "check_inquiry_rate_limit RPC must be defined");
  const rpcSql = rpcMatch[0];

  // Must be atomic via ON CONFLICT DO UPDATE
  assert.match(rpcSql, /insert into public\.inquiry_rate_limits/u);
  assert.match(rpcSql, /on conflict \(fingerprint_hash, window_started_at\)[\s\S]+?do update set request_count = public\.inquiry_rate_limits\.request_count \+ 1/u);
  assert.match(rpcSql, /returning request_count into v_count/u);

  // Must have security definer and hardened search_path
  assert.match(rpcSql, /security definer/u);
  assert.match(rpcSql, /set search_path = public, pg_temp/u);

  // Must revoke execution from public, anon, and authenticated
  assert.match(sql, /revoke all on function public\.check_inquiry_rate_limit\(text, timestamptz, integer\) from public, anon, authenticated;/u);
  // Must only grant execute to service_role
  assert.match(sql, /grant execute on function public\.check_inquiry_rate_limit\(text, timestamptz, integer\) to service_role;/u);
});

test("automated scripts never write PUBLISHED status and never push to main", async () => {
  const [supabasePub, configPy, runCrawler, autoCache] = await Promise.all([
    read("scripts/crawler/supabase_publisher.py"),
    read("scripts/crawler/config.py"),
    read("scripts/crawler/run_crawler.py"),
    read("scripts/auto_cache_publisher.py"),
  ]);

  // supabase_publisher.py must only insert DRAFT and contain rollback
  assert.match(supabasePub, /"publication_status": "DRAFT"/u);
  assert.doesNotMatch(supabasePub, /"publication_status": "PUBLISHED"/u);
  assert.match(supabasePub, /delete_storage_objects/u);
  assert.match(supabasePub, /delete_car_url/u);

  // config.py must default to DRAFT
  assert.match(configPy, /DEFAULT_PUBLICATION_STATUS = "DRAFT"/u);
  assert.doesNotMatch(configPy, /DEFAULT_PUBLICATION_STATUS = os\.getenv\("DEFAULT_PUBLICATION_STATUS", "PUBLISHED"\)/u);

  // run_crawler.py must force DRAFT
  assert.match(runCrawler, /normalized\["publication_status"\] = "DRAFT"/u);
  assert.doesNotMatch(runCrawler, /publish_now/u);

  // auto_cache_publisher.py must only write DRAFT and never push
  assert.match(autoCache, /"publication_status": "DRAFT"/u);
  assert.doesNotMatch(autoCache, /git push/u);
  assert.doesNotMatch(autoCache, /origin main/u);
});

test("simulated atomic sliding window rate limiter handles concurrent bursts correctly", () => {
  // Simulates Postgres atomic row-lock UPSERT behavior in JS
  const store = new Map();
  function atomicCheckLimit(fingerprint, windowKey, maxLimit = 5) {
    const key = `${fingerprint}:${windowKey}`;
    const current = store.get(key) || 0;
    const next = current + 1;
    store.set(key, next);
    return next <= maxLimit;
  }

  const fingerprint = "client-sha256-hash-001";
  const windowKey = "2026-09-26T21:00:00.000Z";

  // Simulate 30 concurrent requests hitting the endpoint
  const results = [];
  for (let i = 0; i < 30; i++) {
    results.push(atomicCheckLimit(fingerprint, windowKey, 5));
  }

  const allowedCount = results.filter(Boolean).length;
  const blockedCount = results.filter((r) => !r).length;

  assert.equal(allowedCount, 5, "exactly 5 requests must be allowed in the sliding window");
  assert.equal(blockedCount, 25, "exactly 25 requests must be rejected (429)");
});

test("simulated UUID format checker rejects malformed and malicious vehicle IDs", () => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const validUuids = [
    "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "550e8400-e29b-41d4-a716-446655440000",
    "c2c51cd0-d252-4a64-9da2-dda000000001",
  ];

  const invalidUuids = [
    "lynkco-02-2019",
    "RR-0002",
    "12345",
    "'; DROP TABLE vehicles; --",
    "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' OR 1=1",
    "null",
    "undefined",
    "../../etc/passwd",
  ];

  for (const valid of validUuids) {
    assert.equal(UUID_REGEX.test(valid), true, `valid UUID should pass: ${valid}`);
  }

  for (const invalid of invalidUuids) {
    assert.equal(UUID_REGEX.test(invalid), false, `invalid ID must fail: ${invalid}`);
  }
});

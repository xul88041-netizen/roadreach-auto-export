import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [publicHtml, publicJs, adminHtml, adminJs, workflow, configWriter, migration, security, gmail] = await Promise.all([
  read("index.html"), read("assets/public.js"), read("admin/index.html"), read("admin/admin.js"),
  read(".github/workflows/pages.yml"), read("scripts/write-runtime-config.mjs"),
  read("supabase/migrations/202608160001_admin_v1.sql"), read("docs/SECURITY.md"), read("docs/GMAIL_SETUP.md"),
]);

assert.match(publicHtml, /assets\/styles\.css/u);
assert.match(publicHtml, /EN \/ <b>RU<\/b>/u);
assert.match(publicHtml, /request_full_vin/u);
assert.match(publicHtml, /Recently Sold/u);
assert.match(publicJs, /public_vehicle_catalog/u);
assert.match(publicJs, /functions\.invoke\("submit-inquiry"/u);
assert.doesNotMatch(publicJs, /service[_-]?role/iu);
assert.match(adminHtml, /Dashboard[\s\S]*Vehicles[\s\S]*Inquiries[\s\S]*Customers[\s\S]*Follow-ups[\s\S]*Quotes[\s\S]*Deals[\s\S]*Email Sync[\s\S]*Settings/u);
assert.match(adminJs, /signInWithPassword/u);
assert.match(adminJs, /rpc\("is_admin"/u);
assert.match(adminJs, /vehicle-images/u);
assert.match(workflow, /vars\.SUPABASE_URL/u);
assert.match(workflow, /vars\.SUPABASE_PUBLISHABLE_KEY/u);
assert.doesNotMatch(workflow, /vars\.PUBLIC_API_URL/u);
assert.match(workflow, /path: _site/u);
assert.doesNotMatch(workflow, /path: \./u);
assert.match(configWriter, /SUPABASE_PUBLISHABLE_KEY/u);
assert.match(migration, /enable row level security/giu);
assert.match(migration, /with \(security_invoker = true\)/u);
assert.match(migration, /xuli58836@gmail\.com/u);
assert.match(migration, /archive_expired_sold_vehicles/u);
assert.match(security, /full_vin/u);
assert.match(gmail, /gmail\.readonly/u);

const viewSql = migration.match(/create or replace view public\.public_vehicle_catalog[\s\S]+?alter table public\.admin_allowlist/u)?.[0] || "";
for (const forbidden of ["full_vin", "internal_vehicle_cost_rmb", "target_profit_rmb", "suggested_fob_price_usd", "expected_profit_rmb", "expected_margin", "customer_email_messages"]) {
  assert.doesNotMatch(viewSql, new RegExp(`\\b${forbidden}\\b`, "u"), `public view must omit ${forbidden}`);
}

for (const secretPattern of [/GMAIL_CLIENT_SECRET\s*=\s*["'][^.$]/u, /GMAIL_REFRESH_TOKEN\s*=\s*["'][^.$]/u, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'][^.$]/u]) {
  assert.doesNotMatch([publicHtml, publicJs, adminHtml, adminJs].join("\n"), secretPattern);
}

console.log("RoadReach static architecture and security-boundary verification passed.");

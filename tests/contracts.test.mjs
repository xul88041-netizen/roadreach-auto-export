import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateVehiclePricing } from "../assets/pricing.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("price calculator uses RMB costs, exchange and target profit", () => {
  const result = calculateVehiclePricing({ internal_vehicle_cost_rmb: 70000, exchange_rate: 7.5, domestic_transport_cost_rmb: 2000, refurbishment_cost_rmb: 1000, export_document_cost_rmb: 1500, port_loading_cost_rmb: 500, other_cost_rmb: 0, target_profit_rmb: 5000 });
  assert.equal(result.totalOtherCostRmb, 5000);
  assert.equal(result.totalCostRmb, 75000);
  assert.equal(result.suggestedFobUsd, 80000 / 7.5);
  assert.equal(Math.round(result.expectedProfitRmb), 5000);
});

test("manual public FOB override recalculates profit and margin", () => {
  const result = calculateVehiclePricing({ internal_vehicle_cost_rmb: 70000, exchange_rate: 7, target_profit_rmb: 5000, public_reference_fob_price_usd: 12000 });
  assert.equal(result.expectedProfitRmb, 14000);
  assert.equal(result.expectedMargin, 14000 / 84000);
});

test("public catalog SQL omits private vehicle and CRM fields", async () => {
  const sql = await read("supabase/migrations/202608160001_admin_v1.sql");
  const view = sql.match(/create or replace view public\.public_vehicle_catalog[\s\S]+?alter table public\.admin_allowlist/u)?.[0];
  assert.ok(view);
  for (const field of ["full_vin","internal_vehicle_cost_rmb","total_other_cost_rmb","target_profit_rmb","suggested_fob_price_usd","expected_profit_rmb","expected_margin"]) assert.doesNotMatch(view,new RegExp(`\\b${field}\\b`,"u"));
});

test("all private application tables enable RLS", async () => {
  const sql = await read("supabase/migrations/202608160001_admin_v1.sql");
  for (const table of ["admin_allowlist","vehicles","vehicle_images","customers","inquiries","followups","quotes","deals","customer_email_messages","gmail_sync_state","inquiry_rate_limits"]) assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`,"u"));
});

test("Gmail import excludes system mail and does not hardcode known customers", async () => {
  const source = await read("supabase/functions/gmail-sync/index.ts");
  for (const exclusion of ["mailer-daemon","delivery status notification","instagram","facebook","google notification","newsletter","ticket received"]) assert.match(source,new RegExp(exclusion.replace("-","-?"),"iu"));
  for (const known of ["terryatoba@importyourcar.ng","info@mjmotors.co.tz","sales@gmaxmotors.co.ke","info@alhusnainmotors.co.ke","anis@fic-co.sa"]) assert.doesNotMatch(source,new RegExp(known.replaceAll(".","\\."),"iu"));
  assert.doesNotMatch(source,/gmail\/v1\/users\/me\/(messages\/send|trash|labels)/iu);
});

test("responsive contracts cover requested mobile widths", async () => {
  const [publicCss, adminCss] = await Promise.all([read("assets/styles.css"),read("admin/admin.css")]);
  assert.match(publicCss,/@media\(max-width:620px\)/u);
  assert.match(adminCss,/@media\(max-width:700px\)/u);
  assert.match(adminCss,/\.editor-dialog\{width:100%;max-width:none;max-height:100vh;height:100vh/u);
});

test("deployment keeps automatic Pages pushes limited to main", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  assert.match(workflow,/branches: \[main\]/u);
  assert.doesNotMatch(workflow,/branches: \[admin-v1\]/u);
  assert.match(workflow,/path: _site/u);
  assert.doesNotMatch(workflow,/path: \./u);
});

test("administrator password recovery preserves local and GitHub Pages paths", async () => {
  const [adminHtml, adminJs, resetHtml, resetJs, config] = await Promise.all([
    read("admin/index.html"), read("admin/admin.js"), read("admin/reset-password.html"), read("admin/reset-password.js"), read("supabase/config.toml"),
  ]);
  assert.match(adminHtml, /Forgot password\?/u);
  assert.match(adminJs, /resetPasswordForEmail\(email, \{ redirectTo: recoveryUrl \}\)/u);
  assert.match(adminJs, /new URL\("reset-password\.html", window\.location\.href\)/u);
  assert.match(adminJs, /reason: "rpc-error"/u);
  assert.match(adminJs, /not on the administrator allowlist/u);
  assert.match(resetHtml, /New password/u);
  assert.match(resetJs, /PASSWORD_RECOVERY/u);
  assert.match(resetJs, /auth\.getSession\(\)/u);
  assert.match(resetJs, /auth\.updateUser\(\{ password \}\)/u);
  assert.match(resetJs, /Passwords do not match/u);
  assert.match(resetJs, /location\.replace\("\.\/"\)/u);
  for (const url of [
    "https://xul88041-netizen.github.io/roadreach-auto-export/admin/reset-password.html",
    "http://127.0.0.1:4173/admin/reset-password.html",
    "http://localhost:4173/admin/reset-password.html",
  ]) assert.match(config, new RegExp(url.replaceAll(".", "\\."), "u"));
  assert.doesNotMatch([adminJs, resetJs].join("\n"), /https:\/\/xul88041-netizen\.github\.io\/admin\//u);
});

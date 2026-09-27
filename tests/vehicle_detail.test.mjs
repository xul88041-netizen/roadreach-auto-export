import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("1. PUBLISHED vehicle detail page structure and script logic", async () => {
  const [vehicleHtml, vehicleJs] = await Promise.all([
    read("vehicle.html"),
    read("assets/vehicle.js")
  ]);

  // vehicle.html elements
  assert.match(vehicleHtml, /id="detailContent"/u);
  assert.match(vehicleHtml, /id="galleryHeroWrap"/u);
  assert.match(vehicleHtml, /id="detailMainImage"/u);
  assert.match(vehicleHtml, /id="detailTitleText"/u);
  assert.match(vehicleHtml, /id="detailPriceVal"/u);
  assert.match(vehicleHtml, /id="detailSpecsGrid"/u);
  assert.match(vehicleHtml, /id="vehicleInquiryForm"/u);
  assert.match(vehicleHtml, /id="detailUnavailable"/u);

  // vehicle.js loads from public_vehicle_catalog
  assert.match(vehicleJs, /\.from\("public_vehicle_catalog"\)/u);
  assert.match(vehicleJs, /renderVehicleDetail\(vehicle\)/u);

  // og:type must be website (not article)
  assert.match(vehicleHtml, /<meta property="og:type" content="website">/u);
  assert.match(vehicleJs, /setMetaAttr\('meta\[property="og:type"\]',\s*"content",\s*"website"\)/u);
});

test("2, 3, 4. DRAFT, SOLD, ARCHIVED are blocked from vehicle detail page", async () => {
  const [vehicleJs, migrationSql] = await Promise.all([
    read("assets/vehicle.js"),
    read("supabase/migrations/202609260001_security_hardening.sql")
  ]);

  // Frontend check: refuses to render anything other than PUBLISHED
  assert.match(vehicleJs, /vehicle\.publication_status !== "PUBLISHED"/u);
  assert.match(vehicleJs, /showUnavailable\(\)/u);

  // Database contract: public_vehicle_catalog physically excludes DRAFT, SOLD, ARCHIVED
  const viewDef = migrationSql.match(/create or replace view public\.public_vehicle_catalog[\s\S]+?where\s+v\.publication_status = 'PUBLISHED'/u);
  assert.ok(viewDef, "public_vehicle_catalog view must strictly filter for PUBLISHED only");
});

test("5. Invalid UUID immediately shows unavailable without JS error", async () => {
  const vehicleJs = await read("assets/vehicle.js");

  // Must validate UUID format
  assert.match(vehicleJs, /const isValidUuid =/u);
  assert.match(vehicleJs, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-5\]\[0-9a-f\]\{3\}/u);

  // If !id || !isValidUuid(id), calls showUnavailable()
  assert.match(vehicleJs, /if \(!id \|\| !isValidUuid\(id\)\) \{\s*showUnavailable\(\);\s*return;\s*\}/u);

  // Check UUID regex against edge cases
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.equal(uuidRegex.test(""), false);
  assert.equal(uuidRegex.test("abc"), false);
  assert.equal(uuidRegex.test("12345"), false);
  assert.equal(uuidRegex.test("RR-ACCORD-2016-0901"), false);
  assert.equal(uuidRegex.test("00000000-0000-0000-0000-000000000000' OR '1'='1"), false);
  assert.equal(uuidRegex.test("543ad5aa-0e69-4752-bdce-d4f10b080fb1"), true);
});

test("6. Vehicle detail page never requests full_vin", async () => {
  const [vehicleHtml, vehicleJs] = await Promise.all([
    read("vehicle.html"),
    read("assets/vehicle.js")
  ]);

  // Cannot select or query full_vin
  assert.doesNotMatch(vehicleJs, /\bfull_vin\b/u);
  // Form input request_full_vin is a user checkbox, but the page never asks for full_vin itself
  assert.doesNotMatch(vehicleHtml, /name="full_vin"/u);
});

test("7. Vehicle detail page never exposes internal costs or profits", async () => {
  const [vehicleHtml, vehicleJs] = await Promise.all([
    read("vehicle.html"),
    read("assets/vehicle.js")
  ]);

  const combined = vehicleHtml + "\n" + vehicleJs;
  for (const forbidden of [
    "internal_vehicle_cost_rmb",
    "target_profit_rmb",
    "suggested_fob_price_usd",
    "expected_profit_rmb",
    "expected_margin",
    "customer_id",
    "customer_email_messages"
  ]) {
    assert.doesNotMatch(combined, new RegExp(`\\b${forbidden}\\b`, "u"), `Forbidden field ${forbidden} must not exist in detail page`);
  }
});

test("8. JSON-LD structured data strictly conforms to Schema.org Vehicle and omits private fields", async () => {
  const vehicleJs = await read("assets/vehicle.js");

  // Must declare Schema.org Vehicle type
  assert.match(vehicleJs, /"@context":\s*"https:\/\/schema\.org"/u);
  assert.match(vehicleJs, /"@type":\s*"Vehicle"/u);
  assert.match(vehicleJs, /"brand":\s*\{\s*"@type":\s*"Brand"/u);
  assert.match(vehicleJs, /"model":/u);
  assert.match(vehicleJs, /"vehicleModelDate":/u);

  // Must check if price exists before generating offers
  assert.match(vehicleJs, /vehicle\.public_reference_fob_price_usd/u);
  assert.match(vehicleJs, /"@type":\s*"Offer"/u);

  // Must never include forbidden or fabricated fields
  for (const forbidden of [
    "full_vin",
    "internal_vehicle_cost_rmb",
    "target_profit_rmb",
    "profit",
    "customer",
    "priceValidUntil",
    "availabilityEnds",
    "aggregateRating",
    "review"
  ]) {
    assert.doesNotMatch(vehicleJs, new RegExp(`\\b${forbidden}\\b`, "u"), `JSON-LD must not emit ${forbidden}`);
  }
});

test("9. Inventory card View Details and image links point to vehicle.html?id=<UUID>", async () => {
  const publicJs = await read("assets/public.js");

  assert.match(publicJs, /const detailUrl = `vehicle\.html\?id=\$\{encodeURIComponent\(vehicle\.id\)\}`;/u);
  assert.match(publicJs, /<a href="\$\{detailUrl\}" aria-label=/u);
  assert.match(publicJs, /<a class="detail-link" href="\$\{detailUrl\}"/u);
  assert.match(publicJs, /t\("viewDetails",\s*"View Details →"\)/u);
});

test("10. Inquiry form binds and sends the authentic vehicle UUID", async () => {
  const [vehicleHtml, vehicleJs] = await Promise.all([
    read("vehicle.html"),
    read("assets/vehicle.js")
  ]);

  // Form contains vehicle_id input
  assert.match(vehicleHtml, /<input type="hidden" name="vehicle_id" id="formVehicleId">/u);

  // vehicle.js sets form.elements.vehicle_id.value = vehicle.id
  assert.match(vehicleJs, /form\.elements\.vehicle_id\.value = vehicle\.id;/u);

  // Submits to submit-inquiry Edge Function
  assert.match(vehicleJs, /client\.functions\.invoke\("submit-inquiry",\s*\{\s*body:\s*payload\s*\}\)/u);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");

assert.doesNotMatch(html, /const\s+cars\s*=\s*\[/u, "vehicle inventory must not be hardcoded in index.html");
assert.match(html, /ROADREACH_CONFIG\?\.publicApiBaseUrl/u, "public API origin must come from runtime configuration");
assert.match(html, /fetch\(publicVehicleApiUrl/u, "showroom must fetch RoadReach vehicle data");
assert.match(html, /fetch\(publicInquiryApiUrl/u, "showroom must submit inquiries to RoadReach");
assert.match(html, /vehicleId/u, "vehicle quote requests must retain the RoadReach vehicle ID");
assert.match(html, /customerName/u, "inquiry submissions must include the customer name");
assert.match(html, /website/u, "inquiry forms must include a honeypot field");
assert.match(html, /availabilityStatus/u, "showroom must render the API availability status");
assert.match(html, /featuredBlock/u, "showroom must include a Featured vehicle area");
assert.match(workflow, /vars\.PUBLIC_API_URL/u, "deployment must inject PUBLIC_API_URL from a GitHub repository variable");

const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map((match) => match[1]);
for (const source of inlineScripts) new Function(source);

console.log("RoadReach public showroom verification passed.");

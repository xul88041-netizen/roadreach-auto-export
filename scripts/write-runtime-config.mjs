import { writeFile } from "node:fs/promises";

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/u, "");
const supabasePublishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY repository variables are required for deployment.");
}

const url = new URL(supabaseUrl);
if (url.protocol !== "https:") {
  throw new Error("SUPABASE_URL must use HTTPS.");
}
if (!/^sb_(publishable|anon)_/u.test(supabasePublishableKey) && !/^eyJ/u.test(supabasePublishableKey)) {
  throw new Error("SUPABASE_PUBLISHABLE_KEY does not look like a browser-safe Supabase key.");
}

await writeFile(
  new URL("../config.js", import.meta.url),
  `window.ROADREACH_CONFIG = Object.freeze(${JSON.stringify({ supabaseUrl: url.toString().replace(/\/+$/u, ""), supabasePublishableKey }, null, 2)});\n`,
  "utf8",
);

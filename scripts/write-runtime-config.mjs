import { writeFile } from "node:fs/promises";

const publicApiBaseUrl = String(process.env.PUBLIC_API_URL || "").trim().replace(/\/+$/u, "");
if (!publicApiBaseUrl) {
  throw new Error("GitHub repository variable PUBLIC_API_URL is required for deployment.");
}

const url = new URL(publicApiBaseUrl);
if (url.protocol !== "https:") {
  throw new Error("PUBLIC_API_URL must use HTTPS.");
}

await writeFile(
  new URL("../config.js", import.meta.url),
  `window.ROADREACH_CONFIG = Object.freeze(${JSON.stringify({ publicApiBaseUrl: url.toString().replace(/\/+$/u, "") }, null, 2)});\n`,
  "utf8",
);

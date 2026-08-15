import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const rateLimitSalt = Deno.env.get("RATE_LIMIT_SALT") || "configure-this-secret-before-production";
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const allowedFields = [
  "name", "company", "country", "city", "customer_type", "email", "whatsapp_or_phone",
  "vehicle_id", "stock_id", "preferred_model", "quantity", "target_budget", "destination_port",
  "purchase_timing", "message", "request_full_vin", "language", "source_page",
] as const;

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "").slice(0, max) : "";
}

function normalizePayload(input: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const field of allowedFields) payload[field] = input[field];
  payload.name = cleanText(input.name, 120);
  payload.company = cleanText(input.company, 180);
  payload.country = cleanText(input.country, 100);
  payload.city = cleanText(input.city, 100);
  payload.customer_type = ["DEALER", "IMPORTER", "FLEET", "PERSONAL_BUYER", "OTHER"].includes(String(input.customer_type)) ? input.customer_type : "OTHER";
  payload.email = cleanText(input.email, 254).toLowerCase() || null;
  payload.whatsapp_or_phone = cleanText(input.whatsapp_or_phone, 80) || null;
  payload.vehicle_id = cleanText(input.vehicle_id, 40) || null;
  payload.stock_id = cleanText(input.stock_id, 40) || null;
  payload.preferred_model = cleanText(input.preferred_model, 180);
  payload.quantity = Math.min(1000, Math.max(1, Number(input.quantity) || 1));
  payload.target_budget = input.target_budget === "" || input.target_budget == null ? null : Math.max(0, Number(input.target_budget));
  payload.destination_port = cleanText(input.destination_port, 140);
  payload.purchase_timing = cleanText(input.purchase_timing, 140);
  payload.message = cleanText(input.message, 5000);
  payload.request_full_vin = input.request_full_vin === true;
  payload.language = input.language === "ru" ? "ru" : "en";
  payload.source_page = cleanText(input.source_page, 500);
  return payload;
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function enforceRateLimit(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const agent = request.headers.get("user-agent") || "unknown";
  const fingerprint = await sha256(`${rateLimitSalt}:${ip}:${agent}`);
  const windowMs = 15 * 60 * 1000;
  const start = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
  const { data, error } = await db.from("inquiry_rate_limits").select("request_count").eq("fingerprint_hash", fingerprint).eq("window_started_at", start).maybeSingle();
  if (error) throw error;
  if ((data?.request_count || 0) >= 5) return false;
  const next = (data?.request_count || 0) + 1;
  const { error: writeError } = await db.from("inquiry_rate_limits").upsert({ fingerprint_hash: fingerprint, window_started_at: start, request_count: next });
  if (writeError) throw writeError;
  if (Math.random() < 0.02) await db.from("inquiry_rate_limits").delete().lt("window_started_at", new Date(Date.now() - 86_400_000).toISOString());
  return true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return json(request, { error: "Invalid request" }, 400);
    if (cleanText((raw as Record<string, unknown>).website, 200)) return json(request, { accepted: true }, 202);
    if (!(await enforceRateLimit(request))) return json(request, { error: "Too many requests. Please try again later." }, 429);
    const payload = normalizePayload(raw as Record<string, unknown>);
    if (String(payload.name).length < 2 || String(payload.country).length < 2) return json(request, { error: "Name and country are required." }, 400);
    if (!payload.email && !payload.whatsapp_or_phone) return json(request, { error: "Email or WhatsApp/phone is required." }, 400);
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(String(payload.email))) return json(request, { error: "Please enter a valid email address." }, 400);
    const { data, error } = await db.rpc("submit_public_inquiry", { payload });
    if (error) throw error;
    return json(request, { accepted: true, inquiry_id: data }, 201);
  } catch (error) {
    console.error("submit-inquiry", error);
    return json(request, { error: "The inquiry could not be saved. Please contact RoadReach by WhatsApp or email." }, 500);
  }
});

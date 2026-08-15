import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
// Stored only as a Function Secret; never expose a privileged key to a client.
const serviceRoleKey = Deno.env.get("ROADREACH_SERVICE_KEY")!;
const gmailClientId = Deno.env.get("GMAIL_CLIENT_ID") || "";
const gmailClientSecret = Deno.env.get("GMAIL_CLIENT_SECRET") || "";
const gmailRefreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN") || "";
const mailbox = (Deno.env.get("GMAIL_MAILBOX") || "xuli58836@gmail.com").toLowerCase();
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

type GmailHeader = { name?: string; value?: string };
type GmailPart = { mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string; size?: number }; parts?: GmailPart[]; headers?: GmailHeader[] };
type GmailMessage = { id: string; threadId: string; internalDate?: string; payload?: GmailPart & { headers?: GmailHeader[] } };

const excludedPattern = /(mailer-daemon|delivery status notification|undeliver|\bbounce\b|delivery delay|delivery failure|automatic reply|auto.?reply|out of office|newsletter|instagram|facebook|google notification|security alert|ticket received|do not reply|no-?reply)/iu;
const requirementPattern = /(quotation|quote|price|fob|cif|vehicle|car|suv|pickup|sedan|commercial|electric|\bev\b|shipping|inspection|import|dealer|distributor|purchase|buy|units?|port|mombasa|dar es salaam|cooperat|integration)/iu;
const strongIntentPattern = /(upfront|integration|connect.*website|right hand drive|\brhd\b|mombasa|dar es salaam|inspection|\bcif\b|\bfob\b|commercial vehicles|quantit|\bunits?\b|shipping)/iu;
const declinedPattern = /(not interested|do not.*import|not consider|no longer interested|remove me|do not contact|unsubscribe)/iu;

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function addresses(value: string) {
  return [...value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu)].map((match) => match[0].toLowerCase());
}

function decode(data = "") {
  try {
    const normalized = data.replace(/-/gu, "+").replace(/_/gu, "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch { return ""; }
}

function extractBody(part?: GmailPart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data);
  const plain = part.parts?.find((item) => item.mimeType === "text/plain");
  if (plain) return extractBody(plain);
  return (part.parts || []).map(extractBody).filter(Boolean).join("\n").slice(0, 50_000);
}

function attachmentMetadata(part?: GmailPart): Array<Record<string, unknown>> {
  if (!part) return [];
  const own = part.filename ? [{ filename: part.filename, mime_type: part.mimeType || "application/octet-stream", size: part.body?.size || 0, gmail_attachment_id: part.body?.attachmentId || null }] : [];
  return own.concat((part.parts || []).flatMap(attachmentMetadata));
}

function senderName(from: string) {
  return from.replace(/<[^>]+>/gu, "").replace(/^['"]|['"]$/gu, "").trim() || "Gmail contact";
}

async function accessToken() {
  if (!gmailClientId || !gmailClientSecret || !gmailRefreshToken) throw new Error("Gmail OAuth secrets are not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: gmailClientId, client_secret: gmailClientSecret, refresh_token: gmailRefreshToken, grant_type: "refresh_token" }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error(`Gmail token refresh failed: ${body.error || response.status}`);
  return body.access_token as string;
}

async function gmailGet(token: string, path: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Gmail API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

async function listThreadIds(token: string, mode: string, maxThreads: number) {
  const ids: string[] = [];
  let pageToken = "";
  const { data: sync } = await db.from("gmail_sync_state").select("last_synced_at,last_history_id").eq("mailbox", mailbox).maybeSingle();
  if (mode === "incremental" && sync?.last_history_id) {
    try {
      let historyPage = "";
      while (ids.length < maxThreads) {
        const history = await gmailGet(token, `history?startHistoryId=${encodeURIComponent(sync.last_history_id)}&historyTypes=messageAdded&maxResults=100${historyPage ? `&pageToken=${encodeURIComponent(historyPage)}` : ""}`);
        ids.push(...(history.history || []).flatMap((entry: { messagesAdded?: Array<{ message?: { threadId?: string } }> }) => entry.messagesAdded || []).map((item: { message?: { threadId?: string } }) => item.message?.threadId).filter(Boolean));
        if (!history.nextPageToken) break;
        historyPage = history.nextPageToken;
      }
      return [...new Set(ids)].slice(0, maxThreads);
    } catch (error) { console.warn("Gmail history cursor unavailable; falling back to time-based incremental query", error); }
  }
  const after = mode === "incremental" && sync?.last_synced_at ? ` after:${Math.floor(new Date(sync.last_synced_at).getTime() / 1000)}` : " newer_than:10y";
  const q = encodeURIComponent(`${after} -from:(mailer-daemon) -subject:("Delivery Status Notification")`);
  while (ids.length < maxThreads) {
    const page = await gmailGet(token, `threads?maxResults=${Math.min(100, maxThreads - ids.length)}&q=${q}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
    ids.push(...(page.threads || []).map((thread: { id: string }) => thread.id));
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return ids.slice(0, maxThreads);
}

async function existingCustomer(email: string) {
  const { data } = await db.from("customers").select("id,status").ilike("email", email).maybeSingle();
  return data as { id: string; status: string } | null;
}

async function importThread(thread: { messages?: GmailMessage[] }, incremental: boolean) {
  const messages = thread.messages || [];
  const parsed = messages.map((message) => {
    const from = header(message, "From");
    const fromEmails = addresses(from);
    const body = extractBody(message.payload);
    const subject = header(message, "Subject");
    const inbound = !fromEmails.includes(mailbox);
    const automated = header(message, "Auto-Submitted");
    return { message, from, fromEmails, body, subject, inbound, combined: `${from}\n${subject}\n${automated}\n${body}`, automated };
  });
  if (parsed.some((item) => excludedPattern.test(item.combined) || (item.automated && item.automated.toLowerCase() !== "no"))) return { imported: false, reason: "excluded-system-message" };
  const inbound = parsed.filter((item) => item.inbound && item.fromEmails.length);
  const outbound = parsed.filter((item) => !item.inbound);
  if (!inbound.length) return { imported: false, reason: "no-customer-reply" };
  const customerEmail = inbound[0].fromEmails[0];
  const known = await existingCustomer(customerEmail);
  const explicitRequirement = inbound.some((item) => requirementPattern.test(item.combined));
  const realTwoWay = inbound.length > 0 && outbound.length > 0;
  if (!(realTwoWay || explicitRequirement || (incremental && known))) return { imported: false, reason: "not-qualified" };

  const declined = inbound.some((item) => declinedPattern.test(item.combined));
  const combinedInbound = inbound.map((item) => item.body).join("\n\n").slice(0, 20_000);
  let customerId = known?.id;
  if (!customerId) {
    const domain = customerEmail.split("@")[1] || "";
    const priority = declined ? "LOW" : realTwoWay && inbound.some((item) => strongIntentPattern.test(item.combined)) ? "HIGH" : "MEDIUM";
    const { data, error } = await db.from("customers").insert({
      contact_name: senderName(inbound[0].from), email: customerEmail,
      company: domain && !/(gmail|hotmail|outlook|yahoo)\./iu.test(domain) ? domain.split(".")[0].replace(/[-_]/gu, " ") : null,
      priority, suggested_priority: priority, status: declined ? "DECLINED" : "ACTIVE",
      requirements: combinedInbound, last_contact_at: new Date(Number(inbound.at(-1)?.message.internalDate || Date.now())).toISOString(),
      notes: "Imported from qualifying Gmail business correspondence. Review company/country details before outreach.",
    }).select("id").single();
    if (error) throw error;
    customerId = data.id;
  } else if (declined) {
    await db.from("customers").update({ status: "DECLINED", priority: "LOW", last_contact_at: new Date(Number(inbound.at(-1)?.message.internalDate || Date.now())).toISOString() }).eq("id", customerId);
  }

  let importedMessages = 0;
  for (const item of parsed) {
    const message = item.message;
    const record = {
      customer_id: customerId, gmail_message_id: message.id, gmail_thread_id: message.threadId,
      direction: item.inbound ? "INBOUND" : "OUTBOUND", from_address: item.from,
      to_addresses: addresses(header(message, "To")), cc_addresses: addresses(header(message, "Cc")),
      subject: item.subject, body_text: item.body.slice(0, 50_000), attachment_metadata: attachmentMetadata(message.payload),
      sent_at: new Date(Number(message.internalDate || Date.now())).toISOString(),
    };
    const { error } = await db.from("customer_email_messages").upsert(record, { onConflict: "gmail_message_id", ignoreDuplicates: true });
    if (error) throw error;
    importedMessages += 1;
  }
  return { imported: true, customerId, importedMessages, declined };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const authorization = request.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user?.email) return json(request, { error: "Authentication required" }, 401);
    const { data: allowed } = await db.from("admin_allowlist").select("email").eq("email", userData.user.email.toLowerCase()).eq("enabled", true).maybeSingle();
    if (!allowed) return json(request, { error: "Administrator access required" }, 403);

    const input = await request.json().catch(() => ({}));
    const mode = input.mode === "incremental" ? "incremental" : "historical";
    const maxThreads = Math.max(1, Math.min(mode === "historical" ? 500 : 100, Number(input.max_threads) || (mode === "historical" ? 200 : 50)));
    const token = await accessToken();
    const threadIds = await listThreadIds(token, mode, maxThreads);
    const result = { mode, scanned: threadIds.length, importedThreads: 0, importedMessages: 0, excluded: 0, errors: 0 };
    for (const id of threadIds) {
      try {
        const thread = await gmailGet(token, `threads/${id}?format=full`);
        const imported = await importThread(thread, mode === "incremental");
        if (imported.imported) {
          result.importedThreads += 1;
          result.importedMessages += imported.importedMessages || 0;
        } else result.excluded += 1;
      } catch (error) {
        result.errors += 1;
        console.error("gmail thread import", id, error);
      }
    }
    const profile = await gmailGet(token, "profile");
    await db.from("gmail_sync_state").upsert({ mailbox, last_history_id: profile.historyId || null, last_synced_at: new Date().toISOString(), last_result: result });
    return json(request, result);
  } catch (error) {
    console.error("gmail-sync", error);
    return json(request, { error: error instanceof Error ? error.message : "Gmail sync failed" }, 500);
  }
});

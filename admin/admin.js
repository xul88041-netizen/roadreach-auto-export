import { calculateVehiclePricing } from "../assets/pricing.js";

const config = window.ROADREACH_CONFIG || {};
const db = config.supabaseUrl && config.supabasePublishableKey && window.supabase
  ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey) : null;
const page = document.querySelector("#page");
const esc = (value) => String(value ?? "").replace(/[&<>'"]/gu, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const money = (value, currency = "USD") => value == null ? "—" : `${currency} ${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const badge = (value) => `<span class="badge ${String(value).toLowerCase()}">${esc(String(value).replaceAll("_", " "))}</span>`;
let currentView = "dashboard";
let currentVehicleImages = [];
let currentUser = null;
const authCallbackType = new URLSearchParams(window.location.hash.slice(1)).get("type");
let invitePasswordRequired = authCallbackType === "invite" || authCallbackType === "recovery";

function message(node, text, error = false) { node.textContent = text; node.classList.toggle("error", error); }
function pageHead(title, subtitle, action = "") { return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}</div>`; }
function table(headers, rows) { return `<div class="panel"><div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="empty">No records yet.</td></tr>`}</tbody></table></div></div>`; }
async function query(tableName, columns = "*", options = {}) {
  let request = db.from(tableName).select(columns);
  if (options.order) request = request.order(options.order, { ascending: options.ascending ?? false });
  if (options.eq) for (const [key, value] of Object.entries(options.eq)) request = request.eq(key, value);
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

async function verifyAdmin(session) {
  if (!session?.user?.email) return false;
  const { data, error } = await db.rpc("is_admin");
  return !error && data === true;
}

async function enterApp(session) {
  if (!(await verifyAdmin(session))) { await db.auth.signOut(); message(document.querySelector("#loginMessage"), "This account is not on the administrator allowlist.", true); return; }
  currentUser = session.user;
  document.querySelector("#loginScreen").hidden = true;
  document.querySelector("#adminApp").hidden = false;
  await renderView(currentView);
}

function showInvitePasswordSetup(session) {
  if (!session?.user) return;
  document.querySelector("#loginForm").hidden = true;
  document.querySelector("#invitePasswordForm").hidden = false;
  message(document.querySelector("#invitePasswordMessage"), `Set a password for ${session.user.email}.`);
}

document.querySelector("#invitePasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const output = document.querySelector("#invitePasswordMessage");
  const form = new FormData(event.currentTarget);
  const password = String(form.get("password") || "");
  if (password !== String(form.get("confirmPassword") || "")) { message(output, "Passwords do not match.", true); return; }
  if (!db) { message(output, "Supabase is not configured in config.js.", true); return; }
  message(output, "Setting password…");
  const { error } = await db.auth.updateUser({ password });
  if (error) { message(output, error.message, true); return; }
  invitePasswordRequired = false;
  history.replaceState({}, document.title, window.location.pathname);
  const { data } = await db.auth.getSession();
  await enterApp(data.session);
});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const output = document.querySelector("#loginMessage"); message(output, "Signing in…");
  if (!db) { message(output, "Supabase is not configured in config.js.", true); return; }
  const form = new FormData(event.currentTarget);
  const { data, error } = await db.auth.signInWithPassword({ email: form.get("email"), password: form.get("password") });
  if (error) { message(output, error.message, true); return; }
  await enterApp(data.session);
});

async function signOut() { if (db) await db.auth.signOut(); location.reload(); }
document.querySelector("#signOut").addEventListener("click", signOut);
document.querySelector("#mobileSignOut").addEventListener("click", signOut);
document.querySelector("#menuToggle").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
document.querySelector("#adminNav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]"); if (!button) return;
  document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelector(".sidebar").classList.remove("open"); currentView = button.dataset.view; void renderView(currentView);
});

async function renderView(view) {
  page.innerHTML = '<div class="loading">Loading…</div>';
  try {
    if (view === "dashboard") await renderDashboard();
    else if (view === "vehicles") await renderVehicles();
    else if (view === "inquiries") await renderInquiries();
    else if (view === "customers") await renderCustomers();
    else if (view === "followups") await renderFollowups();
    else if (view === "quotes") await renderQuotes();
    else if (view === "deals") await renderDeals();
    else if (view === "email") await renderEmailSync();
    else renderSettings();
  } catch (error) { page.innerHTML = `<div class="panel empty">Unable to load this area: ${esc(error.message)}</div>`; }
}

async function renderDashboard() {
  const [inquiries, customers, followups, vehicles] = await Promise.all([query("inquiries", "id,status,submitted_at,name,company"), query("customers", "id,priority,status"), query("followups", "id,due_at,status,priority,note,customers(contact_name,company)"), query("vehicles", "id,publication_status")]);
  const now = new Date(), end = new Date(); end.setHours(23,59,59,999);
  const open = followups.filter((f) => f.status === "OPEN"), overdue = open.filter((f) => new Date(f.due_at) < now), today = open.filter((f) => new Date(f.due_at) >= now && new Date(f.due_at) <= end);
  const high = customers.filter((c) => c.priority === "HIGH" && !["DECLINED","INACTIVE"].includes(c.status));
  const newInquiries = inquiries.filter((i) => i.status === "NEW").sort((a,b) => new Date(b.submitted_at)-new Date(a.submitted_at)), recent = newInquiries.slice(0,6);
  page.innerHTML = pageHead("Dashboard", "RoadReach sales and operations overview") + `<div class="metrics"><div class="metric"><small>Today's follow-ups</small><b>${today.length}</b></div><div class="metric alert"><small>Overdue</small><b>${overdue.length}</b></div><div class="metric"><small>High priority</small><b>${high.length}</b></div><div class="metric"><small>New inquiries</small><b>${newInquiries.length}</b></div></div><div class="split-panels"><div class="panel"><div class="panel-head"><h2>Due follow-ups</h2></div>${tableBody(open.sort((a,b)=>new Date(a.due_at)-new Date(b.due_at)).slice(0,8).map((f)=>`<tr><td class="row-title"><b>${esc(f.customers?.company || f.customers?.contact_name)}</b><small>${esc(f.note || "Follow up")}</small></td><td>${new Date(f.due_at).toLocaleString()}</td><td>${badge(new Date(f.due_at)<now?"OVERDUE":f.priority)}</td></tr>`).join(""),3)}</div><div class="panel"><div class="panel-head"><h2>New inquiries</h2></div>${tableBody(recent.map((i)=>`<tr><td class="row-title"><b>${esc(i.company || i.name)}</b><small>${new Date(i.submitted_at).toLocaleString()}</small></td><td>${badge(i.status)}</td></tr>`).join(""),2)}</div></div>`;
}
function tableBody(rows, columns) { return `<div class="table-wrap"><table><tbody>${rows || `<tr><td colspan="${columns}" class="empty">Nothing due.</td></tr>`}</tbody></table></div>`; }

async function renderVehicles() {
  const rows = await query("vehicles", "id,stock_id,brand,model,year,sourcing_status,publication_status,public_reference_fob_price_usd,masked_vin,featured,updated_at", { order:"updated_at" });
  page.innerHTML = pageHead("Vehicles", "Draft, publish, sell and archive independently from sourcing status", '<button class="primary" data-action="add-vehicle">+ Add vehicle</button>') + table(["Vehicle","Supply","Publication","Reference FOB","Public VIN","Actions"], rows.map((v)=>`<tr><td class="row-title"><b>${esc(v.stock_id)} · ${esc(v.brand)} ${esc(v.model)}</b><small>${esc(v.year)}${v.featured?" · Featured":""}</small></td><td>${badge(v.sourcing_status)}</td><td>${badge(v.publication_status)}</td><td>${esc(money(v.public_reference_fob_price_usd))}</td><td>${esc(v.masked_vin || "Not public")}</td><td class="actions"><button data-action="edit-vehicle" data-id="${v.id}">Edit</button>${v.publication_status !== "PUBLISHED" ? `<button data-action="vehicle-status" data-status="PUBLISHED" data-id="${v.id}">Publish</button>`:""}${v.publication_status !== "SOLD" ? `<button data-action="vehicle-status" data-status="SOLD" data-id="${v.id}">Sold</button>`:""}${v.publication_status !== "ARCHIVED" ? `<button data-action="vehicle-status" data-status="ARCHIVED" data-id="${v.id}">Archive</button>`:""}</td></tr>`).join(""));
}

async function renderInquiries() {
  const rows = await query("inquiries", "*,customers(contact_name,company)", { order:"submitted_at" });
  page.innerHTML = pageHead("Inquiries", "Public requests saved to the CRM; VIN requests require private review") + table(["Submitted","Customer","Requirement","Contact","Flags","Actions"], rows.map((i)=>`<tr><td>${new Date(i.submitted_at).toLocaleString()}</td><td class="row-title"><b>${esc(i.company || i.name)}</b><small>${esc([i.country,i.city].filter(Boolean).join(", "))}</small></td><td class="row-title"><b>${esc(i.preferred_model || i.stock_id || "General inquiry")}</b><small>${esc(i.message || "")}</small></td><td>${esc(i.email || i.whatsapp_or_phone)}</td><td>${badge(i.status)} ${i.request_full_vin?'<span class="badge high">VIN REQUESTED</span>':""}</td><td class="actions">${i.status==="NEW"?`<button data-action="review-inquiry" data-id="${i.id}">Mark reviewed</button>`:""}<button data-action="open-customer" data-id="${i.customer_id}">Customer</button></td></tr>`).join(""));
}

function duplicateKeys(customer) {
  const keys=[]; if(customer.company)keys.push(`c:${customer.company.toLowerCase().replace(/\W/gu,"")}`); if(customer.email?.includes("@"))keys.push(`d:${customer.email.split("@")[1].toLowerCase()}`); if(customer.whatsapp)keys.push(`w:${customer.whatsapp.replace(/\D/gu,"")}`); if(customer.phone)keys.push(`p:${customer.phone.replace(/\D/gu,"")}`); return keys.filter((key)=>key.length>3);
}
async function renderCustomers() {
  const rows = await query("customers", "*", { order:"updated_at" });
  const keyMap = new Map(); rows.forEach((c)=>duplicateKeys(c).forEach((key)=>keyMap.set(key,[...(keyMap.get(key)||[]),c.id])));
  const dupes = new Map(rows.map((c)=>[c.id,[...new Set(duplicateKeys(c).flatMap((key)=>keyMap.get(key)||[]))].filter((id)=>id!==c.id && !String(c.notes||"").includes(`KEEP_SEPARATE:${id}`))]));
  page.innerHTML = pageHead("Customers", "Email is the exact identity key; similar companies are only flagged for review", '<button class="primary" data-action="add-customer">+ Add customer</button>') + table(["Customer","Market","Priority","Status","Follow-up","Duplicate review","Actions"], rows.map((c)=>`<tr><td class="row-title"><b>${esc(c.company || c.contact_name)}</b><small>${esc(c.contact_name)} · ${esc(c.email || c.whatsapp || "No email")}</small></td><td>${esc([c.country,c.city].filter(Boolean).join(", ") || "—")}</td><td>${badge(c.priority)}<small> Suggested: ${esc(c.suggested_priority)}</small></td><td>${badge(c.status)}</td><td>${c.next_followup_at?new Date(c.next_followup_at).toLocaleString():"—"}</td><td>${dupes.get(c.id).length?`<span class="badge medium">Potential duplicate</span>`:"—"}</td><td class="actions"><button data-action="edit-customer" data-id="${c.id}">Edit</button>${dupes.get(c.id).length?`<button data-action="merge-customer" data-id="${c.id}" data-other="${dupes.get(c.id)[0]}">Merge</button><button data-action="keep-customer" data-id="${c.id}" data-other="${dupes.get(c.id)[0]}">Keep separate</button>`:""}</td></tr>`).join(""));
}

async function renderFollowups() {
  const rows = await query("followups", "*,customers(contact_name,company)", { order:"due_at", ascending:true });
  page.innerHTML = pageHead("Follow-ups", "Default suggestions: high 1 day, incomplete 3 days, vague 7 days", '<button class="primary" data-action="add-followup">+ Add follow-up</button>') + table(["Due","Customer","Priority","Status","Note","Actions"], rows.map((f)=>`<tr><td>${new Date(f.due_at).toLocaleString()}</td><td>${esc(f.customers?.company || f.customers?.contact_name)}</td><td>${badge(f.priority)}</td><td>${badge(f.status)}</td><td>${esc(f.note||"")}</td><td class="actions">${f.status==="OPEN"?`<button data-action="complete-followup" data-id="${f.id}">Complete</button>`:""}</td></tr>`).join(""));
}

async function renderQuotes() {
  const rows = await query("quotes", "*,customers(contact_name,company),vehicles(stock_id,brand,model)", { order:"created_at" });
  page.innerHTML = pageHead("Quotes", "References only; no automatic price, freight, timing or condition commitments", '<button class="primary" data-action="add-quote">+ Add quote</button>') + table(["Customer","Vehicle","Reference FOB","Quantity","Destination","Valid until","Status"], rows.map((q)=>`<tr><td>${esc(q.customers?.company||q.customers?.contact_name)}</td><td>${esc(q.vehicles?`${q.vehicles.stock_id} · ${q.vehicles.brand} ${q.vehicles.model}`:"General")}</td><td>${esc(money(q.reference_fob_usd,q.currency))}</td><td>${q.quantity}</td><td>${esc(q.destination_port||"—")}</td><td>${esc(q.valid_until||"—")}</td><td>${badge(q.status)}</td></tr>`).join(""));
}

async function renderDeals() {
  const rows = await query("deals", "*,customers(contact_name,company)", { order:"deal_date" });
  page.innerHTML = pageHead("Deals", "Actual cost and profit records remain private to the administrator", '<button class="primary" data-action="add-deal">+ Add deal</button>') + table(["Date","Customer","Market","Vehicle","Quantity","Deal price","Actual profit","Margin"], rows.map((d)=>`<tr><td>${esc(d.deal_date)}</td><td>${esc(d.customers?.company||d.customers?.contact_name)}</td><td>${esc([d.country,d.city].filter(Boolean).join(", "))}</td><td>${esc(`${d.year||""} ${d.model}`)}</td><td>${d.quantity}</td><td>${esc(money(d.actual_deal_price))}</td><td>${esc(money(d.actual_profit,"RMB"))}</td><td>${d.actual_margin==null?"—":`${(Number(d.actual_margin)*100).toFixed(1)}%`}</td></tr>`).join(""));
}

async function renderEmailSync() {
  const state = await query("gmail_sync_state", "*", { order:"updated_at" });
  page.innerHTML = pageHead("Email Sync", "Gmail readonly import; never modifies, labels, moves or deletes email") + `<div class="panel sync-card"><h2>Gmail historical import</h2><p>Imports only real two-way business threads, explicit purchase/cooperation requirements, and explicit declines. Bounce, delivery status, auto-reply, social platform, Google notification, newsletter, one-way outreach and ordinary ticket receipt messages are excluded.</p><div class="sync-actions"><button class="primary" data-action="gmail-sync" data-mode="historical">Run historical import</button><button class="secondary" data-action="gmail-sync" data-mode="incremental">Run incremental sync</button></div><output class="form-message" id="syncMessage"></output></div><div class="panel"><div class="panel-head"><h2>Last sync</h2></div>${tableBody(state.map((s)=>`<tr><td>${esc(s.mailbox)}</td><td>${s.last_synced_at?new Date(s.last_synced_at).toLocaleString():"Never"}</td><td><pre>${esc(JSON.stringify(s.last_result,null,2))}</pre></td></tr>`).join(""),3)}</div>`;
}

function renderSettings() {
  page.innerHTML = pageHead("Settings", "Runtime and security status") + `<div class="panel sync-card"><ul class="settings-list"><li><b>Signed in:</b> ${esc(currentUser?.email)}</li><li><b>Authorization:</b> Supabase Auth + database administrator allowlist</li><li><b>Public data:</b> public_vehicle_catalog safe view only</li><li><b>Vehicle images:</b> public read; authenticated administrator upload/update/delete</li><li><b>Email notifications:</b> not configured by default; inquiries still save correctly</li><li><b>Secrets:</b> Dedicated Supabase and Gmail credentials are Edge Function secrets only</li></ul></div>`;
}

page.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]"); if (!button) return;
  const action = button.dataset.action, id = button.dataset.id;
  try {
    if (action === "add-vehicle") await openVehicle();
    else if (action === "edit-vehicle") await openVehicle(id);
    else if (action === "vehicle-status") { const { error } = await db.from("vehicles").update({ publication_status:button.dataset.status }).eq("id",id); if(error)throw error; await renderVehicles(); }
    else if (action === "review-inquiry") { const { error }=await db.from("inquiries").update({status:"REVIEWED"}).eq("id",id);if(error)throw error;await renderInquiries(); }
    else if (action === "open-customer" || action === "edit-customer") await openRecord("customer", id);
    else if (action === "add-customer") await openRecord("customer");
    else if (action === "add-followup") await openRecord("followup");
    else if (action === "complete-followup") { const {error}=await db.from("followups").update({status:"DONE",completed_at:new Date().toISOString()}).eq("id",id);if(error)throw error;await renderFollowups(); }
    else if (action === "add-quote") await openRecord("quote");
    else if (action === "add-deal") await openRecord("deal");
    else if (action === "merge-customer") { if(confirm("Merge the flagged customer into this customer? Email identities remain recorded separately.")){const {error}=await db.rpc("merge_customers",{p_primary_id:id,p_duplicate_id:button.dataset.other});if(error)throw error;await renderCustomers();} }
    else if (action === "keep-customer") { const other=button.dataset.other,pair=await query("customers","id,notes");for(const customer of pair.filter((c)=>c.id===id||c.id===other)){const counterpart=customer.id===id?other:id,notes=`${customer.notes||""}\nKEEP_SEPARATE:${counterpart} (${new Date().toISOString()})`.trim();const {error}=await db.from("customers").update({notes}).eq("id",customer.id);if(error)throw error;}await renderCustomers(); }
    else if (action === "gmail-sync") await runGmailSync(button.dataset.mode);
  } catch (error) { alert(error.message); }
});

const vehicleForm = document.querySelector("#vehicleForm");
const numericVehicleFields = ["year","mileage","public_reference_fob_price_usd","internal_vehicle_cost_rmb","exchange_rate","domestic_transport_cost_rmb","refurbishment_cost_rmb","export_document_cost_rmb","port_loading_cost_rmb","other_cost_rmb","target_profit_rmb"];
async function openVehicle(id) {
  vehicleForm.reset(); vehicleForm.elements.id.value = id || ""; document.querySelector("#vehicleDialogTitle").textContent = id ? "Edit vehicle" : "Add vehicle"; message(document.querySelector("#vehicleMessage"),"");
  currentVehicleImages = [];
  if (id) {
    const { data, error } = await db.from("vehicles").select("*").eq("id",id).single(); if(error)throw error;
    for (const [key,value] of Object.entries(data)) if(vehicleForm.elements[key]) { if(vehicleForm.elements[key].type==="checkbox")vehicleForm.elements[key].checked=Boolean(value);else vehicleForm.elements[key].value=value??""; }
    currentVehicleImages = await query("vehicle_images","*",{eq:{vehicle_id:id},order:"sort_order",ascending:true});
  } else { vehicleForm.elements.exchange_rate.value="7.2";vehicleForm.elements.target_profit_rmb.value="5000";["internal_vehicle_cost_rmb","domestic_transport_cost_rmb","refurbishment_cost_rmb","export_document_cost_rmb","port_loading_cost_rmb","other_cost_rmb"].forEach((field)=>vehicleForm.elements[field].value="0"); }
  document.querySelector("#imageEditor").hidden = !id; renderImages(); calculatePrice(); document.querySelector("#vehicleDialog").showModal();
}
function calculatePrice() {
  const values=Object.fromEntries(new FormData(vehicleForm).entries()), result=calculateVehiclePricing(values);
  document.querySelector("#calculation").innerHTML=[["Total cost RMB",money(result.totalCostRmb,"RMB")],["Suggested FOB USD",money(result.suggestedFobUsd)],["Expected profit RMB",money(result.expectedProfitRmb,"RMB")],["Expected margin",`${(result.expectedMargin*100).toFixed(1)}%`]].map(([label,value])=>`<div><small>${label}</small><b>${value}</b></div>`).join("");
}
vehicleForm.addEventListener("input",calculatePrice);
vehicleForm.addEventListener("submit", async (event) => {
  event.preventDefault(); if(event.submitter?.value==="cancel"){document.querySelector("#vehicleDialog").close();return;} const output=document.querySelector("#vehicleMessage");message(output,"Saving…");
  const raw=Object.fromEntries(new FormData(vehicleForm).entries()), id=raw.id;delete raw.id;raw.featured=vehicleForm.elements.featured.checked;
  numericVehicleFields.forEach((field)=>{raw[field]=raw[field]===""?null:Number(raw[field]);});
  try { const request=id?db.from("vehicles").update(raw).eq("id",id).select("id").single():db.from("vehicles").insert(raw).select("id").single();const {data,error}=await request;if(error)throw error;if(!id){vehicleForm.elements.id.value=data.id;document.querySelector("#imageEditor").hidden=false;}message(output,"Vehicle saved.");setTimeout(()=>{document.querySelector("#vehicleDialog").close();void renderVehicles();},350); } catch(error){message(output,error.message,true);}
});

function renderImages() {
  document.querySelector("#imageList").innerHTML=currentVehicleImages.map((image,index)=>`<article class="image-item" draggable="true" data-image-id="${image.id}"><img src="${esc(image.public_url)}" alt="Vehicle image ${index+1}"><div class="image-controls"><button type="button" data-image-action="up" ${index===0?"disabled":""}>↑</button><button type="button" data-image-action="down" ${index===currentVehicleImages.length-1?"disabled":""}>↓</button><button type="button" data-image-action="delete">Delete</button></div></article>`).join("");
}
async function persistImageOrder() { const vehicleId=vehicleForm.elements.id.value;const {error}=await db.rpc("reorder_vehicle_images",{p_vehicle_id:vehicleId,p_image_ids:currentVehicleImages.map((item)=>item.id)});if(error)throw error;renderImages(); }
document.querySelector("#imageList").addEventListener("click",async(event)=>{const button=event.target.closest("[data-image-action]");if(!button)return;const item=button.closest("[data-image-id]"),index=currentVehicleImages.findIndex((img)=>img.id===item.dataset.imageId),action=button.dataset.imageAction;try{if(action==="delete"){const image=currentVehicleImages[index];const {error:storageError}=await db.storage.from("vehicle-images").remove([image.storage_path]);if(storageError)throw storageError;const {error}=await db.from("vehicle_images").delete().eq("id",image.id);if(error)throw error;currentVehicleImages.splice(index,1);await persistImageOrder();}else{const target=action==="up"?index-1:index+1;[currentVehicleImages[index],currentVehicleImages[target]]=[currentVehicleImages[target],currentVehicleImages[index]];await persistImageOrder();}}catch(error){message(document.querySelector("#vehicleMessage"),error.message,true);}});
let draggedImageId="";document.querySelector("#imageList").addEventListener("dragstart",(event)=>{const item=event.target.closest("[data-image-id]");if(item){draggedImageId=item.dataset.imageId;item.classList.add("dragging");}});document.querySelector("#imageList").addEventListener("dragend",(event)=>event.target.closest("[data-image-id]")?.classList.remove("dragging"));document.querySelector("#imageList").addEventListener("dragover",(event)=>event.preventDefault());document.querySelector("#imageList").addEventListener("drop",async(event)=>{event.preventDefault();const target=event.target.closest("[data-image-id]");if(!target||target.dataset.imageId===draggedImageId)return;const from=currentVehicleImages.findIndex((i)=>i.id===draggedImageId),to=currentVehicleImages.findIndex((i)=>i.id===target.dataset.imageId),[moved]=currentVehicleImages.splice(from,1);currentVehicleImages.splice(to,0,moved);await persistImageOrder();});
document.querySelector("#imageUpload").addEventListener("change",async(event)=>{const output=document.querySelector("#vehicleMessage"),files=[...event.target.files],vehicleId=vehicleForm.elements.id.value;if(!vehicleId)return;if(files.length+currentVehicleImages.length>15){message(output,"Maximum 15 images per vehicle.",true);return;}for(const file of files){if(file.size>10*1024*1024||!/^image\/(jpeg|png|webp|avif)$/u.test(file.type)){message(output,`${file.name}: unsupported type or over 10 MB.`,true);continue;}const safe=file.name.toLowerCase().replace(/[^a-z0-9._-]/gu,"-");const path=`${vehicleId}/${crypto.randomUUID()}-${safe}`;const {error:uploadError}=await db.storage.from("vehicle-images").upload(path,file,{cacheControl:"3600",upsert:false});if(uploadError){message(output,uploadError.message,true);continue;}const {data:urlData}=db.storage.from("vehicle-images").getPublicUrl(path);const {data,error}=await db.from("vehicle_images").insert({vehicle_id:vehicleId,storage_path:path,public_url:urlData.publicUrl,alt_text_en:`${vehicleForm.elements.brand.value} ${vehicleForm.elements.model.value}`,sort_order:currentVehicleImages.length}).select("*").single();if(error){await db.storage.from("vehicle-images").remove([path]);message(output,error.message,true);continue;}currentVehicleImages.push(data);renderImages();}event.target.value="";});

const recordDefinitions={
  customer:{table:"customers",title:"Customer",fields:[['company','Company'],['contact_name','Contact name','required'],['email','Email','email'],['backup_email','Backup email','email'],['country','Country'],['city','City'],['customer_type','Customer type','select:DEALER|IMPORTER|FLEET|PERSONAL_BUYER|OTHER'],['whatsapp','WhatsApp'],['phone','Phone'],['priority','Priority','select:HIGH|MEDIUM|LOW'],['status','Status','select:NEW|ACTIVE|QUALIFIED|DECLINED|INACTIVE|WON'],['requirements','Requirements','textarea'],['budget','Budget','number'],['quantity','Quantity','number'],['destination_port','Destination port'],['purchase_timing','Purchase timing'],['next_followup_at','Next follow-up','datetime-local'],['notes','Notes','textarea']]},
  followup:{table:"followups",title:"Follow-up",fields:[['customer_id','Customer','customers'],['due_at','Due','datetime-local'],['priority','Priority','select:HIGH|MEDIUM|LOW'],['note','Note','textarea']]},
  quote:{table:"quotes",title:"Quote",fields:[['customer_id','Customer','customers'],['vehicle_id','Vehicle','vehicles'],['reference_fob_usd','Reference FOB USD','number'],['currency','Currency'],['quantity','Quantity','number'],['destination_port','Destination port'],['shipping_note','Shipping note','textarea'],['valid_until','Valid until','date'],['status','Status','select:DRAFT|SENT|ACCEPTED|DECLINED|EXPIRED'],['notes','Notes','textarea']]},
  deal:{table:"deals",title:"Deal",fields:[['customer_id','Customer','customers'],['vehicle_id','Vehicle','vehicles'],['country','Country'],['city','City'],['destination_port','Destination port'],['model','Model','required'],['year','Year','number'],['fuel_type','Fuel type'],['quantity','Quantity','number'],['expected_public_price','Expected public price','number'],['actual_deal_price','Actual deal price','number'],['expected_vehicle_cost','Expected vehicle cost RMB','number'],['actual_vehicle_cost','Actual vehicle cost RMB','number'],['expected_other_cost','Expected other cost RMB','number'],['actual_other_cost','Actual other cost RMB','number'],['actual_total_cost','Actual total cost RMB','number'],['expected_profit','Expected profit RMB','number'],['actual_profit','Actual profit RMB','number'],['expected_margin','Expected margin decimal','number'],['actual_margin','Actual margin decimal','number'],['deal_date','Deal date','date'],['notes','Notes','textarea']]}
};
async function fieldHtml([name,label,type="text"],value="") { if(type==="customers"){const rows=await query("customers","id,company,contact_name",{order:"company",ascending:true});return `<label>${label}<select name="${name}" required><option value="">Select…</option>${rows.map((r)=>`<option value="${r.id}" ${value===r.id?"selected":""}>${esc(r.company||r.contact_name)}</option>`).join("")}</select></label>`;}if(type==="vehicles"){const rows=await query("vehicles","id,stock_id,brand,model",{order:"stock_id",ascending:true});return `<label>${label}<select name="${name}"><option value="">General / none</option>${rows.map((r)=>`<option value="${r.id}" ${value===r.id?"selected":""}>${esc(`${r.stock_id} · ${r.brand} ${r.model}`)}</option>`).join("")}</select></label>`;}if(type.startsWith("select:")){return `<label>${label}<select name="${name}">${type.slice(7).split("|").map((v)=>`<option ${value===v?"selected":""}>${v}</option>`).join("")}</select></label>`;}if(type==="textarea")return `<label class="wide">${label}<textarea name="${name}" rows="3">${esc(value)}</textarea></label>`;const required=type==="required"?"required":"",inputType=type==="required"?"text":type;let shown=value??"";if(inputType==="datetime-local"&&shown)shown=new Date(shown).toISOString().slice(0,16);return `<label>${label}<input name="${name}" type="${inputType}" value="${esc(shown)}" ${required} ${inputType==="number"?'step="any"':""}></label>`;}
async function openRecord(type,id) {const def=recordDefinitions[type];let record={};if(id){const {data,error}=await db.from(def.table).select("*").eq("id",id).single();if(error)throw error;record=data;}document.querySelector("#recordTitle").textContent=`${id?"Edit":"Add"} ${def.title}`;document.querySelector("#recordForm").dataset.type=type;document.querySelector("#recordForm").dataset.id=id||"";document.querySelector("#recordFields").innerHTML=(await Promise.all(def.fields.map((field)=>fieldHtml(field,record[field[0]])))).join("");message(document.querySelector("#recordMessage"),"");document.querySelector("#recordDialog").showModal();}
document.querySelector("#recordForm").addEventListener("submit",async(event)=>{event.preventDefault();if(event.submitter?.value==="cancel"){document.querySelector("#recordDialog").close();return;}const form=event.currentTarget,def=recordDefinitions[form.dataset.type],raw=Object.fromEntries(new FormData(form).entries());for(const field of def.fields){if(field[2]==="number")raw[field[0]]=raw[field[0]]===""?null:Number(raw[field[0]]);if(["vehicle_id"].includes(field[0])&&raw[field[0]]==="")raw[field[0]]=null;if(field[2]==="datetime-local"&&raw[field[0]])raw[field[0]]=new Date(raw[field[0]]).toISOString();}try{const request=form.dataset.id?db.from(def.table).update(raw).eq("id",form.dataset.id):db.from(def.table).insert(raw);const{error}=await request;if(error)throw error;document.querySelector("#recordDialog").close();await renderView(currentView);}catch(error){message(document.querySelector("#recordMessage"),error.message,true);}});

async function runGmailSync(mode){const output=document.querySelector("#syncMessage");message(output,`Running ${mode} sync… This may take several minutes.`);const{data,error}=await db.functions.invoke("gmail-sync",{body:{mode,max_threads:mode==="historical"?200:50}});if(error||data?.error){message(output,data?.error||error.message,true);return;}message(output,`Scanned ${data.scanned}; imported ${data.importedThreads} threads / ${data.importedMessages} messages; excluded ${data.excluded}; errors ${data.errors}.`);setTimeout(()=>void renderEmailSync(),1200);}

if (db) {
  const resumeSession = async (session) => { if (!session) return; if (invitePasswordRequired) showInvitePasswordSetup(session); else await enterApp(session); };
  const { data } = await db.auth.getSession();
  await resumeSession(data.session);
  db.auth.onAuthStateChange((_event, session) => { void resumeSession(session); });
}
else message(document.querySelector("#loginMessage"), "Supabase runtime configuration is missing. See docs/DEPLOYMENT.md.", true);

const config = window.ROADREACH_CONFIG || {};
const client = config.supabaseUrl && config.supabasePublishableKey && window.supabase
  ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false } }) : null;
const fallbackImage = "assets/rr-0001-cover.svg";
const whatsAppNumber = "447845251241";
let vehicles = [];
let language = localStorage.getItem("roadreach-language") === "ru" ? "ru" : "en";

const ru = {
  topbar:"Экспорт подержанных автомобилей из Китая",navVehicles:"Автомобили",navProcess:"Как это работает",navAbout:"Почему мы",getQuote:"Запросить цену",heroEyebrow:"ПРОВЕРЕННЫЙ ПОИСК · ДОСТАВКА ПО МИРУ",heroTitle:"Надёжные автомобили.<br><em>Готовы к экспорту.</em>",heroLead:"Проверенные автомобили, прозрачные экспортные документы и расчёт доставки в ваш порт — от одной команды в Китае.",browseVehicles:"Смотреть автомобили",whatsapp:"Написать в WhatsApp ↗",inspection:"Отчёт о проверке",documents:"Экспортные документы",delivery:"Доставка в порт",quickQuote:"БЫСТРЫЙ ЗАПРОС",tellNeed:"Расскажите, что вам нужно.",matchingIntro:"Получите подходящие варианты и ориентировочную цену FOB/CIF.",name:"Ваше имя",country:"Страна",emailPhone:"Email или WhatsApp",preferredModel:"Желаемая модель",budget:"Бюджет (USD)",quantity:"Количество",sendRequest:"Отправить запрос",replyNote:"Оплата не требуется. Обычно отвечаем в течение рабочего дня.",exportMarkets:"РЫНКИ ЭКСПОРТА",showroom:"B2B КАТАЛОГ",availableVehicles:"Автомобили для экспорта",inventoryIntro:"Опубликованные автомобили и варианты под заказ имеют чёткие обозначения. Наличие и ориентировочная цена требуют финального подтверждения.",brand:"Марка",model:"Модель",year:"Год",fuel:"Топливо",steering:"Руль",body:"Кузов",stockStatus:"Статус",priceRange:"Диапазон цены",all:"Все",inStock:"В наличии",sourceStatus:"Доступно под заказ",customRange:"Свой диапазон",reset:"Сбросить",featured:"Рекомендуемые",loading:"Загрузка автомобилей…",cantFind:"Не нашли нужную модель?",sendRequirement:"Отправить запрос →",trackRecord:"НЕДАВНИЕ РЕЗУЛЬТАТЫ",recentSold:"Недавно продано",soldIntro:"Проданные автомобили показываются до 90 дней и не входят в доступный склад.",simpleProcess:"ПРОСТОЙ ПРОЦЕСС ЭКСПОРТА",portTitle:"От запроса до вашего порта",step1Title:"Отправьте запрос",step1Body:"Укажите модель, бюджет, количество и порт назначения.",step2Title:"Проверьте и выберите",step2Body:"Изучите фото, характеристики, состояние и полную котировку.",step3Title:"Документы и оплата",step3Body:"Подтвердите проформу и экспортные документы до отгрузки.",step4Title:"Отгрузка и отслеживание",step4Body:"Получите подтверждение погрузки и документы для таможни.",transparent:"Прозрачный поиск",evidence:"Доказательства до решения",buyers:"ДЛЯ МЕЖДУНАРОДНЫХ ПОКУПАТЕЛЕЙ",clarity:"Ясность до каждого обязательства.",startRequest:"НАЧНИТЕ ЗАПРОС",inquiryTitle:"Получите варианты и расчёт доставки.",inquiryBody:"Опишите вашу потребность. Мы ответим доступными вариантами и данными для сравнения.",company:"Компания",city:"Город",customerType:"Тип клиента",dealer:"Дилер",importer:"Импортёр",fleet:"Автопарк",personal:"Частный покупатель",other:"Другое",destination:"Порт назначения",phone:"WhatsApp / телефон",timing:"Срок покупки",requirements:"Другие требования",requestVin:"Запросить полный VIN (только после частной проверки; не отправляется автоматически)",sendInquiry:"Отправить запрос",contact:"Контакты",chatNow:"Написать",priceDisclaimer:"Итоговая котировка может меняться в зависимости от состояния/комплектации, количества, времени покупки и требований страны назначения."
};
const t = (key, fallback = key) => language === "ru" ? (ru[key] || fallback) : fallback;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/gu, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const safeUrl = (value) => { try { const url = new URL(String(value), location.href); return ["http:","https:"].includes(url.protocol) ? url.href : fallbackImage; } catch { return fallbackImage; } };
const formatPrice = (vehicle) => vehicle.public_reference_fob_price_usd == null ? (language === "ru" ? "Цена FOB по запросу" : "Reference FOB Price on request") : `${language === "ru" ? "FOB от" : "Reference FOB Price"} USD ${Number(vehicle.public_reference_fob_price_usd).toLocaleString("en-US")}`;
const statusLabel = (vehicle) => vehicle.publication_status === "SOLD" ? (language === "ru" ? "Продано" : "Sold") : vehicle.sourcing_status === "IN_STOCK" ? t("inStock", "In Stock") : t("sourceStatus", "Available to Source");

function applyTranslations() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.dataset.i18nEn ||= node.textContent; node.textContent = t(node.dataset.i18n, node.dataset.i18nEn); });
  document.querySelectorAll("[data-i18n-html]").forEach((node) => { node.dataset.i18nHtmlEn ||= node.innerHTML; node.innerHTML = t(node.dataset.i18nHtml, node.dataset.i18nHtmlEn); });
  document.querySelector("#languageToggle").innerHTML = language === "en" ? "EN / <b>RU</b>" : "<b>EN</b> / RU";
}

function card(vehicle) {
  const images = Array.isArray(vehicle.images) ? vehicle.images : [];
  const image = safeUrl(images[0]?.url || fallbackImage);
  const statusClass = vehicle.publication_status === "SOLD" ? "sold" : vehicle.sourcing_status === "AVAILABLE_TO_SOURCE" ? "source" : "";
  const vin = vehicle.sourcing_status === "IN_STOCK" && vehicle.masked_vin ? `<p class="vin-line">VIN: ${escapeHtml(vehicle.masked_vin)}</p>` : "";
  const cta = vehicle.publication_status === "SOLD" ? (language === "ru" ? "Найти похожий →" : "Find Similar Vehicle →") : (language === "ru" ? "Запросить цену →" : "Ask for Quote →");
  return `<article class="vehicle-card"><div class="vehicle-image"><img src="${escapeHtml(image)}" alt="${escapeHtml(`${vehicle.brand} ${vehicle.model}`)}"><span class="year-badge">${escapeHtml(vehicle.year)}</span><span class="vehicle-status ${statusClass}">${escapeHtml(statusLabel(vehicle))}</span></div><div class="vehicle-body"><p class="vehicle-type">${escapeHtml(vehicle.body_type)}<span class="stock-id">${escapeHtml(vehicle.stock_id)}</span>${vehicle.featured ? '<span class="featured-flag">FEATURED</span>' : ""}</p><h3>${escapeHtml(`${vehicle.brand} ${vehicle.model}`)}</h3><div class="specs"><span>${escapeHtml(vehicle.fuel_type)}</span><span>${escapeHtml(vehicle.steering)}</span>${vehicle.mileage == null ? "" : `<span>${Number(vehicle.mileage).toLocaleString("en-US")} km</span>`}</div>${vin}<div class="price-row"><b>${escapeHtml(formatPrice(vehicle))}</b><button class="detail-link" data-vehicle-id="${escapeHtml(vehicle.id)}">${cta}</button></div><small class="price-note">${escapeHtml(t("priceDisclaimer", "Final quotation may vary depending on vehicle condition/configuration, quantity, purchase timing and destination requirements."))}</small></div></article>`;
}

function bindVehicleButtons() {
  document.querySelectorAll("[data-vehicle-id]").forEach((button) => button.addEventListener("click", () => openVehicle(button.dataset.vehicleId)));
}

function bindVehicleImageFallbacks(scope = document) {
  scope.querySelectorAll(".vehicle-image img,.modal-gallery img").forEach((image) => image.addEventListener("error", () => {
    if (image.dataset.fallbackApplied) return;
    image.dataset.fallbackApplied = "true";
    image.alt = "";
    image.src = fallbackImage;
  }, { once: true }));
}

function populateFilters() {
  const form = document.querySelector("#inventoryFilters");
  for (const field of ["brand", "model", "year", "fuel_type", "body_type"]) {
    const select = form.elements[field];
    const values = [...new Set(vehicles.filter((v) => v.publication_status !== "SOLD").map((v) => String(v[field] ?? "")).filter(Boolean))].sort((a, b) => field === "year" ? Number(b) - Number(a) : a.localeCompare(b));
    select.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
    values.forEach((value) => select.add(new Option(value, value)));
  }
}

function renderInventory() {
  const form = document.querySelector("#inventoryFilters");
  const data = new FormData(form);
  const available = vehicles.filter((vehicle) => {
    if (vehicle.publication_status === "SOLD") return false;
    for (const field of ["brand", "model", "year", "fuel_type", "steering", "body_type", "sourcing_status"]) if (data.get(field) && String(vehicle[field]) !== data.get(field)) return false;
    const price = Number(vehicle.public_reference_fob_price_usd || 0);
    const range = String(data.get("price") || "");
    if (range === "custom") {
      const min = Number(data.get("min_price") || 0), max = Number(data.get("max_price") || Infinity);
      if (price < min || price > max) return false;
    } else if (range) {
      const [min, max] = range.split("-").map(Number);
      if (price < min || price >= max) return false;
    }
    return true;
  });
  const grid = document.querySelector("#vehicleGrid");
  grid.innerHTML = available.length ? available.map(card).join("") : `<div class="stock-message">${language === "ru" ? "Нет автомобилей по выбранным фильтрам." : "No available vehicles match these filters."}</div>`;
  const featured = available.filter((vehicle) => vehicle.featured);
  document.querySelector("#featuredBlock").hidden = !featured.length;
  document.querySelector("#featuredGrid").innerHTML = featured.map(card).join("");
  const sold = vehicles.filter((vehicle) => vehicle.publication_status === "SOLD");
  document.querySelector("#recentlySold").hidden = !sold.length;
  document.querySelector("#soldGrid").innerHTML = sold.map(card).join("");
  bindVehicleButtons();
  bindVehicleImageFallbacks();
}

function openVehicle(id) {
  const vehicle = vehicles.find((item) => item.id === id);
  if (!vehicle) return;
  const images = (Array.isArray(vehicle.images) && vehicle.images.length ? vehicle.images : [{ url: fallbackImage }]).slice(0, 15);
  const notes = language === "ru" && vehicle.vehicle_notes_ru ? vehicle.vehicle_notes_ru : vehicle.vehicle_notes_en;
  const details = [[t("year","Year"),vehicle.year],[t("fuel","Fuel type"),vehicle.fuel_type],[t("steering","Steering"),vehicle.steering],[t("body","Body type"),vehicle.body_type],[language === "ru"?"Пробег":"Mileage",vehicle.mileage == null ? "—" : `${Number(vehicle.mileage).toLocaleString("en-US")} km`],[language === "ru"?"Цвет":"Exterior",vehicle.exterior_color],["Stock ID",vehicle.stock_id],["VIN",vehicle.sourcing_status === "IN_STOCK" ? vehicle.masked_vin : null]].filter(([,value]) => value);
  document.querySelector("#modalContent").innerHTML = `<div class="modal-gallery">${images.map((image, index) => `<img src="${escapeHtml(safeUrl(image.url))}" alt="${escapeHtml(`${vehicle.brand} ${vehicle.model} photo ${index + 1}`)}">`).join("")}</div><div class="modal-info"><p class="vehicle-type">${escapeHtml(vehicle.body_type)}<span class="stock-id">${escapeHtml(vehicle.stock_id)}</span><span class="featured-flag">${escapeHtml(statusLabel(vehicle))}</span></p><h2>${escapeHtml(`${vehicle.brand} ${vehicle.model}`)}</h2>${notes ? `<p>${escapeHtml(notes)}</p>` : ""}<div class="modal-specs">${details.map(([label,value]) => `<div><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join("")}</div>${vehicle.condition ? `<div class="condition-box"><b>${language === "ru" ? "Состояние" : "Condition statement"}</b><br>${escapeHtml(vehicle.condition)}</div>` : ""}<p class="price-note">${escapeHtml(t("priceDisclaimer", "Final quotation may vary depending on vehicle condition/configuration, quantity, purchase timing and destination requirements."))}</p><div class="modal-actions"><strong>${escapeHtml(formatPrice(vehicle))}</strong><button class="button" type="button" id="modalInquiryButton">${vehicle.publication_status === "SOLD" ? (language === "ru" ? "Найти похожий →" : "Find Similar Vehicle →") : (language === "ru" ? "Запросить цену →" : "Ask for Quote →")}</button></div></div>`;
  bindVehicleImageFallbacks(document.querySelector("#modalContent"));
  document.querySelector("#modalInquiryButton").addEventListener("click", () => startInquiry(vehicle));
  document.querySelector("#vehicleModal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function startInquiry(vehicle) {
  closeModal();
  const form = document.querySelector("#inquiryForm");
  form.elements.vehicle_id.value = vehicle.publication_status === "SOLD" ? "" : vehicle.id;
  form.elements.stock_id.value = vehicle.stock_id;
  form.elements.preferred_model.value = `${vehicle.brand} ${vehicle.model}`;
  form.elements.message.value = vehicle.publication_status === "SOLD" ? `Please find a similar vehicle to sold stock ${vehicle.stock_id}.` : `Please send the FOB/CIF quotation and full details for stock ${vehicle.stock_id}.`;
  document.querySelector("#inquiry").scrollIntoView({ behavior: "smooth" });
}
function closeModal() { document.querySelector("#vehicleModal").classList.remove("open"); document.body.style.overflow = ""; }

async function loadInventory() {
  if (!client) { document.querySelector("#vehicleGrid").innerHTML = '<div class="stock-message">Inventory is not configured yet. Please contact RoadReach directly.</div>'; return; }
  const { data, error } = await client.from("public_vehicle_catalog").select("*").order("featured", { ascending: false }).order("published_at", { ascending: false });
  if (error) { console.error(error); document.querySelector("#vehicleGrid").innerHTML = '<div class="stock-message">Current inventory could not be loaded. Please try again later.</div>'; return; }
  vehicles = data || [];
  populateFilters();
  renderInventory();
}

async function submitInquiry(form) {
  const status = form.querySelector(".form-status"), button = form.querySelector('button[type="submit"]');
  status.classList.remove("error"); status.textContent = "";
  if (!client) { status.classList.add("error"); status.textContent = "The inquiry service is not configured. Please use WhatsApp or email."; return; }
  const data = new FormData(form), compact = form.dataset.compact === "true";
  const contact = String(data.get("contact") || "").trim();
  const payload = Object.fromEntries(data.entries());
  if (compact) { payload.email = contact.includes("@") ? contact : ""; payload.whatsapp_or_phone = contact.includes("@") ? "" : contact; payload.customer_type = "OTHER"; }
  payload.request_full_vin = data.get("request_full_vin") === "on";
  payload.language = language;
  payload.source_page = `${location.pathname}${location.hash}`.slice(0, 500);
  payload.website = String(data.get("website") || "");
  button.disabled = true;
  try {
    const { data: result, error } = await client.functions.invoke("submit-inquiry", { body: payload });
    if (error || !result?.accepted) throw new Error(result?.error || error?.message || "Submission failed");
    form.reset();
    status.textContent = language === "ru" ? "Спасибо. Запрос сохранён, и команда RoadReach свяжется с вами." : "Thank you. Your inquiry was saved and the RoadReach team will follow up.";
  } catch (error) { status.classList.add("error"); status.textContent = error.message || "Your inquiry could not be saved. Please try again."; }
  finally { button.disabled = false; }
}

document.querySelectorAll(".wa").forEach((link) => { link.href = `https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(link.dataset.message)}`; link.target = "_blank"; link.rel = "noopener"; });
document.querySelector("#languageToggle").addEventListener("click", () => { language = language === "en" ? "ru" : "en"; localStorage.setItem("roadreach-language", language); applyTranslations(); renderInventory(); });
document.querySelector("#inventoryFilters").addEventListener("input", (event) => { document.querySelector("#customPrice").hidden = event.currentTarget.elements.price.value !== "custom"; renderInventory(); });
document.querySelector("#inventoryFilters").addEventListener("reset", () => setTimeout(() => { document.querySelector("#customPrice").hidden = true; renderInventory(); }));
document.querySelectorAll(".quote-form").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); void submitInquiry(form); }));
document.querySelector("#modalClose").addEventListener("click", closeModal);
document.querySelector("#vehicleModal").addEventListener("click", (event) => { if (event.target.id === "vehicleModal") closeModal(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
applyTranslations();
void loadInventory();

export { card, formatPrice, statusLabel };

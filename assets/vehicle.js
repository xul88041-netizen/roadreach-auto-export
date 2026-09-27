// RoadReach Auto Export — Standalone Vehicle Detail Page Logic
// Reads PUBLISHED vehicle data strictly through the public_vehicle_catalog view.
// NOTE: vehicle UUID 只是资源标识符，真正的数据安全边界由 public_vehicle_catalog + publication_status + RLS 共同保证，不得把 UUID 隐蔽性当作权限控制。

const config = window.ROADREACH_CONFIG || {};
const client = config.supabaseUrl && config.supabasePublishableKey && window.supabase
  ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false } }) : null;

const fallbackImage = "assets/rr-0001-cover.svg";
const whatsAppNumber = "447845251241";
let currentVehicle = null;
let currentImageIndex = 0;
let language = localStorage.getItem("roadreach-language") || "en";

// 6-Language Localization Dictionary
const i18nDict = {
  en: {
    topbar: "China used vehicle export sourcing",
    navVehicles: "Vehicles", navProcess: "How it works", navAbout: "Why us", contact: "Contact", getQuote: "Get a quote",
    loading: "Loading vehicle details…",
    vehicleUnavailable: "Vehicle unavailable",
    vehicleUnavailableDesc: "This vehicle is either unavailable, has been sold, or is no longer listed in our public showroom.",
    backToInventory: "← Back to Inventory",
    requestQuote: "Request a Quote →",
    instantQuote: "Instant Quote on WhatsApp",
    fobOnRequest: "Reference FOB Price",
    fobPriceOnRequest: "Reference FOB Price on request",
    priceDisclaimer: "Final quotation may vary depending on vehicle condition/configuration, quantity, purchase timing and destination requirements.",
    inStock: "In Stock", sourceStatus: "Available to Source",
    year: "Year", mileageLabel: "Mileage", fuel: "Fuel type", steering: "Steering", body: "Body type",
    transmissionLabel: "Transmission", colorLabel: "Exterior color", intColorLabel: "Interior color",
    stockIdLabel: "Stock ID", conditionLabel: "Condition statement",
    name: "Your name", country: "Country", city: "City", phone: "WhatsApp or Phone",
    quantity: "Quantity", budget: "Target Budget (USD)", destination: "Destination port",
    timing: "Purchase timing", requirements: "Message / Requirements",
    requestVin: "Request Full VIN (reviewed privately; never sent automatically)",
    sendInquiry: "Send inquiry", chatNow: "Chat now",
    inquirySuccess: "Thank you. Your inquiry was saved and the RoadReach team will follow up.",
    inquiryFailed: "Your inquiry could not be saved. Please try again.",
    footerNavHeading: "Navigation", footerPortsHeading: "Key Destination Ports",
    footerBody: "Practical vehicle sourcing and export support from China to international buyers."
  },
  ru: {
    topbar: "Экспорт подержанных автомобилей из Китая",
    navVehicles: "Автомобили", navProcess: "Как это работает", navAbout: "Почему мы", contact: "Контакты", getQuote: "Запросить цену",
    loading: "Загрузка данных автомобиля…",
    vehicleUnavailable: "Автомобиль недоступен",
    vehicleUnavailableDesc: "Этот автомобиль недоступен, продан или больше не представлен в нашем каталоге.",
    backToInventory: "← Назад к каталогу",
    requestQuote: "Запросить цену →",
    instantQuote: "⚡ Расчёт в WhatsApp",
    fobOnRequest: "Цена FOB",
    fobPriceOnRequest: "Цена FOB по запросу",
    priceDisclaimer: "Итоговая котировка может меняться в зависимости от состояния/комплектации, количества, времени покупки и требований страны назначения.",
    inStock: "В наличии", sourceStatus: "Доступно под заказ",
    year: "Год выпуска", mileageLabel: "Пробег", fuel: "Тип топлива", steering: "Расположение руля", body: "Тип кузова",
    transmissionLabel: "Коробка передач", colorLabel: "Цвет кузова", intColorLabel: "Цвет салона",
    stockIdLabel: "Номер лота", conditionLabel: "Состояние и дефектовка",
    name: "Ваше имя", country: "Страна", city: "Город", phone: "WhatsApp или телефон",
    quantity: "Количество", budget: "Бюджет (USD)", destination: "Порт назначения",
    timing: "Срок покупки", requirements: "Требования к комплектации",
    requestVin: "Запросить полный VIN (только после частной проверки; не отправляется автоматически)",
    sendInquiry: "Отправить запрос", chatNow: "Написать",
    inquirySuccess: "Спасибо. Запрос сохранён, и команда RoadReach свяжется с вами.",
    inquiryFailed: "Не удалось отправить запрос. Пожалуйста, попробуйте снова.",
    footerNavHeading: "Навигация", footerPortsHeading: "Основные порты назначения",
    footerBody: "Практичный поиск и экспорт подержанных автомобилей из Китая."
  },
  ar: {
    topbar: "تصدير السيارات المستعملة من الصين مباشرة",
    navVehicles: "السيارات", navProcess: "كيف نعمل", navAbout: "لماذا نحن", contact: "اتصل بنا", getQuote: "طلب عرض سعر",
    loading: "جاري تحميل تفاصيل السيارة…",
    vehicleUnavailable: "السيارة غير متوفرة",
    vehicleUnavailableDesc: "هذه السيارة إما غير متوفرة أو تم بيعها أو لم تعد معروضة في صالة العرض الخاصة بنا.",
    backToInventory: "← العودة إلى المعرض",
    requestQuote: "طلب عرض سعر ←",
    instantQuote: "⚡ عرض سعر فوري عبر واتساب",
    fobOnRequest: "سعر FOB الإرشادي",
    fobPriceOnRequest: "السعر عند الطلب (FOB on request)",
    priceDisclaimer: "الأسعار النهائية قد تختلف بناءً على الفئة وحالة السيارة وميناء الوصول.",
    inStock: "متوفر بالمخزن", sourceStatus: "متاح للطلب السريع",
    year: "سنة الصنع", mileageLabel: "الممشى", fuel: "نوع الوقود", steering: "المقود", body: "هيكل السيارة",
    transmissionLabel: "ناقل الحركة", colorLabel: "اللون الخارجي", intColorLabel: "اللون الداخلي",
    stockIdLabel: "رقم المخزون", conditionLabel: "حالة الفحص",
    name: "الاسم", country: "الدولة", city: "المدينة", phone: "الواتساب أو الهاتف",
    quantity: "العدد", budget: "الميزانية (دولار)", destination: "ميناء الوصول",
    timing: "موعد الشراء", requirements: "ملاحظات إضافية",
    requestVin: "طلب رقم الهيكل كاملاً (VIN)",
    sendInquiry: "إرسال الاستفسار", chatNow: "محادثة واتساب",
    inquirySuccess: "شكراً لك. تم حفظ استفسارك بنجاح وسيتواصل معك فريق RoadReach قريباً.",
    inquiryFailed: "تعذر حفظ الاستفسار. يرجى المحاولة مرة أخرى أو التواصل عبر واتساب.",
    footerNavHeading: "روابط سريعة", footerPortsHeading: "الموانئ الرئيسية",
    footerBody: "مصدر موثوق للسيارات المستعملة من الصين مع دعم تصدير كامل."
  },
  es: {
    topbar: "Exportación de autos usados verificados desde China",
    navVehicles: "Vehículos", navProcess: "Cómo funciona", navAbout: "Nosotros", contact: "Contacto", getQuote: "Cotizar",
    loading: "Cargando detalles del vehículo…",
    vehicleUnavailable: "Vehículo no disponible",
    vehicleUnavailableDesc: "Este vehículo no está disponible, ha sido vendido o ya no figura en nuestro catálogo público.",
    backToInventory: "← Volver al catálogo",
    requestQuote: "Solicitar cotización →",
    instantQuote: "⚡ Cotización rápida por WhatsApp",
    fobOnRequest: "Precio FOB de referencia",
    fobPriceOnRequest: "Precio FOB a consultar",
    priceDisclaimer: "Cotización final sujeta a configuración, condición y requerimientos de destino.",
    inStock: "En Stock", sourceStatus: "Bajo Pedido",
    year: "Año", mileageLabel: "Kilometraje", fuel: "Combustible", steering: "Volante", body: "Carrocería",
    transmissionLabel: "Transmisión", colorLabel: "Color exterior", intColorLabel: "Color interior",
    stockIdLabel: "ID de lote", conditionLabel: "Estado verificado",
    name: "Su nombre", country: "País", city: "Ciudad", phone: "WhatsApp o Teléfono",
    quantity: "Cantidad", budget: "Presupuesto (USD)", destination: "Puerto de destino",
    timing: "Plazo de compra", requirements: "Requerimientos adicionales",
    requestVin: "Solicitar VIN completo",
    sendInquiry: "Enviar consulta", chatNow: "WhatsApp",
    inquirySuccess: "Gracias. Su consulta ha sido guardada y el equipo de RoadReach se comunicará pronto.",
    inquiryFailed: "No se pudo guardar su consulta. Por favor intente nuevamente.",
    footerNavHeading: "Navegación", footerPortsHeading: "Puertos de Destino",
    footerBody: "Aprovisionamiento práctico de vehículos desde China para compradores internacionales."
  },
  fr: {
    topbar: "Exportation de véhicules d'occasion certifiés depuis la Chine",
    navVehicles: "Véhicules", navProcess: "Processus", navAbout: "À propos", contact: "Contact", getQuote: "Devis",
    loading: "Chargement des détails du véhicule…",
    vehicleUnavailable: "Véhicule indisponible",
    vehicleUnavailableDesc: "Ce véhicule est indisponible, a été vendu ou ne figure plus dans notre catalogue public.",
    backToInventory: "← Retour à l'inventaire",
    requestQuote: "Demander un devis →",
    instantQuote: "⚡ Devis rapide sur WhatsApp",
    fobOnRequest: "Prix FOB de référence",
    fobPriceOnRequest: "Prix FOB sur demande",
    priceDisclaimer: "La cotation finale dépend de l'état, de la configuration et de la destination.",
    inStock: "En Stock", sourceStatus: "Sur Commande",
    year: "Année", mileageLabel: "Kilométrage", fuel: "Carburant", steering: "Direction", body: "Carrosserie",
    transmissionLabel: "Transmission", colorLabel: "Couleur extérieure", intColorLabel: "Couleur intérieure",
    stockIdLabel: "ID de stock", conditionLabel: "Rapport d'état",
    name: "Votre nom", country: "Pays", city: "Ville", phone: "WhatsApp ou Téléphone",
    quantity: "Quantité", budget: "Budget (USD)", destination: "Port de destination",
    timing: "Délai d'achat", requirements: "Exigences particulières",
    requestVin: "Demander le VIN complet",
    sendInquiry: "Envoyer la demande", chatNow: "WhatsApp",
    inquirySuccess: "Merci. Votre demande a été enregistrée et notre équipe vous recontactera rapidement.",
    inquiryFailed: "Impossible d'enregistrer votre demande. Veuillez réessayer.",
    footerNavHeading: "Navigation", footerPortsHeading: "Ports de Destination Clés",
    footerBody: "Approvisionnement pratique en véhicules depuis la Chine pour acheteurs internationaux."
  },
  zh: {
    topbar: "中国二手车出口专业车源供应链",
    navVehicles: "车源展厅", navProcess: "出口流程", navAbout: "为什么选我们", contact: "联系我们", getQuote: "获取报价",
    loading: "正在加载车辆详细信息…",
    vehicleUnavailable: "车辆暂不可用",
    vehicleUnavailableDesc: "此车辆暂不可用、已售出或已不在公开展厅中。",
    backToInventory: "← 返回车辆目录",
    requestQuote: "申请 FOB/CIF 报价 →",
    instantQuote: "⚡ WhatsApp 闪电询价",
    fobOnRequest: "参考 FOB 价格",
    fobPriceOnRequest: "价格按需索取 (FOB on request)",
    priceDisclaimer: "最终报价视具体车况成色、配置版本、采购数量及发运目的港要求而定。",
    inStock: "现车在库", sourceStatus: "快速代采",
    year: "出厂年份", mileageLabel: "表显里程", fuel: "动力类型", steering: "方向盘", body: "车身结构",
    transmissionLabel: "变速箱", colorLabel: "外观颜色", intColorLabel: "内饰颜色",
    stockIdLabel: "车辆编号", conditionLabel: "检测车况评级",
    name: "您的姓名", country: "目的国家", city: "城市", phone: "WhatsApp 或电话",
    quantity: "采购数量", budget: "目标预算 (USD)", destination: "目的口岸",
    timing: "预计采购时间", requirements: "特殊要求或配置需求",
    requestVin: "申请查验完整车架号 (VIN)",
    sendInquiry: "提交询盘", chatNow: "在线咨询",
    inquirySuccess: "感谢您的询盘。RoadReach 团队将尽快与您联系！",
    inquiryFailed: "询盘提交失败，请检查网络或直接通过 WhatsApp 联系我们。",
    footerNavHeading: "导航菜单", footerPortsHeading: "主要目的港口",
    footerBody: "专业中国二手车出口供应链服务，覆盖全球主要口岸。"
  }
};

const t = (key, fallback = key) => {
  const dict = i18nDict[language] || i18nDict["en"];
  return dict[key] || i18nDict["en"][key] || fallback;
};

const isValidUuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/gu, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));

const safeUrl = (value) => {
  try {
    const url = new URL(String(value), location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : fallbackImage;
  } catch {
    return fallbackImage;
  }
};

const formatPrice = (vehicle) => {
  if (vehicle.public_reference_fob_price_usd == null || vehicle.public_reference_fob_price_usd === "" || Number(vehicle.public_reference_fob_price_usd) <= 0) {
    return t("fobPriceOnRequest", "Reference FOB Price on request");
  }
  const prefix = language === "ru" ? "FOB от" : language === "zh" ? "参考 FOB 价格" : language === "ar" ? "سعر FOB" : "FOB";
  return `${prefix} USD ${Number(vehicle.public_reference_fob_price_usd).toLocaleString("en-US")}`;
};

function showUnavailable() {
  const loadingEl = document.querySelector("#detailLoading");
  const unavailEl = document.querySelector("#detailUnavailable");
  const contentEl = document.querySelector("#detailContent");
  if (loadingEl) loadingEl.hidden = true;
  if (contentEl) contentEl.hidden = true;
  if (unavailEl) unavailEl.hidden = false;
  document.title = `${t("vehicleUnavailable")} | RoadReach Auto Export`;
}

function updateSeoMetadata(vehicle) {
  const vehicleName = `${vehicle.year} ${vehicle.brand} ${vehicle.model}`;
  const pageTitle = `${vehicleName} | RoadReach Auto Export`;
  document.title = pageTitle;

  const descText = `${vehicle.year} ${vehicle.brand} ${vehicle.model} inspected and ready for export from China. FOB/CIF quotations, inspection reports, clear customs title and global container/Ro-Ro delivery.`;
  const canonicalUrl = `${window.location.origin}${window.location.pathname}?id=${vehicle.id}`;

  const setMetaAttr = (selector, attr, value) => {
    let el = document.querySelector(selector);
    if (!el) {
      el = document.createElement("meta");
      const [key, val] = selector.replace(/[\[\]"]/g, "").split("=");
      el.setAttribute(key, val);
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  };

  setMetaAttr('meta[name="description"]', "content", descText);
  setMetaAttr('meta[property="og:title"]', "content", pageTitle);
  setMetaAttr('meta[property="og:description"]', "content", descText);
  setMetaAttr('meta[property="og:url"]', "content", canonicalUrl);
  setMetaAttr('meta[property="og:type"]', "content", "website");

  const images = Array.isArray(vehicle.images) && vehicle.images.length ? vehicle.images : [];
  const primaryImg = images[0]?.url ? safeUrl(images[0].url) : `${window.location.origin}/assets/rr-0002-cover.webp`;
  setMetaAttr('meta[property="og:image"]', "content", primaryImg);

  setMetaAttr('meta[name="twitter:card"]', "content", "summary_large_image");
  setMetaAttr('meta[name="twitter:title"]', "content", pageTitle);
  setMetaAttr('meta[name="twitter:description"]', "content", descText);
  setMetaAttr('meta[name="twitter:image"]', "content", primaryImg);

  let canonicalEl = document.querySelector('link[rel="canonical"]');
  if (!canonicalEl) {
    canonicalEl = document.createElement("link");
    canonicalEl.setAttribute("rel", "canonical");
    document.head.appendChild(canonicalEl);
  }
  canonicalEl.setAttribute("href", canonicalUrl);
}

function injectStructuredData(vehicle) {
  const images = Array.isArray(vehicle.images) ? vehicle.images.map((i) => safeUrl(i.url)) : [];
  const canonicalUrl = `${window.location.origin}${window.location.pathname}?id=${vehicle.id}`;
  const notes = (language === "ru" && vehicle.vehicle_notes_ru) ? vehicle.vehicle_notes_ru : (vehicle.vehicle_notes_en || `${vehicle.year} ${vehicle.brand} ${vehicle.model} available for export from China.`);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    "name": `${vehicle.year} ${vehicle.brand} ${vehicle.model}`,
    "image": images.length ? images : [`${window.location.origin}/assets/rr-0002-cover.webp`],
    "description": notes,
    "sku": vehicle.stock_id,
    "brand": {
      "@type": "Brand",
      "name": vehicle.brand
    },
    "model": vehicle.model,
    "vehicleModelDate": String(vehicle.year),
    "fuelType": vehicle.fuel_type,
    "vehicleTransmission": "Automatic",
    "color": vehicle.exterior_color || "Standard",
    "url": canonicalUrl
  };

  if (vehicle.mileage != null && !Number.isNaN(Number(vehicle.mileage))) {
    jsonLd.mileageFromOdometer = {
      "@type": "QuantitativeValue",
      "value": Number(vehicle.mileage),
      "unitCode": "KMT"
    };
  }

  if (vehicle.public_reference_fob_price_usd != null && Number(vehicle.public_reference_fob_price_usd) > 0) {
    jsonLd.offers = {
      "@type": "Offer",
      "price": Number(vehicle.public_reference_fob_price_usd),
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "url": canonicalUrl
    };
  }

  let scriptEl = document.querySelector("#vehicleJsonLd");
  if (!scriptEl) {
    scriptEl = document.createElement("script");
    scriptEl.id = "vehicleJsonLd";
    scriptEl.type = "application/ld+json";
    document.head.appendChild(scriptEl);
  }
  scriptEl.textContent = JSON.stringify(jsonLd, null, 2);
}

function renderVehicleDetail(vehicle) {
  currentVehicle = vehicle;
  const loadingEl = document.querySelector("#detailLoading");
  const contentEl = document.querySelector("#detailContent");
  if (loadingEl) loadingEl.hidden = true;
  if (contentEl) contentEl.hidden = false;

  const vehicleName = `${vehicle.year} ${vehicle.brand} ${vehicle.model}`;
  document.querySelector("#breadcrumbCurrent").textContent = `${vehicle.brand} ${vehicle.model}`;
  document.querySelector("#detailTitleText").textContent = vehicleName;
  document.querySelector("#detailStockId").textContent = vehicle.stock_id;

  const statusBadge = document.querySelector("#detailStatusBadge");
  const isStock = vehicle.sourcing_status === "IN_STOCK";
  statusBadge.textContent = isStock ? t("inStock") : t("sourceStatus");
  statusBadge.className = `vehicle-status ${isStock ? "" : "source"}`;

  const vinBadge = document.querySelector("#detailVinBadge");
  if (isStock && vehicle.masked_vin) {
    vinBadge.textContent = `VIN: ${vehicle.masked_vin}`;
    vinBadge.hidden = false;
  } else {
    vinBadge.hidden = true;
  }

  document.querySelector("#detailPriceVal").textContent = formatPrice(vehicle);

  // Specifications
  const specs = [
    [t("year"), vehicle.year],
    [t("mileageLabel"), vehicle.mileage == null ? "—" : `${Number(vehicle.mileage).toLocaleString("en-US")} km`],
    [t("fuel"), vehicle.fuel_type],
    [t("steering"), vehicle.steering],
    [t("body"), vehicle.body_type],
    [t("transmissionLabel"), "Automatic"],
    [t("colorLabel"), vehicle.exterior_color || "—"],
    [t("intColorLabel"), vehicle.interior_color || "—"],
    [t("stockIdLabel"), vehicle.stock_id],
    ["Status", isStock ? t("inStock") : t("sourceStatus")]
  ];

  document.querySelector("#detailSpecsGrid").innerHTML = specs
    .filter(([, v]) => v != null && v !== "")
    .map(([label, val]) => `
      <div class="spec-box">
        <small>${escapeHtml(label)}</small>
        <b>${escapeHtml(val)}</b>
      </div>
    `).join("");

  // Description / Notes
  const notes = (language === "ru" && vehicle.vehicle_notes_ru) ? vehicle.vehicle_notes_ru : vehicle.vehicle_notes_en;
  const descBox = document.querySelector("#detailDescBox");
  if (notes) {
    document.querySelector("#detailNotesText").textContent = notes;
    descBox.hidden = false;
  } else {
    descBox.hidden = true;
  }

  // Condition
  const conditionBox = document.querySelector("#detailConditionBox");
  if (vehicle.condition) {
    document.querySelector("#detailConditionText").textContent = vehicle.condition;
    conditionBox.hidden = false;
  } else {
    conditionBox.hidden = true;
  }

  // WhatsApp Pre-filled link
  const waCarMsg = `Hello RoadReach Auto, I am interested in Stock ${vehicle.stock_id} (${vehicle.brand} ${vehicle.model} ${vehicle.year}). View: ${window.location.origin}${window.location.pathname}?id=${vehicle.id} — Please send full FOB/CIF quote.`;
  const waCarUrl = `https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(waCarMsg)}`;
  const waBtn = document.querySelector("#detailWaBtn");
  if (waBtn) waBtn.href = waCarUrl;

  // Setup Gallery
  setupGallery(vehicle);

  // Pre-populate Inquiry Form
  const form = document.querySelector("#vehicleInquiryForm");
  if (form) {
    form.elements.vehicle_id.value = vehicle.id;
    form.elements.stock_id.value = vehicle.stock_id;
    form.elements.preferred_model.value = `${vehicle.brand} ${vehicle.model}`;
  }
}

function setupGallery(vehicle) {
  const images = Array.isArray(vehicle.images) && vehicle.images.length
    ? vehicle.images
    : [{ url: fallbackImage }];

  currentImageIndex = 0;
  const mainImg = document.querySelector("#detailMainImage");
  const counter = document.querySelector("#detailGalleryCounter");
  const prevBtn = document.querySelector("#detailGalleryPrev");
  const nextBtn = document.querySelector("#detailGalleryNext");
  const thumbsWrap = document.querySelector("#detailThumbsStrip");
  const heroWrap = document.querySelector("#galleryHeroWrap");

  function goToImage(idx) {
    if (idx < 0) idx = images.length - 1;
    if (idx >= images.length) idx = 0;
    currentImageIndex = idx;
    mainImg.style.opacity = "0.35";
    setTimeout(() => {
      mainImg.src = safeUrl(images[currentImageIndex].url);
      mainImg.alt = `${vehicle.brand} ${vehicle.model} photo ${currentImageIndex + 1}`;
      mainImg.style.opacity = "1";
    }, 90);

    if (counter) counter.textContent = `${currentImageIndex + 1} / ${images.length}`;
    document.querySelectorAll(".thumb-btn").forEach((btn, i) => {
      btn.classList.toggle("active", i === currentImageIndex);
    });
    const activeThumb = thumbsWrap?.children[currentImageIndex];
    if (activeThumb) activeThumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  // Bind error fallback to avoid broken icon
  mainImg.addEventListener("error", () => {
    mainImg.alt = "";
    mainImg.src = fallbackImage;
  });

  if (images.length > 1) {
    prevBtn.hidden = false;
    nextBtn.hidden = false;
    counter.hidden = false;
    prevBtn.onclick = (e) => { e.stopPropagation(); goToImage(currentImageIndex - 1); };
    nextBtn.onclick = (e) => { e.stopPropagation(); goToImage(currentImageIndex + 1); };

    thumbsWrap.innerHTML = images.map((img, idx) => `
      <button type="button" class="thumb-btn ${idx === 0 ? 'active' : ''}" data-idx="${idx}" aria-label="Photo ${idx + 1}">
        <img src="${escapeHtml(safeUrl(img.url))}" alt="${escapeHtml(`${vehicle.brand} ${vehicle.model} thumbnail ${idx + 1}`)}">
      </button>
    `).join("");

    thumbsWrap.querySelectorAll(".thumb-btn").forEach((btn) => {
      btn.addEventListener("click", () => goToImage(Number(btn.dataset.idx || 0)));
      btn.querySelector("img")?.addEventListener("error", (e) => {
        e.target.alt = "";
        e.target.src = fallbackImage;
      });
    });

    // Touch Swipe handling on mobile
    let touchStartX = 0;
    let touchEndX = 0;
    heroWrap.addEventListener("touchstart", (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    heroWrap.addEventListener("touchend", (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const diff = touchEndX - touchStartX;
      if (Math.abs(diff) > 45) {
        if (diff < 0) goToImage(currentImageIndex + 1);
        else goToImage(currentImageIndex - 1);
      }
    }, { passive: true });
  } else {
    prevBtn.hidden = true;
    nextBtn.hidden = true;
    counter.hidden = true;
    thumbsWrap.innerHTML = "";
  }

  goToImage(0);
}

async function loadVehicleData() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!id || !isValidUuid(id)) {
    showUnavailable();
    return;
  }

  if (!client) {
    console.warn("Supabase client is not configured; cannot load vehicle detail.");
    showUnavailable();
    return;
  }

  try {
    const { data: vehicle, error } = await client
      .from("public_vehicle_catalog")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !vehicle || vehicle.publication_status !== "PUBLISHED") {
      showUnavailable();
      return;
    }

    renderVehicleDetail(vehicle);
    updateSeoMetadata(vehicle);
    injectStructuredData(vehicle);
  } catch (err) {
    console.error("Failed to load vehicle from Supabase:", err);
    showUnavailable();
  }
}

async function submitInquiry(form) {
  const status = form.querySelector(".form-status");
  const button = form.querySelector('button[type="submit"]');
  status.classList.remove("error");
  status.textContent = "";

  if (!client) {
    const data = new FormData(form);
    const msg = `Hello RoadReach Auto! Inquiry from ${data.get("name") || "Customer"} (${data.get("country") || ""}): Stock: ${data.get("stock_id") || ""} Model: ${data.get("preferred_model") || ""}`;
    window.open(`https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(msg)}`, "_blank");
    status.textContent = "Redirecting to WhatsApp for quote...";
    return;
  }

  const data = new FormData(form);
  const contact = String(data.get("whatsapp_or_phone") || data.get("email") || "").trim();
  const payload = Object.fromEntries(data.entries());
  payload.request_full_vin = data.get("request_full_vin") === "on";
  payload.language = language;
  payload.source_page = `${location.pathname}${location.search}`.slice(0, 500);
  payload.website = String(data.get("website") || "");

  button.disabled = true;
  try {
    const { data: result, error } = await client.functions.invoke("submit-inquiry", { body: payload });
    if (error || !result?.accepted) throw new Error(result?.error || error?.message || "Submission failed");
    form.reset();
    status.textContent = t("inquirySuccess");
  } catch (err) {
    status.classList.add("error");
    status.textContent = err.message || t("inquiryFailed");
  } finally {
    button.disabled = false;
  }
}

function applyTranslations() {
  document.documentElement.lang = language;
  document.body.classList.toggle("rtl-layout", language === "ar");

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.dataset.i18nEn ||= node.textContent;
    node.textContent = t(node.dataset.i18n, node.dataset.i18nEn);
  });

  const selector = document.querySelector("#languageSelect");
  if (selector) selector.value = language;

  if (currentVehicle) {
    renderVehicleDetail(currentVehicle);
    updateSeoMetadata(currentVehicle);
  }
}

function initLanguageSelector() {
  const selector = document.querySelector("#languageSelect");
  if (selector) {
    selector.addEventListener("change", (e) => {
      language = e.target.value;
      localStorage.setItem("roadreach-language", language);
      applyTranslations();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initLanguageSelector();
  applyTranslations();
  loadVehicleData();

  const inquiryForm = document.querySelector("#vehicleInquiryForm");
  if (inquiryForm) {
    inquiryForm.addEventListener("submit", (e) => {
      e.preventDefault();
      submitInquiry(inquiryForm);
    });
  }
});

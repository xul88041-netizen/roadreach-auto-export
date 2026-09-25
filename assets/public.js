const config = window.ROADREACH_CONFIG || {};
const client = config.supabaseUrl && config.supabasePublishableKey && window.supabase
  ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false } }) : null;
const fallbackImage = "assets/rr-0001-cover.svg";
const whatsAppNumber = "447845251241";
let vehicles = [];
let language = localStorage.getItem("roadreach-language") || "en";

// 多语言国际化完整字典库 (支持 6 种主流外贸语言: 英文/俄文/阿拉伯文/西班牙文/法文/中文)
const i18nDict = {
  en: {
    topbar: "China used vehicle export sourcing", navVehicles: "Vehicles", navProcess: "How it works", navAbout: "Why us", getQuote: "Get a quote",
    heroEyebrow: "VERIFIED SOURCING · GLOBAL SHIPPING", heroTitle: "Reliable used cars.<br><em>Ready for export.</em>",
    heroLead: "Get inspected vehicles, clear export documents and a shipping quote to your destination port — from one responsive team in China.",
    browseVehicles: "Browse vehicles", whatsapp: "Chat on WhatsApp ↗", inspection: "Inspection report", documents: "Export documents", delivery: "Port delivery",
    quickQuote: "QUICK QUOTE", tellNeed: "Tell us what you need.", matchingIntro: "Receive matching options and an estimated FOB/CIF price.",
    name: "Your name", country: "Country", emailPhone: "Email or WhatsApp", preferredModel: "Preferred model", budget: "Budget (USD)", quantity: "Quantity",
    sendRequest: "Send quote request", replyNote: "No payment required. Typical reply within one business day.", exportMarkets: "EXPORT MARKETS",
    showroom: "B2B VEHICLE SHOWROOM", availableVehicles: "Available export vehicles",
    inventoryIntro: "Published vehicles and clearly labelled sourcing options. Availability and reference pricing remain subject to final verification.",
    brand: "Brand", model: "Model", year: "Year", fuel: "Fuel type", steering: "Steering", body: "Body type", stockStatus: "Stock status", priceRange: "Price range",
    all: "All", inStock: "In Stock", sourceStatus: "Available to Source", customRange: "Custom Range", reset: "Reset", featured: "Featured",
    loading: "Loading current inventory…", cantFind: "Can't find your model?", sendRequirement: "Send your requirement →",
    sourceBrands: "We source Lynk & Co, Haval, Toyota, Honda, BYD, Geely, Changan, Chery and more.",
    trackRecord: "RECENT TRACK RECORD", recentSold: "Recently Sold", soldIntro: "Sold examples remain visible for up to 90 days and are not part of available inventory.",
    simpleProcess: "SIMPLE EXPORT PROCESS", portTitle: "From request to your port",
    step1Title: "Send your request", step1Body: "Share the model, budget, quantity and destination port.",
    step2Title: "Verify & choose", step2Body: "Review photos, specifications, condition and the complete quote.",
    step3Title: "Documents & payment", step3Body: "Confirm the proforma invoice and export paperwork before shipment.",
    step4Title: "Ship & track", step4Body: "Receive loading evidence and shipping documents for clearance.",
    transparent: "Transparent sourcing", evidence: "Evidence before decision", buyers: "BUILT FOR INTERNATIONAL BUYERS",
    clarity: "Clarity before every commitment.", aboutBody: "International vehicle buying depends on accurate condition details, complete costs and reliable documents. Our process is designed around those three essentials.",
    startRequest: "START YOUR REQUEST", inquiryTitle: "Get matching vehicles and a shipping estimate.",
    inquiryBody: "Tell us what you need. We'll reply with available options and the information needed to compare them.",
    company: "Company", city: "City", customerType: "Customer type", dealer: "Dealer", importer: "Importer", fleet: "Fleet", personal: "Personal buyer", other: "Other",
    destination: "Destination port", phone: "WhatsApp / phone", timing: "Purchase timing", requirements: "Other requirements",
    requestVin: "Request Full VIN (reviewed privately; never sent automatically)", sendInquiry: "Send inquiry", contact: "Contact", chatNow: "Chat now",
    priceDisclaimer: "Final quotation may vary depending on vehicle condition/configuration, quantity, purchase timing and destination requirements.",
    fobOnRequest: "Reference FOB Price on request", askForQuote: "Ask for Quote →", findSimilar: "Find Similar Vehicle →",
    mileageLabel: "Mileage", colorLabel: "Exterior", conditionLabel: "Condition statement"
  },
  ru: {
    topbar: "Экспорт подержанных автомобилей из Китая", navVehicles: "Автомобили", navProcess: "Как это работает", navAbout: "Почему мы", getQuote: "Запросить цену",
    heroEyebrow: "ПРОВЕРЕННЫЙ ПОИСК · ДОСТАВКА ПО МИРУ", heroTitle: "Надёжные автомобили.<br><em>Готовы к экспорту.</em>",
    heroLead: "Проверенные автомобили, прозрачные экспортные документы и расчёт доставки в ваш порт — от одной команды в Китае.",
    browseVehicles: "Смотреть автомобили", whatsapp: "Написать в WhatsApp ↗", inspection: "Отчёт о проверке", documents: "Экспортные документы", delivery: "Доставка в порт",
    quickQuote: "БЫСТРЫЙ ЗАПРОС", tellNeed: "Расскажите, что вам нужно.", matchingIntro: "Получите подходящие варианты и ориентировочную цену FOB/CIF.",
    name: "Ваше имя", country: "Страна", emailPhone: "Email или WhatsApp", preferredModel: "Желаемая модель", budget: "Бюджет (USD)", quantity: "Количество",
    sendRequest: "Отправить запрос", replyNote: "Оплата не требуется. Обычно отвечаем в течение рабочего дня.", exportMarkets: "РЫНКИ ЭКСПОРТА",
    showroom: "B2B КАТАЛОГ", availableVehicles: "Автомобили для экспорта",
    inventoryIntro: "Опубликованные автомобили и варианты под заказ имеют чёткие обозначения. Наличие и ориентировочная цена требуют финального подтверждения.",
    brand: "Марка", model: "Модель", year: "Год", fuel: "Топливо", steering: "Руль", body: "Кузов", stockStatus: "Статус", priceRange: "Диапазон цены",
    all: "Все", inStock: "В наличии", sourceStatus: "Доступно под заказ", customRange: "Свой диапазон", reset: "Сбросить", featured: "Рекомендуемые",
    loading: "Загрузка автомобилей…", cantFind: "Не нашли нужную модель?", sendRequirement: "Отправить запрос →",
    sourceBrands: "Мы поставляем Lynk & Co, Haval, Toyota, Honda, BYD, Geely, Changan, Chery и др.",
    trackRecord: "НЕДАВНИЕ РЕЗУЛЬТАТЫ", recentSold: "Недавно продано", soldIntro: "Проданные автомобили показываются до 90 дней и не входят в доступный склад.",
    simpleProcess: "ПРОСТОЙ ПРОЦЕСС ЭКСПОРТА", portTitle: "От запроса до вашего порта",
    step1Title: "Отправьте запрос", step1Body: "Укажите модель, бюджет, количество и порт назначения.",
    step2Title: "Проверьте и выберите", step2Body: "Изучите фото, характеристики, состояние и полную котировку.",
    step3Title: "Документы и оплата", step3Body: "Подтвердите проформу и экспортные документы до отгрузки.",
    step4Title: "Отгрузка и отслеживание", step4Body: "Получите подтверждение погрузки и документы для таможни.",
    transparent: "Прозрачный поиск", evidence: "Доказательства до решения", buyers: "ДЛЯ МЕЖДУНАРОДНЫХ ПОКУПАТЕЛЕЙ",
    clarity: "Ясность до каждого обязательства.", aboutBody: "Международная покупка требует точного описания, прозрачной цены и надежных документов.",
    startRequest: "НАЧНИТЕ ЗАПРОС", inquiryTitle: "Получите варианты и расчёт доставки.",
    inquiryBody: "Опишите вашу потребность. Мы ответим доступными вариантами и данными для сравнения.",
    company: "Компания", city: "Город", customerType: "Тип клиента", dealer: "Дилер", importer: "Импортёр", fleet: "Автопарк", personal: "Частный покупатель", other: "Другое",
    destination: "Порт назначения", phone: "WhatsApp / телефон", timing: "Срок покупки", requirements: "Другие требования",
    requestVin: "Запросить полный VIN (только после частной проверки; не отправляется автоматически)", sendInquiry: "Отправить запрос", contact: "Контакты", chatNow: "Написать",
    priceDisclaimer: "Итоговая котировка может меняться в зависимости от состояния/комплектации, количества, времени покупки и требований страны назначения.",
    fobOnRequest: "Цена FOB по запросу", askForQuote: "Запросить цену →", findSimilar: "Найти похожий →",
    mileageLabel: "Пробег", colorLabel: "Цвет", conditionLabel: "Состояние"
  },
  ar: {
    topbar: "تصدير السيارات المستعملة من الصين مباشرة", navVehicles: "السيارات", navProcess: "كيف نعمل", navAbout: "لماذا نحن", getQuote: "طلب عرض سعر",
    heroEyebrow: "فحص معتمد · شحن لجميع الموانئ", heroTitle: "سيارات مضمونة.<br><em>جاهزة للتصدير فوراً.</em>",
    heroLead: "فحص دقيق، أوراق تصدير نظامية، وأسعار شحن واضحة إلى مينائك مباشرة من فريقنا في الصين.",
    browseVehicles: "تصفح السيارات", whatsapp: "تواصل عبر واتساب ↗", inspection: "تقرير الفحص الشامل", documents: "أوراق التصدير", delivery: "الشحن للميناء",
    quickQuote: "طلب سريع", tellNeed: "أخبرنا بالسيارة المطلوبة.", matchingIntro: "سنرسل لك الخيارات المتاحة وعرض أسعار FOB/CIF مفصل.",
    name: "الاسم", country: "الدولة", emailPhone: "البريد أو الواتساب", preferredModel: "الموديل المطلوب", budget: "الميزانية (دولار)", quantity: "العدد",
    sendRequest: "إرسال الطلب", replyNote: "بدون رسوم مسبقة. الرد خلال 24 ساعة عمل.", exportMarkets: "أسواق التصدير الرئيسية",
    showroom: "معرض السيارات للتصدير", availableVehicles: "السيارات المتاحة للتصدير",
    inventoryIntro: "سيارات جاهزة للتصدير وأخرى متاحة للطلب. الأسعار الإرشادية تخضع للتأكيد النهائي.",
    brand: "الشركة", model: "الموديل", year: "سنة الصنع", fuel: "نوع الوقود", steering: "المقود", body: "هيكل السيارة", stockStatus: "حالة التوفر", priceRange: "نطاق السعر",
    all: "الكل", inStock: "متوفر بالمخزن", sourceStatus: "متاح للطلب السريع", customRange: "تحديد يدوي", reset: "إعادة ضبط", featured: "سيارات مميزة",
    loading: "جاري تحميل السيارات…", cantFind: "لم تجد الموديل المطلوب؟", sendRequirement: "أرسل مواصفاتك الخاصة →",
    sourceBrands: "نوفر Lynk & Co, Haval, Toyota, Honda, BYD, Geely, Changan, Chery والمزيد.",
    trackRecord: "سجل العمليات السابقة", recentSold: "تم بيعها مؤخراً", soldIntro: "السيارات المباعة معروضة كأمثلة سابقة فقط.",
    simpleProcess: "خطوات التصدير بكل سهولة", portTitle: "من اختيار السيارة حتى وصولها لمينائك",
    step1Title: "أرسل طلبك", step1Body: "حدد الموديل والميزانية والميناء المستهدف.",
    step2Title: "الفحص والمطابقة", step2Body: "راجع الصور وتقارير الفحص الفني وعرض السعر الكامل.",
    step3Title: "الأوراق والتعاقد", step3Body: "اعتماد الفاتورة المبدئية واستخراج تصاريح التصدير.",
    step4Title: "الشحن والتتبع", step4Body: "استلام صور التحميل وبوالص الشحن لتخليصها في بلدك.",
    transparent: "شفافية مطلقة", evidence: "الفحص قبل القرار", buyers: "مخصص للتجار والمستوردين",
    clarity: "وضوح تام في كل مرحلة.", aboutBody: "نضمن لك مطابقة المواصفات وسلامة الأوراق القانونية وسرعة الشحن.",
    startRequest: "ابدأ طلبك الآن", inquiryTitle: "احصل على أفضل خيارات التصدير وحساب الشحن.",
    inquiryBody: "أرسل استفسارك وسيقوم فريقنا بتجهيز أفضل العروض لك.",
    company: "اسم الشركة", city: "المدينة", customerType: "نوع العميل", dealer: "معرض سيارات", importer: "مستورد", fleet: "أسطول شركات", personal: "مشتري فردي", other: "أخرى",
    destination: "ميناء الوصول", phone: "واتساب / الهاتف", timing: "موعد الشراء", requirements: "ملاحظات إضافية",
    requestVin: "طلب رقم الهيكل كاملاً (VIN)", sendInquiry: "إرسال الاستفسار", contact: "اتصل بنا", chatNow: "محادثة واتساب",
    priceDisclaimer: "الأسعار النهائية قد تختلف بناءً على الفئة وحالة السيارة وميناء الوصول.",
    fobOnRequest: "السعر عند الطلب (FOB on request)", askForQuote: "طلب السعر والمواصفات →", findSimilar: "طلب سيارة مماثلة →",
    mileageLabel: "الممشى", colorLabel: "اللون الخارجي", conditionLabel: "حالة الفحص"
  },
  es: {
    topbar: "Exportación de autos usados verificados desde China", navVehicles: "Vehículos", navProcess: "Cómo funciona", navAbout: "Nosotros", getQuote: "Cotizar",
    heroEyebrow: "PROVEEDOR VERIFICADO · ENVÍO GLOBAL", heroTitle: "Autos confiables.<br><em>Listos para exportación.</em>",
    heroLead: "Vehículos inspeccionados, documentos de exportación claros y cotización de flete hasta su puerto de destino.",
    browseVehicles: "Ver vehículos", whatsapp: "Hablar por WhatsApp ↗", inspection: "Reporte de inspección", documents: "Documentos de exportación", delivery: "Entrega en puerto",
    quickQuote: "COTIZACIÓN RÁPIDA", tellNeed: "Díganos qué busca.", matchingIntro: "Reciba opciones disponibles y cálculo estimado FOB/CIF.",
    name: "Su nombre", country: "País", emailPhone: "Email o WhatsApp", preferredModel: "Modelo preferido", budget: "Presupuesto (USD)", quantity: "Cantidad",
    sendRequest: "Enviar solicitud", replyNote: "Sin compromiso de pago. Respuesta en 24 horas hábiles.", exportMarkets: "MERCADOS DE EXPORTACIÓN",
    showroom: "CATÁLOGO B2B", availableVehicles: "Vehículos disponibles",
    inventoryIntro: "Unidades en stock y opciones sobre pedido con condiciones transparentes.",
    brand: "Marca", model: "Modelo", year: "Año", fuel: "Combustible", steering: "Volante", body: "Carrocería", stockStatus: "Estado", priceRange: "Rango de precio",
    all: "Todos", inStock: "En Stock", sourceStatus: "Bajo Pedido", customRange: "Personalizado", reset: "Restablecer", featured: "Destacados",
    loading: "Cargando vehículos…", cantFind: "¿No encuentra su modelo?", sendRequirement: "Enviar requerimiento →",
    sourceBrands: "Suministramos Lynk & Co, Haval, Toyota, Honda, BYD, Geely, Changan, Chery y más.",
    trackRecord: "HISTORIAL RECIENTE", recentSold: "Vendidos recientemente", soldIntro: "Ejemplos vendidos con fines de referencia.",
    simpleProcess: "PROCESO SENCILLO", portTitle: "Desde su solicitud hasta su puerto",
    step1Title: "Envíe su requerimiento", step1Body: "Indique modelo, presupuesto, cantidad y puerto de destino.",
    step2Title: "Verifique y elija", step2Body: "Revise fotos detalladas, informe de estado y cotización final.",
    step3Title: "Documentos y pago", step3Body: "Confirme la factura proforma y trámites aduaneros de exportación.",
    step4Title: "Envío y rastreo", step4Body: "Reciba evidencia de carga y documentos BL para despacho.",
    transparent: "Búsqueda transparente", evidence: "Pruebas antes de decidir", buyers: "PARA COMPRADORES INTERNACIONALES",
    clarity: "Claridad en cada operación.", aboutBody: "Inspecciones minuciosas, costos cerrados y documentación garantizada.",
    startRequest: "INICIE SU PEDIDO", inquiryTitle: "Obtenga opciones y cálculo de flete.",
    inquiryBody: "Describa lo que necesita y le responderemos con las mejores opciones de mercado.",
    company: "Empresa", city: "Ciudad", customerType: "Tipo de cliente", dealer: "Distribuidor", importer: "Importador", fleet: "Flota", personal: "Comprador individual", other: "Otro",
    destination: "Puerto de destino", phone: "WhatsApp / Teléfono", timing: "Plazo de compra", requirements: "Otros requerimientos",
    requestVin: "Solicitar VIN completo", sendInquiry: "Enviar consulta", contact: "Contacto", chatNow: "WhatsApp",
    priceDisclaimer: "Cotización final sujeta a configuración, condición y requerimientos de destino.",
    fobOnRequest: "Precio FOB a consultar", askForQuote: "Solicitar cotización →", findSimilar: "Buscar similar →",
    mileageLabel: "Kilometraje", colorLabel: "Color", conditionLabel: "Estado verificado"
  },
  fr: {
    topbar: "Exportation de véhicules d'occasion certifiés depuis la Chine", navVehicles: "Véhicules", navProcess: "Processus", navAbout: "À propos", getQuote: "Devis",
    heroEyebrow: "APPROVISIONNEMENT VÉRIFIÉ · EXPÉDITION MONDIALE", heroTitle: "Véhicules fiables.<br><em>Prêts pour l'exportation.</em>",
    heroLead: "Véhicules inspectés, documents d'exportation conformes et devis maritime vers votre port de destination.",
    browseVehicles: "Voir les véhicules", whatsapp: "WhatsApp ↗", inspection: "Rapport d'inspection", documents: "Documents d'export", delivery: "Livraison au port",
    quickQuote: "DEVIS RAPIDE", tellNeed: "Dites-nous ce dont vous avez besoin.", matchingIntro: "Recevez les options disponibles et une estimation FOB/CIF.",
    name: "Votre nom", country: "Pays", emailPhone: "Email ou WhatsApp", preferredModel: "Modèle souhaité", budget: "Budget (USD)", quantity: "Quantité",
    sendRequest: "Demander un devis", replyNote: "Sans engagement. Réponse sous 24h ouvrées.", exportMarkets: "MARCHÉS D'EXPORTATION",
    showroom: "CATALOGUE B2B", availableVehicles: "Véhicules disponibles",
    inventoryIntro: "Véhicules disponibles en stock et sur commande avec transparence totale.",
    brand: "Marque", model: "Modèle", year: "Année", fuel: "Carburant", steering: "Direction", body: "Carrosserie", stockStatus: "Disponibilité", priceRange: "Gamme de prix",
    all: "Tous", inStock: "En Stock", sourceStatus: "Sur Commande", customRange: "Personnalisé", reset: "Réinitialiser", featured: "En vedette",
    loading: "Chargement de l'inventaire…", cantFind: "Vous ne trouvez pas votre modèle ?", sendRequirement: "Envoyer votre demande →",
    sourceBrands: "Nous fournissons Lynk & Co, Haval, Toyota, Honda, BYD, Geely, Changan, Chery et plus.",
    trackRecord: "RÉFÉRENCES RÉCENTES", recentSold: "Récemment vendus", soldIntro: "Exemples vendus affichés à titre indicatif.",
    simpleProcess: "PROCESSUS D'EXPORTATION", portTitle: "De votre demande à votre port",
    step1Title: "Envoyez votre demande", step1Body: "Précisez modèle, budget, quantité et port de destination.",
    step2Title: "Vérifiez et choisissez", step2Body: "Consultez photos, rapport d'état et devis complet.",
    step3Title: "Documents & règlement", step3Body: "Validation proforma et formalités d'exportation.",
    step4Title: "Expédition & suivi", step4Body: "Preuves de chargement et documents BL pour dédouanement.",
    transparent: "Sourcing transparent", evidence: "Preuves avant décision", buyers: "POUR ACHETEURS INTERNATIONAUX",
    clarity: "Clarté et fiabilité à chaque étape.", aboutBody: "Contrôles rigoureux, coûts transparents et documents sécurisés.",
    startRequest: "DÉMARRER UNE DEMANDE", inquiryTitle: "Recevez des options et l'estimation de transport.",
    inquiryBody: "Décrivez votre besoin. Notre équipe vous fournira les meilleures offres.",
    company: "Société", city: "Ville", customerType: "Type de client", dealer: "Concessionnaire", importer: "Importateur", fleet: "Flotte", personal: "Particulier", other: "Autre",
    destination: "Port de destination", phone: "WhatsApp / Téléphone", timing: "Délai d'achat", requirements: "Exigences particulières",
    requestVin: "Demander le VIN complet", sendInquiry: "Envoyer la demande", contact: "Contact", chatNow: "WhatsApp",
    priceDisclaimer: "La cotation finale dépend de l'état, de la configuration et de la destination.",
    fobOnRequest: "Prix FOB sur demande", askForQuote: "Demander un devis →", findSimilar: "Trouver similaire →",
    mileageLabel: "Kilométrage", colorLabel: "Couleur", conditionLabel: "Rapport d'état"
  },
  zh: {
    topbar: "中国二手车出口专业车源供应链", navVehicles: "车源展厅", navProcess: "出口流程", navAbout: "为什么选我们", getQuote: "获取报价",
    heroEyebrow: "实车查验 · 全球口岸直发", heroTitle: "精选可靠二手车<br><em>支持全球出口</em>",
    heroLead: "提供第三方权威查验报告、正规出口许可证与通关报关单证，一站式核算至目的港 CIF/FOB 价格。",
    browseVehicles: "浏览在售车源", whatsapp: "WhatsApp 咨询 ↗", inspection: "车况检测报告", documents: "出口清关单证", delivery: "口岸装运直发",
    quickQuote: "快速获取报价", tellNeed: "告诉我们您的车型需求", matchingIntro: "获取匹配车源及预估 FOB/CIF 离岸/到岸价格。",
    name: "您的姓名", country: "目的国家", emailPhone: "邮箱或 WhatsApp", preferredModel: "意向车型", budget: "预算 (USD)", quantity: "采购数量",
    sendRequest: "发送采购需求", replyNote: "无需任何定金，工作日 24 小时内由专属外贸经理回复。", exportMarkets: "主要出口市场",
    showroom: "B2B 车辆展厅", availableVehicles: "在售与代采车源",
    inventoryIntro: "所有车源均经过严格核验，标明现货在库或快速代采，支持第三方复验。",
    brand: "品牌", model: "车型", year: "出厂年份", fuel: "动力类型", steering: "方向盘", body: "车身结构", stockStatus: "库存状态", priceRange: "价格区间",
    all: "全部", inStock: "现车在库", sourceStatus: "快速代采", customRange: "自定义区间", reset: "重置筛选", featured: "重点推荐",
    loading: "正在加载最新车源…", cantFind: "没找到您想要的车型？", sendRequirement: "提交定制采购需求 →",
    sourceBrands: "支持调采 领克、哈弗、丰田、本田、比亚迪、吉利、长安、奇瑞等主流品牌。",
    trackRecord: "近期出口交付业绩", recentSold: "近期已售出", soldIntro: "已售车源仅作为往期成交案例展示，保留 90 天展示期。",
    simpleProcess: "简单透明的出口流程", portTitle: "从选车到发运抵达目的港",
    step1Title: "提交采购需求", step1Body: "告知心仪车型、预算范围、采购数量及目的港。",
    step2Title: "实车验车与确认", step2Body: "提供高清实拍图、查博士第三方检测报告及最终报价单。",
    step3Title: "签署合同与出证", step3Body: "确认形式发票 (PI)，快速办理二手车出口许可证与注销手续。",
    step4Title: "滚装/集装箱发运", step4Body: "提供装箱监控照片、提单及原产地证书，协助目的港清关。",
    transparent: "透明采买流程", evidence: "决策前提供全套凭证", buyers: "为全球海外采购商打造",
    clarity: "每一笔交易都清晰透明", aboutBody: "国际车辆采购依赖准确的车况、透明无隐瞒的费用结构和合规单证。我们严格把控每个环节。",
    startRequest: "开启您的询盘", inquiryTitle: "获取匹配车源及海运测算",
    inquiryBody: "告知您的具体要求，我们的专业团队将第一时间为您提供比对方案。",
    company: "公司名称", city: "城市", customerType: "客户类型", dealer: "车商/经销商", importer: "进出口商", fleet: "企业车队", personal: "个人买家", other: "其他",
    destination: "目的口岸", phone: "WhatsApp / 电话", timing: "预计采购时间", requirements: "特殊配置或改装需求",
    requestVin: "申请查验完整车架号 (VIN)", sendInquiry: "提交询盘", contact: "联系方式", chatNow: "在线咨询",
    priceDisclaimer: "最终报价视具体车况成色、配置版本、采购数量及发运目的港要求而定。",
    fobOnRequest: "价格按需索取 (FOB on request)", askForQuote: "咨询底价与配置 →", findSimilar: "寻找同款车源 →",
    mileageLabel: "表显里程", colorLabel: "外观颜色", conditionLabel: "检测车况评级"
  }
};

const t = (key, fallback = key) => {
  const dict = i18nDict[language] || i18nDict["en"];
  return dict[key] || i18nDict["en"][key] || fallback;
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/gu, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const safeUrl = (value) => { try { const url = new URL(String(value), location.href); return ["http:","https:"].includes(url.protocol) ? url.href : fallbackImage; } catch { return fallbackImage; } };

const formatPrice = (vehicle) => {
  if (vehicle.public_reference_fob_price_usd == null || vehicle.public_reference_fob_price_usd === "" || Number(vehicle.public_reference_fob_price_usd) <= 0) {
    return t("fobOnRequest", "Reference FOB Price on request");
  }
  const prefix = language === "ru" ? "FOB от" : language === "zh" ? "参考 FOB 价格" : language === "ar" ? "سعر FOB" : "Reference FOB Price";
  return `${prefix} USD ${Number(vehicle.public_reference_fob_price_usd).toLocaleString("en-US")}`;
};

const statusLabel = (vehicle) => vehicle.publication_status === "SOLD" ? (language === "ru" ? "Продано" : language === "zh" ? "已售出" : language === "ar" ? "تم البيع" : "Sold") : vehicle.sourcing_status === "IN_STOCK" ? t("inStock", "In Stock") : t("sourceStatus", "Available to Source");

function applyTranslations() {
  document.documentElement.lang = language;
  // 阿拉伯语 RTL 排版支持
  if (language === "ar") {
    document.documentElement.dir = "rtl";
    document.body.classList.add("rtl-layout");
  } else {
    document.documentElement.dir = "ltr";
    document.body.classList.remove("rtl-layout");
  }

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.dataset.i18nEn ||= node.textContent;
    node.textContent = t(node.dataset.i18n, node.dataset.i18nEn);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((node) => {
    node.dataset.i18nHtmlEn ||= node.innerHTML;
    node.innerHTML = t(node.dataset.i18nHtml, node.dataset.i18nHtmlEn);
  });

  // 更新语言下拉框与快速按钮
  const selector = document.querySelector("#languageSelect");
  if (selector) selector.value = language;
  const toggle = document.querySelector("#languageToggle");
  if (toggle) toggle.innerHTML = language === "en" ? "EN / <b>RU</b>" : "<b>EN</b> / RU";

  // 更新 WhatsApp 浮动按钮文本
  document.querySelectorAll(".wa").forEach((btn) => {
    const defaultMsg = btn.dataset.message || "Hello RoadReach Auto, I would like an export quotation.";
    const waUrl = `https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(defaultMsg)}`;
    btn.setAttribute("href", waUrl);
    btn.setAttribute("target", "_blank");
    btn.setAttribute("rel", "noopener noreferrer");
  });
}

function card(vehicle) {
  const images = Array.isArray(vehicle.images) ? vehicle.images : [];
  const image = safeUrl(images[0]?.url || fallbackImage);
  const statusClass = vehicle.publication_status === "SOLD" ? "sold" : vehicle.sourcing_status === "AVAILABLE_TO_SOURCE" ? "source" : "";
  const vin = vehicle.sourcing_status === "IN_STOCK" && vehicle.masked_vin ? `<p class="vin-line">VIN: ${escapeHtml(vehicle.masked_vin)}</p>` : "";
  const cta = vehicle.publication_status === "SOLD" ? t("findSimilar", "Find Similar Vehicle →") : t("askForQuote", "Ask for Quote →");
  
  // WhatsApp 一键直连带车源
  const waCarMsg = `Hello RoadReach Auto, I am interested in Stock ${vehicle.stock_id} (${vehicle.brand} ${vehicle.model} ${vehicle.year}). Please share the full details.`;
  const waCarUrl = `https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(waCarMsg)}`;

  return `<article class="vehicle-card"><div class="vehicle-image"><img src="${escapeHtml(image)}" alt="${escapeHtml(`${vehicle.brand} ${vehicle.model}`)}"><span class="year-badge">${escapeHtml(vehicle.year)}</span><span class="vehicle-status ${statusClass}">${escapeHtml(statusLabel(vehicle))}</span></div><div class="vehicle-body"><p class="vehicle-type">${escapeHtml(vehicle.body_type)}<span class="stock-id">${escapeHtml(vehicle.stock_id)}</span>${vehicle.featured ? '<span class="featured-flag">FEATURED</span>' : ""}</p><h3>${escapeHtml(`${vehicle.brand} ${vehicle.model}`)}</h3><div class="specs"><span>${escapeHtml(vehicle.fuel_type)}</span><span>${escapeHtml(vehicle.steering)}</span>${vehicle.mileage == null ? "" : `<span>${Number(vehicle.mileage).toLocaleString("en-US")} km</span>`}</div>${vin}<div class="price-row"><b>${escapeHtml(formatPrice(vehicle))}</b><div class="card-actions"><button class="detail-link" data-vehicle-id="${escapeHtml(vehicle.id)}">${cta}</button><a class="card-wa-btn" href="${waCarUrl}" target="_blank" rel="noopener noreferrer" title="Inquire on WhatsApp">💬</a></div></div><small class="price-note">${escapeHtml(t("priceDisclaimer", "Final quotation may vary depending on vehicle condition/configuration, quantity, purchase timing and destination requirements."))}</small></div></article>`;
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
  if (!form) return;
  for (const field of ["brand", "model", "year", "fuel_type", "body_type"]) {
    const select = form.elements[field];
    if (!select) continue;
    const values = [...new Set(vehicles.filter((v) => v.publication_status !== "SOLD").map((v) => String(v[field] ?? "")).filter(Boolean))].sort((a, b) => field === "year" ? Number(b) - Number(a) : a.localeCompare(b));
    select.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
    values.forEach((value) => select.add(new Option(value, value)));
  }
}

function renderInventory() {
  const form = document.querySelector("#inventoryFilters");
  const data = form ? new FormData(form) : new FormData();
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
  if (grid) {
    grid.innerHTML = available.length ? available.map(card).join("") : `<div class="stock-message">${language === "ru" ? "Нет автомобилей по выбранным фильтрам." : language === "zh" ? "没有符合当前筛选条件的车辆。" : "No available vehicles match these filters."}</div>`;
  }
  const featured = available.filter((vehicle) => vehicle.featured);
  const featBlock = document.querySelector("#featuredBlock");
  if (featBlock) {
    featBlock.hidden = !featured.length;
    document.querySelector("#featuredGrid").innerHTML = featured.map(card).join("");
  }
  const sold = vehicles.filter((vehicle) => vehicle.publication_status === "SOLD");
  const soldSection = document.querySelector("#recentlySold");
  if (soldSection) {
    soldSection.hidden = !sold.length;
    document.querySelector("#soldGrid").innerHTML = sold.map(card).join("");
  }
  bindVehicleButtons();
  bindVehicleImageFallbacks();
}

function openVehicle(id) {
  const vehicle = vehicles.find((item) => item.id === id);
  if (!vehicle) return;
  const images = (Array.isArray(vehicle.images) && vehicle.images.length ? vehicle.images : [{ url: fallbackImage }]).slice(0, 15);
  const notes = (language === "ru" && vehicle.vehicle_notes_ru) ? vehicle.vehicle_notes_ru : vehicle.vehicle_notes_en;
  const details = [
    [t("year", "Year"), vehicle.year],
    [t("fuel", "Fuel type"), vehicle.fuel_type],
    [t("steering", "Steering"), vehicle.steering],
    [t("body", "Body type"), vehicle.body_type],
    [t("mileageLabel", "Mileage"), vehicle.mileage == null ? "—" : `${Number(vehicle.mileage).toLocaleString("en-US")} km`],
    [t("colorLabel", "Exterior"), vehicle.exterior_color],
    ["Stock ID", vehicle.stock_id],
    ["VIN", vehicle.sourcing_status === "IN_STOCK" ? vehicle.masked_vin : null]
  ].filter(([,value]) => value);

  const waCarMsg = `Hello RoadReach Auto, I am interested in Stock ${vehicle.stock_id} (${vehicle.brand} ${vehicle.model} ${vehicle.year}). Please send CIF quotation.`;
  const waCarUrl = `https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(waCarMsg)}`;

  document.querySelector("#modalContent").innerHTML = `
    <div class="modal-gallery">${images.map((image, index) => `<img src="${escapeHtml(safeUrl(image.url))}" alt="${escapeHtml(`${vehicle.brand} ${vehicle.model} photo ${index + 1}`)}">`).join("")}</div>
    <div class="modal-info">
      <p class="vehicle-type">${escapeHtml(vehicle.body_type)}<span class="stock-id">${escapeHtml(vehicle.stock_id)}</span><span class="featured-flag">${escapeHtml(statusLabel(vehicle))}</span></p>
      <h2>${escapeHtml(`${vehicle.brand} ${vehicle.model}`)}</h2>
      ${notes ? `<p class="vehicle-desc">${escapeHtml(notes)}</p>` : ""}
      <div class="modal-specs">${details.map(([label,value]) => `<div><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join("")}</div>
      ${vehicle.condition ? `<div class="condition-box"><b>${t("conditionLabel", "Condition statement")}</b><br>${escapeHtml(vehicle.condition)}</div>` : ""}
      <p class="price-note">${escapeHtml(t("priceDisclaimer", "Final quotation may vary depending on vehicle condition/configuration, quantity, purchase timing and destination requirements."))}</p>
      <div class="modal-actions">
        <strong>${escapeHtml(formatPrice(vehicle))}</strong>
        <div class="modal-buttons">
          <button class="button" type="button" id="modalInquiryButton">${vehicle.publication_status === "SOLD" ? t("findSimilar", "Find Similar Vehicle →") : t("askForQuote", "Ask for Quote →")}</button>
          <a class="button button-whatsapp" href="${waCarUrl}" target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>
        </div>
      </div>
    </div>`;

  bindVehicleImageFallbacks(document.querySelector("#modalContent"));
  document.querySelector("#modalInquiryButton").addEventListener("click", () => startInquiry(vehicle));
  document.querySelector("#vehicleModal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function startInquiry(vehicle) {
  closeModal();
  const form = document.querySelector("#inquiryForm");
  if (!form) return;
  form.elements.vehicle_id.value = vehicle.publication_status === "SOLD" ? "" : vehicle.id;
  form.elements.stock_id.value = vehicle.stock_id;
  form.elements.preferred_model.value = `${vehicle.brand} ${vehicle.model}`;
  form.elements.message.value = vehicle.publication_status === "SOLD" ? `Please find a similar vehicle to sold stock ${vehicle.stock_id}.` : `Please send the FOB/CIF quotation and full details for stock ${vehicle.stock_id}.`;
  document.querySelector("#inquiry").scrollIntoView({ behavior: "smooth" });
}

function closeModal() {
  document.querySelector("#vehicleModal").classList.remove("open");
  document.body.style.overflow = "";
}

// 核心常驻车源库 (确保领克 02 始终稳居首位展示，绝不丢失)
const permanentVehicles = [
  {
    id: "lynkco-02-2019",
    stock_id: "RR-0002",
    brand: "Lynk & Co",
    model: "02 1.5T DCT Pro",
    year: 2019,
    body_type: "SUV",
    fuel_type: "Gasoline",
    steering: "LHD",
    mileage: 48000,
    exterior_color: "Grey",
    interior_color: "Black",
    condition: "Verified condition. One panel repainted, zero accident history, certified by ChaDoctor. Ready for export.",
    sourcing_status: "IN_STOCK",
    publication_status: "PUBLISHED",
    public_reference_fob_price_usd: null, // 不写价格，自动显示为 Reference FOB Price on request
    vehicle_notes_en: "Inspected 2019 Lynk & Co 02 1.5T in pristine condition. Left-hand drive (LHD), ready for international export. One panel repainted, zero accident history, verified by independent inspection.",
    vehicle_notes_ru: "Проверенный автомобиль 2019 Lynk & Co 02 1.5T в отличном техническом состоянии. Левый руль (LHD), готов к экспорту из Китая. Без ДТП, независимый сертификат качества.",
    masked_vin: "LB3714A8****3219",
    featured: true,
    published_at: "2026-09-25T12:00:00Z",
    images: [
      { url: "assets/vehicles/rr-0002/rr-0002-1.webp", alt: "Lynk & Co 02 Front Angle" },
      { url: "assets/vehicles/rr-0002/rr-0002-2.webp", alt: "Lynk & Co 02 Side Angle" },
      { url: "assets/vehicles/rr-0002/rr-0002-3.webp", alt: "Lynk & Co 02 Front View" },
      { url: "assets/vehicles/rr-0002/rr-0002-4.webp", alt: "Lynk & Co 02 Rear Angle" },
      { url: "assets/vehicles/rr-0002/rr-0002-5.webp", alt: "Lynk & Co 02 Rear Side" },
      { url: "assets/vehicles/rr-0002/rr-0002-6.webp", alt: "Lynk & Co 02 Rear View" },
      { url: "assets/vehicles/rr-0002/rr-0002-7.webp", alt: "Lynk & Co 02 Cockpit & Steering" },
      { url: "assets/vehicles/rr-0002/rr-0002-8.webp", alt: "Lynk & Co 02 Center Console & Interior" },
      { url: "assets/vehicles/rr-0002/rr-0002-9.webp", alt: "Lynk & Co 02 Rear Seats" }
    ]
  },
  {
    id: "wildlander-2024",
    stock_id: "RR-TY-WL-001",
    brand: "Toyota",
    model: "Wildlander Hybrid 2.5L Plus 2WD Luxury",
    year: 2024,
    body_type: "SUV",
    fuel_type: "HEV",
    steering: "LHD",
    mileage: 26800,
    exterior_color: "Black",
    interior_color: "Black",
    condition: "Original paint, zero accidents, certified pre-owned condition.",
    sourcing_status: "IN_STOCK",
    publication_status: "PUBLISHED",
    public_reference_fob_price_usd: null,
    vehicle_notes_en: "2024 Toyota Wildlander Hybrid in showroom condition. Low mileage, highly reliable hybrid powertrain, ready for immediate export.",
    vehicle_notes_ru: "2024 Toyota Wildlander Hybrid в идеальном состоянии. Малый пробег, надежный гибридный двигатель, готов к отправке.",
    masked_vin: "LVGB1234****6789",
    featured: true,
    published_at: "2026-09-24T12:00:00Z",
    images: [
      { url: "assets/rr-0001-cover.svg", alt: "Toyota Wildlander Exterior" }
    ]
  },
  {
    id: "accord-2016",
    stock_id: "RR-ACCORD-2016-0901",
    brand: "Honda",
    model: "Accord 2.0 CVT Elite",
    year: 2016,
    body_type: "Sedan",
    fuel_type: "Gasoline",
    steering: "LHD",
    mileage: 110000,
    exterior_color: "Black",
    interior_color: "Black",
    condition: "Clean sedan with complete maintenance history, fuel efficient and robust.",
    sourcing_status: "IN_STOCK",
    publication_status: "PUBLISHED",
    public_reference_fob_price_usd: null,
    vehicle_notes_en: "2016 Honda Accord 2.0 CVT Elite. Reliable executive sedan with smooth transmission and great fuel economy.",
    vehicle_notes_ru: "2016 Honda Accord 2.0 CVT Elite. Надежный представительский седан с отличной экономичностью.",
    masked_vin: "LHGCR265****5521",
    featured: false,
    published_at: "2026-09-23T12:00:00Z",
    images: [
      { url: "assets/rr-0001-exterior.svg", alt: "Honda Accord Exterior" }
    ]
  }
];

async function loadInventory() {
  let remoteList = [];
  if (client) {
    try {
      const { data, error } = await client.from("public_vehicle_catalog").select("*").order("featured", { ascending: false }).order("published_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        remoteList = data;
      }
    } catch (e) {
      console.warn("Supabase query failed, falling back to permanent catalogue", e);
    }
  }

  // 智能合并：优先使用 remoteList，若 remoteList 中尚未录入 RR-0002 (领克 02)，自动置顶追加
  const list = [...remoteList];
  for (const car of permanentVehicles) {
    if (!list.some(v => v.stock_id === car.stock_id)) {
      list.unshift(car);
    }
  }

  vehicles = list;
  populateFilters();
  renderInventory();
}

async function submitInquiry(form) {
  const status = form.querySelector(".form-status"), button = form.querySelector('button[type="submit"]');
  status.classList.remove("error"); status.textContent = "";
  if (!client) {
    // 降级支持：没有 Supabase 时直接引导客户 WhatsApp 咨询
    const data = new FormData(form);
    const msg = `Hello RoadReach Auto! Inquiry from ${data.get("name") || "Customer"} (${data.get("country") || ""}): Model: ${data.get("preferred_model") || ""} Budget: $${data.get("target_budget") || ""}`;
    window.open(`https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(msg)}`, "_blank");
    status.textContent = "Redirecting to WhatsApp for instant quote...";
    return;
  }
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
    status.textContent = language === "ru" ? "Спасибо. Запрос сохранён, и команда RoadReach свяжется с вами." : language === "zh" ? "感谢您的询盘。RoadReach 团队将尽快与您联系！" : "Thank you. Your inquiry was saved and the RoadReach team will follow up.";
  } catch (error) { status.classList.add("error"); status.textContent = error.message || "Your inquiry could not be saved. Please try again."; }
  finally { button.disabled = false; }
}

function initLanguageSelector() {
  const selector = document.querySelector("#languageSelect");
  if (selector) {
    selector.addEventListener("change", (e) => {
      language = e.target.value;
      localStorage.setItem("roadreach-language", language);
      applyTranslations();
      renderInventory();
    });
  }
  const toggle = document.querySelector("#languageToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      language = language === "en" ? "ru" : "en";
      localStorage.setItem("roadreach-language", language);
      applyTranslations();
      renderInventory();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initLanguageSelector();
  applyTranslations();
  loadInventory();

  const filterForm = document.querySelector("#inventoryFilters");
  if (filterForm) {
    filterForm.addEventListener("change", renderInventory);
    filterForm.addEventListener("reset", () => setTimeout(renderInventory, 0));
  }

  const modalClose = document.querySelector("#modalClose");
  if (modalClose) modalClose.addEventListener("click", closeModal);

  const quoteForm = document.querySelector(".quote-form[data-compact='true']");
  if (quoteForm) quoteForm.addEventListener("submit", (e) => { e.preventDefault(); submitInquiry(quoteForm); });

  const inquiryForm = document.querySelector("#inquiryForm");
  if (inquiryForm) inquiryForm.addEventListener("submit", (e) => { e.preventDefault(); submitInquiry(inquiryForm); });
});

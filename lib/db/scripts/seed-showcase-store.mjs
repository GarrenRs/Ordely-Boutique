import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;

const STORE_SLUG = process.env.SHOWCASE_STORE_SLUG ?? "ordely-showcase";
const STORE_NAME = process.env.SHOWCASE_STORE_NAME ?? "Ordely Showcase";
const STORE_OWNER = process.env.SHOWCASE_OWNER_NAME ?? "تاجر العرض";
const STORE_PHONE = process.env.SHOWCASE_PHONE ?? "0549990984";
const STORE_CITY = process.env.SHOWCASE_CITY ?? "الجزائر";
const STORE_LOGO_URL = process.env.SHOWCASE_LOGO_URL ?? "/favicon.svg";
const LOGIN_EMAIL = (process.env.SHOWCASE_EMAIL ?? "showcase@ordely.local").trim().toLowerCase();
const LOGIN_PASSWORD = process.env.SHOWCASE_PASSWORD;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

if (!LOGIN_PASSWORD) {
  throw new Error("SHOWCASE_PASSWORD must be set before seeding the showcase merchant");
}

const PRODUCT_IMAGE_PARAMS = "auto=format&fit=crop&w=1400&q=85";

const img = (id) => `https://images.unsplash.com/${id}?${PRODUCT_IMAGE_PARAMS}`;

const OPTION_LABEL = "__label:";

const categories = [
  { key: "perfumes", name: "العطور", slug: "perfumes", isDefault: true, sortOrder: 0 },
  { key: "home", name: "الديكور والمنزل", slug: "home-decor", sortOrder: 10 },
  { key: "appliances", name: "الأجهزة الصغيرة", slug: "small-appliances", sortOrder: 20 },
  { key: "professional", name: "معدات مهنية", slug: "professional-tools", sortOrder: 30 },
  { key: "fashion", name: "إكسسوارات", slug: "fashion-accessories", sortOrder: 40 },
];

const products = [
  {
    key: "sovage",
    categoryKey: "perfumes",
    productName: "SOVAGE PURE",
    slug: "sovage-pure",
    price: "4500.00",
    description: "عطر رجالي بطابع خشبي منعش، مناسب للاستعمال اليومي والمناسبات. اختيار ممتاز لمن يريد رائحة ثابتة وواضحة بدون مبالغة.",
    template: "bold",
    themeColor: "#111827",
    galleryDisplay: "carousel",
    transportMode: "DELIVERY_COMPANY",
    deliveryInfo: "تغليف محكم مع إمكانية التوصيل للمكتب أو المنزل حسب الولاية.",
    productImages: [
      img("photo-1594035910387-fea47794261f"),
      img("photo-1541643600914-78b084683601"),
      img("photo-1592945403244-b3fbafd7f539"),
    ],
    primaryOptions: ["موديل", "Classic", "Intense", "Night"],
    secondaryOptions: ["لون", "أسود", "فضي"],
  },
  {
    key: "rose-mist",
    categoryKey: "perfumes",
    productName: "LINA ROSE MIST",
    slug: "lina-rose-mist",
    price: "3900.00",
    description: "رائحة ناعمة بلمسة وردية أنيقة، خفيفة على اليوم ومناسبة للهدايا. المنتج يظهر في صفحة طلب بسيطة وواضحة للزبونة.",
    template: "minimal",
    themeColor: "#db2777",
    galleryDisplay: "grid",
    transportMode: "DELIVERY_COMPANY",
    deliveryInfo: "توصيل متاح للولايات المفعلة مع حماية للعبوة داخل التغليف.",
    productImages: [
      img("photo-1592945403244-b3fbafd7f539"),
      img("photo-1594035910387-fea47794261f"),
      img("photo-1541643600914-78b084683601"),
    ],
    primaryOptions: ["نوع", "ناعم", "قوي"],
    secondaryOptions: ["لون", "وردي", "ذهبي"],
  },
  {
    key: "wood-decor",
    categoryKey: "home",
    productName: "طقم ديكور خشبي راقي",
    slug: "wood-decor-set",
    price: "6800.00",
    description: "طقم ديكور بسيط يضيف لمسة دافئة للصالون أو المكتب. مناسب للصور الإعلانية وللزبائن الذين يحبون المنتجات المنزلية المرتبة.",
    template: "classic",
    themeColor: "#ea580c",
    galleryDisplay: "grid",
    transportMode: "DELIVERY_COMPANY",
    deliveryInfo: "يتم شحن الطقم داخل صندوق محمي لتفادي الخدوش.",
    productImages: [
      img("photo-1586023492125-27b2c045efd7"),
      img("photo-1616486338812-3dadae4b4ace"),
      img("photo-1618220179428-22790b461013"),
    ],
    primaryOptions: ["خامة", "خشب طبيعي", "خشب مطلي"],
    secondaryOptions: ["لون", "بني", "أبيض", "أسود"],
  },
  {
    key: "office-chair",
    categoryKey: "home",
    productName: "كرسي مكتب مريح",
    slug: "ergonomic-office-chair",
    price: "18500.00",
    description: "كرسي عملي للعمل الطويل والدراسة، قاعدة قوية ومسند مريح. هذا المنتج يستعمل نظام التسليم والاستلام اليدوي لأنه يحتاج تنسيقًا خاصًا.",
    template: "bold",
    themeColor: "#0f172a",
    galleryDisplay: "carousel",
    transportMode: "SHED_MED",
    deliveryInfo: "تسليم واستلام يدوي بعد الاتفاق مع الزبون حسب الولاية والموعد.",
    productImages: [
      img("photo-1555041469-a586c61ea9bc"),
      img("photo-1586023492125-27b2c045efd7"),
      img("photo-1618220179428-22790b461013"),
    ],
    primaryOptions: ["خامة", "قماش", "جلد صناعي"],
    secondaryOptions: ["لون", "أسود", "رمادي"],
  },
  {
    key: "coffee-machine",
    categoryKey: "appliances",
    productName: "ماكينة قهوة منزلية",
    slug: "home-coffee-machine",
    price: "14500.00",
    description: "ماكينة قهوة صغيرة للمطبخ أو المكتب، مناسبة للزبائن الذين يبحثون عن منتج واضح وسهل الطلب عبر صفحة واحدة.",
    template: "classic",
    themeColor: "#166534",
    galleryDisplay: "carousel",
    transportMode: "DELIVERY_COMPANY",
    deliveryInfo: "توصيل للمكتب والمنزل حسب الولاية مع متابعة حالة الطلب.",
    productImages: [
      img("photo-1514432324607-a09d9b4aefdd"),
      img("photo-1495474472287-4d71bcdd2085"),
      img("photo-1511920170033-f8396924c348"),
    ],
    primaryOptions: ["موديل", "Basic", "Pro"],
    secondaryOptions: ["لون", "أسود", "فضي"],
  },
  {
    key: "leather-bag",
    categoryKey: "fashion",
    productName: "حقيبة يد جلدية",
    slug: "leather-handbag",
    price: "7200.00",
    description: "حقيبة أنيقة للاستعمال اليومي، تظهر في صفحة طلب نظيفة تسمح للزبونة باختيار اللون وإرسال الطلب بسرعة.",
    template: "minimal",
    themeColor: "#dc2626",
    galleryDisplay: "grid",
    transportMode: "DELIVERY_COMPANY",
    deliveryInfo: "توصيل متاح للولايات المفعلة مع إمكانية الدفع عند الاستلام.",
    productImages: [
      img("photo-1590874103328-eac38a683ce7"),
      img("photo-1548036328-c9fa89d128fa"),
      img("photo-1584917865442-de89df76afd3"),
    ],
    primaryOptions: ["نوع", "يدوية", "كتف"],
    secondaryOptions: ["لون", "أسود", "بني", "أحمر"],
  },
  {
    key: "tool-organizer",
    categoryKey: "professional",
    productName: "منظم أدوات مهني كبير",
    slug: "professional-tool-organizer",
    price: "12900.00",
    description: "حل عملي لأصحاب الورش والمهن الحرة. المنتج كبير نسبيًا لذلك يعتمد على تسليم واستلام يدوي مع بقاء دورة الطلب نفسها داخل النظام.",
    template: "bold",
    themeColor: "#1d4ed8",
    galleryDisplay: "carousel",
    transportMode: "SHED_MED",
    deliveryInfo: "يتم الاتفاق على نقطة التسليم بعد تأكيد الطلب من اللوحة.",
    productImages: [
      img("photo-1504148455328-c376907d081c"),
      img("photo-1581092918056-0c4c3acd3789"),
      img("photo-1581092580497-e0d23cbdf1dc"),
    ],
    primaryOptions: ["موديل", "Standard", "Workshop"],
    secondaryOptions: ["لون", "أسود", "أزرق"],
  },
  {
    key: "kitchen-mixer",
    categoryKey: "appliances",
    productName: "خلاط مطبخ ستانلس",
    slug: "stainless-kitchen-mixer",
    price: "9800.00",
    description: "خلاط مطبخ عملي بواجهة نظيفة وصورة واضحة، مناسب لإظهار كيف يتعامل Ordely مع منتجات منزلية متنوعة.",
    template: "classic",
    themeColor: "#7c3aed",
    galleryDisplay: "carousel",
    transportMode: "DELIVERY_COMPANY",
    deliveryInfo: "تغليف جيد وتوصيل حسب الولايات المفعلة.",
    productImages: [
      img("photo-1556911220-bff31c812dba"),
      img("photo-1556911261-6bd341186b2f"),
      img("photo-1556909114-f6e7ad7d3136"),
    ],
    primaryOptions: ["موديل", "Compact", "Family"],
    secondaryOptions: ["لون", "فضي", "أبيض"],
  },
];

const wilayas = [
  ["01", "أدرار"],
  ["02", "الشلف"],
  ["03", "الأغواط"],
  ["04", "أم البواقي"],
  ["05", "باتنة"],
  ["06", "بجاية"],
  ["07", "بسكرة"],
  ["08", "بشار"],
  ["09", "البليدة"],
  ["10", "البويرة"],
  ["11", "تمنراست"],
  ["12", "تبسة"],
  ["13", "تلمسان"],
  ["14", "تيارت"],
  ["15", "تيزي وزو"],
  ["16", "الجزائر"],
  ["17", "الجلفة"],
  ["18", "جيجل"],
  ["19", "سطيف"],
  ["20", "سعيدة"],
  ["21", "سكيكدة"],
  ["22", "سيدي بلعباس"],
  ["23", "عنابة"],
  ["24", "قالمة"],
  ["25", "قسنطينة"],
  ["26", "المدية"],
  ["27", "مستغانم"],
  ["28", "المسيلة"],
  ["29", "معسكر"],
  ["30", "ورقلة"],
  ["31", "وهران"],
  ["32", "البيض"],
  ["33", "إليزي"],
  ["34", "برج بوعريريج"],
  ["35", "بومرداس"],
  ["36", "الطارف"],
  ["37", "تندوف"],
  ["38", "تيسمسيلت"],
  ["39", "الوادي"],
  ["40", "خنشلة"],
  ["41", "سوق أهراس"],
  ["42", "تيبازة"],
  ["43", "ميلة"],
  ["44", "عين الدفلى"],
  ["45", "النعامة"],
  ["46", "عين تيموشنت"],
  ["47", "غرداية"],
  ["48", "غليزان"],
  ["49", "تيميمون"],
  ["50", "برج باجي مختار"],
  ["51", "أولاد جلال"],
  ["52", "بني عباس"],
  ["53", "عين صالح"],
  ["54", "عين قزام"],
  ["55", "تقرت"],
  ["56", "جانت"],
  ["57", "المغير"],
  ["58", "المنيعة"],
];

const activeFees = new Map([
  ["16", { officeFee: 450, homeFee: 250, returnFee: 200 }],
  ["09", { officeFee: 500, homeFee: 300, returnFee: 220 }],
  ["31", { officeFee: 650, homeFee: 350, returnFee: 260 }],
  ["25", { officeFee: 650, homeFee: 350, returnFee: 260 }],
  ["19", { officeFee: 700, homeFee: 350, returnFee: 280 }],
  ["23", { officeFee: 700, homeFee: 350, returnFee: 280 }],
  ["06", { officeFee: 750, homeFee: 400, returnFee: 300 }],
  ["15", { officeFee: 700, homeFee: 350, returnFee: 280 }],
  ["35", { officeFee: 500, homeFee: 300, returnFee: 220 }],
  ["42", { officeFee: 550, homeFee: 300, returnFee: 230 }],
  ["05", { officeFee: 780, homeFee: 420, returnFee: 320 }],
  ["17", { officeFee: 800, homeFee: 450, returnFee: 340 }],
  ["07", { officeFee: 850, homeFee: 500, returnFee: 360 }],
  ["30", { officeFee: 950, homeFee: 550, returnFee: 400 }],
  ["47", { officeFee: 950, homeFee: 550, returnFee: 400 }],
  ["22", { officeFee: 700, homeFee: 400, returnFee: 300 }],
  ["13", { officeFee: 750, homeFee: 420, returnFee: 320 }],
  ["18", { officeFee: 750, homeFee: 420, returnFee: 320 }],
  ["21", { officeFee: 760, homeFee: 420, returnFee: 320 }],
  ["27", { officeFee: 680, homeFee: 380, returnFee: 290 }],
  ["28", { officeFee: 760, homeFee: 430, returnFee: 320 }],
  ["29", { officeFee: 720, homeFee: 400, returnFee: 300 }],
  ["48", { officeFee: 720, homeFee: 400, returnFee: 300 }],
  ["10", { officeFee: 650, homeFee: 350, returnFee: 260 }],
  ["24", { officeFee: 760, homeFee: 420, returnFee: 320 }],
  ["43", { officeFee: 750, homeFee: 420, returnFee: 320 }],
]);

const disabledCommunes = [
  ["16", "بابا حسن", "درارية"],
  ["16", "الرحمانية", "زرالدة"],
  ["31", "مسرغين", "بوتليليس"],
  ["25", "عين السمارة", "قسنطينة"],
  ["06", "بني كسيلة", "أدكار"],
  ["30", "حاسي مسعود", "حاسي مسعود"],
  ["47", "زلفانة", "زلفانة"],
];

const customers = [
  { key: "amina", name: "أمينة ب.", phone: "0599000101", city: "الجزائر", notes: "زبونة تفضل التواصل عبر واتساب قبل الشحن." },
  { key: "yasser", name: "ياسر ك.", phone: "0599000102", city: "وهران", notes: "عميل يطلب للمتجر والمكتب." },
  { key: "salma", name: "سلمى ر.", phone: "0599000103", city: "البليدة", notes: "طلبت أكثر من منتج خلال هذا الشهر." },
  { key: "mourad", name: "مراد ح.", phone: "0599000104", city: "سطيف", notes: "يحتاج تأكيد العنوان قبل الإرسال." },
  { key: "nadir", name: "نذير ع.", phone: "0599000105", city: "عنابة", notes: "يفضل التوصيل إلى المكتب." },
  { key: "hana", name: "هناء م.", phone: "0599000106", city: "بجاية", notes: "زبونة مهتمة بمنتجات الديكور." },
  { key: "sofiane", name: "سفيان د.", phone: "0599000107", city: "قسنطينة", notes: "يطلب تجهيزات أكبر عبر تسليم يدوي." },
  { key: "ikram", name: "إكرام س.", phone: "0599000108", city: "تيبازة", notes: "تسأل دائمًا عن مدة التوصيل." },
  { key: "kamel", name: "كمال ف.", phone: "0599000109", city: "باتنة", notes: "عميل يحتاج متابعة دقيقة قبل الشحن." },
  { key: "mouna", name: "منى ل.", phone: "0599000110", city: "غرداية", notes: "طلب بعيد يحتاج سعر توصيل واضح." },
  { key: "reda", name: "رضا ب.", phone: "0599000111", city: "بومرداس", notes: "طلبه مؤكد عادة بعد اتصال قصير." },
  { key: "lyna", name: "لينا ت.", phone: "0599000112", city: "تلمسان", notes: "تهتم بتغليف الهدايا." },
];

const orderSeeds = [
  { customer: "amina", product: "sovage", status: "NEW", wilaya: "16", method: "HOME", quantity: 1, primary: "Classic", secondary: "أسود", hoursAgo: 1, note: "طلب جديد من إعلان فيسبوك." },
  { customer: "salma", product: "rose-mist", status: "NEW", wilaya: "09", method: "OFFICE", quantity: 2, primary: "ناعم", secondary: "وردي", hoursAgo: 2, note: "تريد تأكيد اللون قبل الشحن." },
  { customer: "yasser", product: "coffee-machine", status: "PENDING_CONFIRMATION", wilaya: "31", method: "HOME", quantity: 1, primary: "Pro", secondary: "أسود", hoursAgo: 4, note: "تمت محاولة الاتصال الأولى." },
  { customer: "hana", product: "wood-decor", status: "PENDING_CONFIRMATION", wilaya: "06", method: "OFFICE", quantity: 1, primary: "خشب طبيعي", secondary: "بني", hoursAgo: 6, note: "ينتظر تأكيد البلدية." },
  { customer: "mourad", product: "sovage", status: "CONFIRMED", wilaya: "19", method: "HOME", quantity: 1, primary: "Intense", secondary: "فضي", hoursAgo: 10, note: "أكد العنوان والطلب جاهز للشحن." },
  { customer: "reda", product: "leather-bag", status: "CONFIRMED", wilaya: "35", method: "OFFICE", quantity: 1, primary: "كتف", secondary: "بني", hoursAgo: 12, note: "تم التأكيد عبر واتساب." },
  { customer: "nadir", product: "kitchen-mixer", status: "SHIPPED", wilaya: "23", method: "OFFICE", quantity: 1, primary: "Family", secondary: "فضي", hoursAgo: 22, note: "خرج مع شركة التوصيل صباحًا." },
  { customer: "ikram", product: "rose-mist", status: "SHIPPED", wilaya: "42", method: "HOME", quantity: 1, primary: "قوي", secondary: "ذهبي", hoursAgo: 24, note: "بانتظار اتصال الموزع." },
  { customer: "sofiane", product: "office-chair", status: "SHIPPED", wilaya: "25", method: "OFFICE", quantity: 1, primary: "جلد صناعي", secondary: "أسود", hoursAgo: 30, note: "تسليم يدوي: موعد مبدئي بعد الظهر." },
  { customer: "mouna", product: "coffee-machine", status: "DELIVERED", wilaya: "47", method: "HOME", quantity: 1, primary: "Basic", secondary: "فضي", hoursAgo: 42, note: "تم التسليم والدفع." },
  { customer: "kamel", product: "wood-decor", status: "DELIVERED", wilaya: "05", method: "HOME", quantity: 1, primary: "خشب مطلي", secondary: "أبيض", hoursAgo: 54, note: "تسليم ناجح بعد تأكيد العنوان." },
  { customer: "lyna", product: "leather-bag", status: "DELIVERED", wilaya: "13", method: "OFFICE", quantity: 2, primary: "يدوية", secondary: "أحمر", hoursAgo: 72, note: "زبونة راضية وطلبت رابط منتج آخر." },
  { customer: "mourad", product: "tool-organizer", status: "RETURNED", wilaya: "19", method: "OFFICE", quantity: 1, primary: "Workshop", secondary: "أزرق", hoursAgo: 96, note: "استرجاع بسبب تغيير في المقاس المطلوب للمكان." },
  { customer: "nadir", product: "sovage", status: "RETURNED", wilaya: "23", method: "OFFICE", quantity: 1, primary: "Night", secondary: "أسود", hoursAgo: 108, note: "لم يرد على اتصال شركة التوصيل." },
  { customer: "salma", product: "kitchen-mixer", status: "CANCELLED", wilaya: "09", method: "HOME", quantity: 1, primary: "Compact", secondary: "أبيض", hoursAgo: 8, note: "إلغاء قبل التأكيد بطلب من الزبونة." },
  { customer: "yasser", product: "office-chair", status: "CANCELLED", wilaya: "31", method: "OFFICE", quantity: 1, primary: "قماش", secondary: "رمادي", hoursAgo: 36, note: "ألغى بعد تغيير موعد التسليم." },
  { customer: "amina", product: "leather-bag", status: "REJECTED", wilaya: "16", method: "HOME", quantity: 1, primary: "كتف", secondary: "أسود", hoursAgo: 14, note: "رقم الهاتف غير مؤكد بعد المراجعة." },
  { customer: "sofiane", product: "tool-organizer", status: "REJECTED", wilaya: "25", method: "OFFICE", quantity: 1, primary: "Standard", secondary: "أسود", hoursAgo: 18, note: "رفض بسبب عدم توافق نقطة التسليم." },
  { customer: "ikram", product: "wood-decor", status: "CONFIRMED", wilaya: "42", method: "HOME", quantity: 1, primary: "خشب طبيعي", secondary: "أبيض", hoursAgo: 5, note: "جاهز للشحن في أقرب دورة." },
  { customer: "reda", product: "coffee-machine", status: "NEW", wilaya: "35", method: "OFFICE", quantity: 1, primary: "Basic", secondary: "أسود", hoursAgo: 0.5, note: "طلب سريع من المتجر العام." },
];

function encodeOptions(values) {
  if (!values?.length) return [];
  const [label, ...items] = values;
  return [`${OPTION_LABEL}${label}`, ...items];
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} must be set`);
  return normalized;
}

function dateHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function statusTimeline(status, createdAt) {
  const timeline = [{ action: "ORDER_CREATED", from: null, to: "NEW", at: createdAt }];
  const pending = addMinutes(createdAt, 20);
  const confirmed = addMinutes(createdAt, 45);
  const shipped = addMinutes(createdAt, 120);
  const terminal = addMinutes(createdAt, 240);

  if (status === "PENDING_CONFIRMATION") {
    timeline.push({ action: "STATUS_CHANGED", from: "NEW", to: "PENDING_CONFIRMATION", at: pending });
  }
  if (status === "CONFIRMED") {
    timeline.push({ action: "STATUS_CHANGED", from: "NEW", to: "PENDING_CONFIRMATION", at: pending });
    timeline.push({ action: "STATUS_CHANGED", from: "PENDING_CONFIRMATION", to: "CONFIRMED", at: confirmed });
  }
  if (["SHIPPED", "DELIVERED", "RETURNED"].includes(status)) {
    timeline.push({ action: "STATUS_CHANGED", from: "NEW", to: "PENDING_CONFIRMATION", at: pending });
    timeline.push({ action: "STATUS_CHANGED", from: "PENDING_CONFIRMATION", to: "CONFIRMED", at: confirmed });
    timeline.push({ action: "STATUS_CHANGED", from: "CONFIRMED", to: "SHIPPED", at: shipped });
  }
  if (status === "DELIVERED") {
    timeline.push({ action: "STATUS_CHANGED", from: "SHIPPED", to: "DELIVERED", at: terminal });
  }
  if (status === "RETURNED") {
    timeline.push({ action: "STATUS_CHANGED", from: "SHIPPED", to: "RETURNED", at: terminal });
  }
  if (status === "CANCELLED") {
    timeline.push({ action: "STATUS_CHANGED", from: "NEW", to: "CANCELLED", at: pending });
  }
  if (status === "REJECTED") {
    timeline.push({ action: "STATUS_CHANGED", from: "NEW", to: "PENDING_CONFIRMATION", at: pending });
    timeline.push({ action: "STATUS_CHANGED", from: "PENDING_CONFIRMATION", to: "REJECTED", at: confirmed });
  }

  return timeline;
}

function statusDates(status, createdAt) {
  const timeline = statusTimeline(status, createdAt);
  const dateFor = (to) => timeline.find((item) => item.to === to)?.at ?? null;
  return {
    confirmedAt: dateFor("CONFIRMED"),
    shippedAt: dateFor("SHIPPED"),
    deliveredAt: dateFor("DELIVERED"),
    returnedAt: dateFor("RETURNED"),
  };
}

async function seed() {
  const pool = new Pool({ connectionString: required(process.env.DATABASE_URL, "DATABASE_URL") });
  const client = await pool.connect();

  try {
    await client.query("begin");

    const passwordHash = await bcrypt.hash(LOGIN_PASSWORD, 12);
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const storeResult = await client.query(
      `
        insert into order_os.stores (
          name,
          slug,
          owner_name,
          phone,
          city,
          logo_url,
          is_active,
          subscription_plan_days,
          subscription_expires_at
        )
        values ($1, $2, $3, $4, $5, $6, true, 365, $7)
        on conflict (slug) do update
        set name = excluded.name,
            owner_name = excluded.owner_name,
            phone = excluded.phone,
            city = excluded.city,
            logo_url = excluded.logo_url,
            is_active = true,
            subscription_plan_days = 365,
            subscription_expires_at = excluded.subscription_expires_at,
            updated_at = now()
        returning id
      `,
      [STORE_NAME, STORE_SLUG, STORE_OWNER, STORE_PHONE, STORE_CITY, STORE_LOGO_URL, expiresAt],
    );

    const storeId = storeResult.rows[0]?.id;
    if (!storeId) throw new Error("Could not create showcase store");

    await client.query(
      `
        insert into order_os.users (store_id, email, password_hash)
        values ($1, $2, $3)
        on conflict (email) do update
        set store_id = excluded.store_id,
            password_hash = excluded.password_hash
      `,
      [storeId, LOGIN_EMAIL, passwordHash],
    );

    await client.query("delete from order_os.audit_logs where store_id = $1", [storeId]);
    await client.query("delete from order_os.orders where store_id = $1", [storeId]);
    await client.query("delete from order_os.delivery_commune_settings where store_id = $1", [storeId]);
    await client.query("delete from order_os.delivery_zones where store_id = $1", [storeId]);
    await client.query("delete from order_os.landing_pages where store_id = $1", [storeId]);
    await client.query("delete from order_os.product_categories where store_id = $1", [storeId]);
    await client.query("delete from order_os.customers where store_id = $1", [storeId]);

    const categoryIds = new Map();
    for (const category of categories) {
      const result = await client.query(
        `
          insert into order_os.product_categories (
            store_id,
            name,
            slug,
            is_default,
            is_active,
            sort_order
          )
          values ($1, $2, $3, $4, true, $5)
          returning id
        `,
        [storeId, category.name, category.slug, category.isDefault === true, category.sortOrder],
      );
      categoryIds.set(category.key, result.rows[0].id);
    }

    const productRows = new Map();
    for (const product of products) {
      const images = product.productImages;
      const result = await client.query(
        `
          insert into order_os.landing_pages (
            store_id,
            category_id,
            product_name,
            price,
            description,
            image_url,
            product_images,
            available_sizes,
            available_colors,
            gallery_display,
            theme_color,
            template,
            slug,
            transport_mode,
            delivery_info,
            whatsapp_number,
            is_active
          )
          values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, true)
          returning id, price
        `,
        [
          storeId,
          categoryIds.get(product.categoryKey),
          product.productName,
          product.price,
          product.description,
          images[0],
          JSON.stringify(images),
          JSON.stringify(encodeOptions(product.primaryOptions)),
          JSON.stringify(encodeOptions(product.secondaryOptions)),
          product.galleryDisplay,
          product.themeColor,
          product.template,
          product.slug,
          product.transportMode,
          product.deliveryInfo,
          STORE_PHONE,
        ],
      );
      productRows.set(product.key, { ...product, id: result.rows[0].id, price: Number(result.rows[0].price) });
    }

    const zoneRows = new Map();
    for (const [code, name] of wilayas) {
      const fee = activeFees.get(code);
      const result = await client.query(
        `
          insert into order_os.delivery_zones (
            store_id,
            wilaya_code,
            wilaya_name,
            home_fee,
            office_fee,
            return_fee,
            is_active
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          returning id
        `,
        [
          storeId,
          code,
          name,
          fee ? String(fee.homeFee) : null,
          fee ? String(fee.officeFee) : null,
          fee ? String(fee.returnFee) : "0",
          Boolean(fee),
        ],
      );
      zoneRows.set(code, { id: result.rows[0].id, name, ...fee });
    }

    for (const [wilayaCode, communeName, dairaName] of disabledCommunes) {
      await client.query(
        `
          insert into order_os.delivery_commune_settings (
            store_id,
            wilaya_code,
            commune_name,
            daira_name,
            is_active
          )
          values ($1, $2, $3, $4, false)
        `,
        [storeId, wilayaCode, communeName, dairaName],
      );
    }

    const customerRows = new Map();
    for (const customer of customers) {
      const result = await client.query(
        `
          insert into order_os.customers (store_id, name, phone, city, notes)
          values ($1, $2, $3, $4, $5)
          returning id
        `,
        [storeId, customer.name, customer.phone, customer.city, customer.notes],
      );
      customerRows.set(customer.key, { ...customer, id: result.rows[0].id });
    }

    for (const seedOrder of orderSeeds) {
      const product = productRows.get(seedOrder.product);
      const customer = customerRows.get(seedOrder.customer);
      const zone = zoneRows.get(seedOrder.wilaya);
      if (!product || !customer || !zone?.id) {
        throw new Error(`Invalid order seed for ${seedOrder.customer}/${seedOrder.product}/${seedOrder.wilaya}`);
      }

      const deliveryFee = product.transportMode === "SHED_MED" || seedOrder.method === "OFFICE"
        ? Number(zone.officeFee)
        : Number(zone.officeFee) + Number(zone.homeFee);
      const unitPrice = Number(product.price);
      const totalPrice = unitPrice * seedOrder.quantity;
      const createdAt = dateHoursAgo(seedOrder.hoursAgo);
      const dates = statusDates(seedOrder.status, createdAt);

      const orderResult = await client.query(
        `
          insert into order_os.orders (
            store_id,
            landing_page_id,
            product_image_url,
            customer_id,
            customer_name,
            customer_phone,
            customer_city,
            customer_address,
            delivery_zone_id,
            delivery_wilaya_code,
            delivery_wilaya_name,
            delivery_commune_name,
            delivery_daira_name,
            delivery_method,
            delivery_fee,
            return_fee,
            selected_size,
            selected_color,
            quantity,
            unit_price,
            total_price,
            status,
            notes,
            confirmed_at,
            shipped_at,
            delivered_at,
            returned_at,
            created_at,
            updated_at
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29
          )
          returning id
        `,
        [
          storeId,
          product.id,
          product.productImages[0],
          customer.id,
          customer.name,
          customer.phone,
          zone.name,
          `حي النخيل، ${zone.name}`,
          zone.id,
          seedOrder.wilaya,
          zone.name,
          zone.name,
          zone.name,
          product.transportMode === "SHED_MED" ? "OFFICE" : seedOrder.method,
          String(deliveryFee),
          String(zone.returnFee ?? 0),
          seedOrder.primary,
          seedOrder.secondary,
          seedOrder.quantity,
          String(unitPrice),
          String(totalPrice),
          seedOrder.status,
          seedOrder.note,
          dates.confirmedAt,
          dates.shippedAt,
          dates.deliveredAt,
          dates.returnedAt,
          createdAt,
          new Date(),
        ],
      );

      const orderId = orderResult.rows[0].id;
      for (const item of statusTimeline(seedOrder.status, createdAt)) {
        await client.query(
          `
            insert into order_os.audit_logs (
              store_id,
              order_id,
              action,
              from_status,
              to_status,
              note,
              created_at
            )
            values ($1, $2, $3, $4, $5, $6, $7)
          `,
          [storeId, orderId, item.action, item.from, item.to, seedOrder.note, item.at],
        );
      }
    }

    await client.query("commit");

    console.log(`Showcase store ready: /s/${STORE_SLUG}`);
    console.log(`Showcase merchant email: ${LOGIN_EMAIL}`);
    console.log(`Seeded products: ${products.length}`);
    console.log(`Seeded orders: ${orderSeeds.length}`);
    console.log(`Active delivery zones: ${activeFees.size}/${wilayas.length}`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await seed();

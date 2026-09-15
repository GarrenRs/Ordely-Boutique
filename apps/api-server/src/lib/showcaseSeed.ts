import { hashMerchantPassword } from "./password.js";
import {
  auditLogsTable,
  customersTable,
  db,
  deliveryCommuneSettingsTable,
  deliveryZonesTable,
  eq,
  landingPagesTable,
  ordersTable,
  productCategoriesTable,
  sql,
  storesTable,
  usersTable,
} from "@workspace/db";
import { ALGERIA_WILAYAS } from "./algeria-locations.js";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const STORE_SLUG = "ordely-showcase";
const STORE_NAME = "Ordely Showcase";
const STORE_OWNER = "تاجر العرض";
const STORE_PHONE = "0549990984";
const STORE_CITY = "الجزائر";
const STORE_LOGO_URL = "/favicon.svg";
const LOGIN_EMAIL = "showcase@ordely.local";
const OPTION_LABEL = "__label:";
const PRODUCT_IMAGE_PARAMS = "auto=format&fit=crop&w=1400&q=85";

const img = (id: string) => `https://images.unsplash.com/${id}?${PRODUCT_IMAGE_PARAMS}`;

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
    productImages: [img("photo-1594035910387-fea47794261f"), img("photo-1541643600914-78b084683601"), img("photo-1592945403244-b3fbafd7f539")],
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
    productImages: [img("photo-1592945403244-b3fbafd7f539"), img("photo-1594035910387-fea47794261f"), img("photo-1541643600914-78b084683601")],
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
    productImages: [img("photo-1586023492125-27b2c045efd7"), img("photo-1616486338812-3dadae4b4ace"), img("photo-1618220179428-22790b461013")],
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
    productImages: [img("photo-1555041469-a586c61ea9bc"), img("photo-1586023492125-27b2c045efd7"), img("photo-1618220179428-22790b461013")],
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
    productImages: [img("photo-1514432324607-a09d9b4aefdd"), img("photo-1495474472287-4d71bcdd2085"), img("photo-1511920170033-f8396924c348")],
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
    productImages: [img("photo-1590874103328-eac38a683ce7"), img("photo-1548036328-c9fa89d128fa"), img("photo-1584917865442-de89df76afd3")],
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
    productImages: [img("photo-1504148455328-c376907d081c"), img("photo-1581092918056-0c4c3acd3789"), img("photo-1581092580497-e0d23cbdf1dc")],
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
    productImages: [img("photo-1556911220-bff31c812dba"), img("photo-1556911261-6bd341186b2f"), img("photo-1556909114-f6e7ad7d3136")],
    primaryOptions: ["موديل", "Compact", "Family"],
    secondaryOptions: ["لون", "فضي", "أبيض"],
  },
];

const activeFees = new Map<string, { officeFee: number; homeFee: number; returnFee: number }>([
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
] as const;

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
] as const;

function encodeOptions(values: string[]) {
  const [label, ...items] = values;
  return [`${OPTION_LABEL}${label}`, ...items];
}

function dateHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function statusTimeline(status: string, createdAt: Date) {
  const pending = addMinutes(createdAt, 20);
  const confirmed = addMinutes(createdAt, 45);
  const shipped = addMinutes(createdAt, 120);
  const terminal = addMinutes(createdAt, 240);
  const timeline: Array<{ action: string; from: string | null; to: string; at: Date }> = [
    { action: "ORDER_CREATED", from: null, to: "NEW", at: createdAt },
  ];

  if (status === "PENDING_CONFIRMATION") timeline.push({ action: "STATUS_CHANGED", from: "NEW", to: "PENDING_CONFIRMATION", at: pending });
  if (status === "CONFIRMED") timeline.push({ action: "STATUS_CHANGED", from: "NEW", to: "PENDING_CONFIRMATION", at: pending }, { action: "STATUS_CHANGED", from: "PENDING_CONFIRMATION", to: "CONFIRMED", at: confirmed });
  if (["SHIPPED", "DELIVERED", "RETURNED"].includes(status)) timeline.push({ action: "STATUS_CHANGED", from: "NEW", to: "PENDING_CONFIRMATION", at: pending }, { action: "STATUS_CHANGED", from: "PENDING_CONFIRMATION", to: "CONFIRMED", at: confirmed }, { action: "STATUS_CHANGED", from: "CONFIRMED", to: "SHIPPED", at: shipped });
  if (status === "DELIVERED") timeline.push({ action: "STATUS_CHANGED", from: "SHIPPED", to: "DELIVERED", at: terminal });
  if (status === "RETURNED") timeline.push({ action: "STATUS_CHANGED", from: "SHIPPED", to: "RETURNED", at: terminal });
  if (status === "CANCELLED") timeline.push({ action: "STATUS_CHANGED", from: "NEW", to: "CANCELLED", at: pending });
  if (status === "REJECTED") timeline.push({ action: "STATUS_CHANGED", from: "NEW", to: "PENDING_CONFIRMATION", at: pending }, { action: "STATUS_CHANGED", from: "PENDING_CONFIRMATION", to: "REJECTED", at: confirmed });

  return timeline;
}

function statusDates(status: string, createdAt: Date) {
  const timeline = statusTimeline(status, createdAt);
  const dateFor = (to: string) => timeline.find((item) => item.to === to)?.at ?? null;
  return {
    confirmedAt: dateFor("CONFIRMED"),
    shippedAt: dateFor("SHIPPED"),
    deliveredAt: dateFor("DELIVERED"),
    returnedAt: dateFor("RETURNED"),
  };
}

async function ensureShowcaseStore(tx: DbTransaction) {
  const [existing] = await tx.select().from(storesTable).where(eq(storesTable.slug, STORE_SLUG));
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  if (existing) {
    const [store] = await tx
      .update(storesTable)
      .set({
        name: STORE_NAME,
        ownerName: STORE_OWNER,
        phone: STORE_PHONE,
        city: STORE_CITY,
        logoUrl: STORE_LOGO_URL,
        isActive: true,
        subscriptionPlanDays: 365,
        subscriptionExpiresAt: expiresAt,
      })
      .where(eq(storesTable.id, existing.id))
      .returning();
    return store;
  }

  const [store] = await tx.insert(storesTable).values({
    name: STORE_NAME,
    slug: STORE_SLUG,
    ownerName: STORE_OWNER,
    phone: STORE_PHONE,
    city: STORE_CITY,
    logoUrl: STORE_LOGO_URL,
    isActive: true,
    subscriptionPlanDays: 365,
    subscriptionExpiresAt: expiresAt,
  }).returning();

  return store;
}

export async function reseedShowcaseStore() {
  return db.transaction(async (tx) => {
    const store = await ensureShowcaseStore(tx);
    const storeId = store.id;

    const [merchant] = await tx.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, LOGIN_EMAIL));
    if (!merchant) {
      const passwordHash = await hashMerchantPassword(`showcase-${crypto.randomUUID()}`);
      await tx.insert(usersTable).values({ storeId, email: LOGIN_EMAIL, passwordHash });
    } else {
      await tx.update(usersTable).set({ storeId }).where(eq(usersTable.id, merchant.id));
    }

    await tx.delete(auditLogsTable).where(eq(auditLogsTable.storeId, storeId));
    await tx.delete(ordersTable).where(eq(ordersTable.storeId, storeId));
    await tx.delete(deliveryCommuneSettingsTable).where(eq(deliveryCommuneSettingsTable.storeId, storeId));
    await tx.delete(deliveryZonesTable).where(eq(deliveryZonesTable.storeId, storeId));
    await tx.delete(landingPagesTable).where(eq(landingPagesTable.storeId, storeId));
    await tx.delete(productCategoriesTable).where(eq(productCategoriesTable.storeId, storeId));
    await tx.delete(customersTable).where(eq(customersTable.storeId, storeId));

    const categoryIds = new Map<string, number>();
    for (const category of categories) {
      const [row] = await tx.insert(productCategoriesTable).values({
        storeId,
        name: category.name,
        slug: category.slug,
        isDefault: category.isDefault === true,
        isActive: true,
        sortOrder: category.sortOrder,
      }).returning();
      categoryIds.set(category.key, row.id);
    }

    const productRows = new Map<string, typeof products[number] & { id: number; priceNumber: number }>();
    for (const product of products) {
      const [row] = await tx.insert(landingPagesTable).values({
        storeId,
        categoryId: categoryIds.get(product.categoryKey),
        productName: product.productName,
        price: product.price,
        description: product.description,
        imageUrl: product.productImages[0],
        productImages: product.productImages,
        availableSizes: encodeOptions(product.primaryOptions),
        availableColors: encodeOptions(product.secondaryOptions),
        galleryDisplay: product.galleryDisplay,
        themeColor: product.themeColor,
        template: product.template,
        slug: product.slug,
        transportMode: product.transportMode,
        deliveryInfo: product.deliveryInfo,
        whatsappNumber: STORE_PHONE,
        isActive: true,
      }).returning();
      productRows.set(product.key, { ...product, id: row.id, priceNumber: Number(row.price) });
    }

    const zoneRows = new Map<string, { id: number; name: string; officeFee?: number; homeFee?: number; returnFee?: number }>();
    for (const wilaya of ALGERIA_WILAYAS) {
      const fee = activeFees.get(wilaya.code);
      const [row] = await tx.insert(deliveryZonesTable).values({
        storeId,
        wilayaCode: wilaya.code,
        wilayaName: wilaya.name,
        homeFee: fee ? String(fee.homeFee) : null,
        officeFee: fee ? String(fee.officeFee) : null,
        returnFee: fee ? String(fee.returnFee) : "0",
        isActive: Boolean(fee),
      }).returning();
      zoneRows.set(wilaya.code, { id: row.id, name: wilaya.name, ...fee });
    }

    for (const [wilayaCode, communeName, dairaName] of disabledCommunes) {
      await tx.insert(deliveryCommuneSettingsTable).values({
        storeId,
        wilayaCode,
        communeName,
        dairaName,
        isActive: false,
      });
    }

    const customerRows = new Map<string, typeof customers[number] & { id: number }>();
    for (const customer of customers) {
      const [row] = await tx.insert(customersTable).values({
        storeId,
        name: customer.name,
        phone: customer.phone,
        city: customer.city,
        notes: customer.notes,
      }).returning();
      customerRows.set(customer.key, { ...customer, id: row.id });
    }

    for (const seed of orderSeeds) {
      const product = productRows.get(seed.product);
      const customer = customerRows.get(seed.customer);
      const zone = zoneRows.get(seed.wilaya);
      if (!product || !customer || !zone?.id || !zone.officeFee) throw new Error("Invalid showcase order seed");

      const deliveryMethod = product.transportMode === "SHED_MED" ? "OFFICE" : seed.method;
      const deliveryFee = deliveryMethod === "OFFICE" ? zone.officeFee : zone.officeFee + Number(zone.homeFee ?? 0);
      const unitPrice = product.priceNumber;
      const totalPrice = unitPrice * seed.quantity;
      const createdAt = dateHoursAgo(seed.hoursAgo);
      const dates = statusDates(seed.status, createdAt);

      const [order] = await tx.insert(ordersTable).values({
        storeId,
        landingPageId: product.id,
        productImageUrl: product.productImages[0],
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerCity: zone.name,
        customerAddress: `حي النخيل، ${zone.name}`,
        deliveryZoneId: zone.id,
        deliveryWilayaCode: seed.wilaya,
        deliveryWilayaName: zone.name,
        deliveryCommuneName: zone.name,
        deliveryDairaName: zone.name,
        deliveryMethod,
        deliveryFee: String(deliveryFee),
        returnFee: String(zone.returnFee ?? 0),
        selectedSize: seed.primary,
        selectedColor: seed.secondary,
        quantity: seed.quantity,
        unitPrice: String(unitPrice),
        totalPrice: String(totalPrice),
        status: seed.status,
        notes: seed.note,
        confirmedAt: dates.confirmedAt,
        shippedAt: dates.shippedAt,
        deliveredAt: dates.deliveredAt,
        returnedAt: dates.returnedAt,
        createdAt,
        updatedAt: new Date(),
      }).returning();

      for (const item of statusTimeline(seed.status, createdAt)) {
        await tx.insert(auditLogsTable).values({
          storeId,
          orderId: order.id,
          action: item.action,
          fromStatus: item.from,
          toStatus: item.to,
          note: seed.note,
          createdAt: item.at,
        });
      }
    }

    const statusRows = await tx
      .select({ status: ordersTable.status, count: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(eq(ordersTable.storeId, storeId))
      .groupBy(ordersTable.status);

    return {
      storeId,
      storeSlug: STORE_SLUG,
      publicPath: `/s/${STORE_SLUG}`,
      products: products.length,
      categories: categories.length,
      deliveryZones: ALGERIA_WILAYAS.length,
      activeDeliveryZones: activeFees.size,
      orders: orderSeeds.length,
      statuses: statusRows,
      reseededAt: new Date().toISOString(),
    };
  });
}

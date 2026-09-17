# Phase 10.4 - تقرير تنفيذ تتبع الطلب من طرف العميل (P1-01)

<!-- DOC-META
type: phase-report
status: historical
verified-as-of: 2026-09-17
related: Docs/INDEX.md
notes: Closure stamp. Immutable historical record - not current truth. See Docs/current/ and Docs/decisions/ for the living model.
-->

التاريخ: 15-09-2026
النطاق: تنفيذ P1-01 فقط وفق المواصفة المعتمدة في `Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md` (القسم 1). لا يشمل هذا التقرير أي عنصر آخر من Phase 10.

## 1) السبب الجذري (Root cause)

كانت حالات الطلب تتغير بالكامل داخل لوحة التاجر فقط، وبعد إنشاء الطلب من الواجهة العامة لا يملك العميل أي وسيلة لمعرفة حالة طلبه (جديد، مؤكد، مشحون، مُسلَّم، مُرجع، ملغي، مرفوض) — كان الجواب الوحيد "سيتم التواصل معك". لا يوجد أي نظام tracking مستقل ولا أي مصدر حالة خارج `orders`. الغاية: إتاحة تتبع بسيط وآمن بلا تسجيل دخول، مصدر الحقيقة الوحيد هو جدول `orders` نفسه دون جدول أو عمود أو نظام جديد.

## 2) النطاق (Scope)

- Endpoint عام واحد جديد: `POST /api/public/orders/status`.
- صفحة عامة جديدة `/track` في الواجهة.
- رابط "تتبع طلبك" في شاشة نجاح إنشاء الطلب (prefill رقم الطلب فقط بلا هاتف في الرابط).
- تحديث العقود المتأثرة فقط (Zod، OpenAPI، React API client، generated types) + تصدير `ApiError` من العميل ليُفرَّق بين 404/429/غيرها.
- لا جداول، لا أعمدة، لا migration، لا نظام tracking مستقل، لا re-design لحلقة حياة الطلب (lifecycle كما هو بعد Phase 10.3 دون أي تعديل)، لا token تتبع.

## 3) الـ API

- `POST /api/public/orders/status`
  - الطلب: `{ "orderId": number, "phone": string }`
  - النجاح `200`:
    `{ orderId, status, createdAt, updatedAt, returnedAt, deliveredAt }`
  - يعتمد على الحقول الموجودة فعلياً في `orders`: `created_at`, `updated_at`, `returned_at`, `delivered_at` (المحفوظة عند DELIVERED/RETURNED في Phase 10.3)، ولا يُخترَع رقم طلب جديد — orderId هو `orders.id`.
  - الفشل الموحّد `404 { error: "الطلب غير موجود" }`.
  - `400` للجسم غير الصالح (نفس convention القائمة في `createPublicOrder` مع `details`).
  - `429` عند تجاوز الحد (نمط `{ error: "طلبات كثيرة، حاول لاحقاً" }` كما في limiters القائمة).
  - `Cache-Control: no-store` على النجاح (الحالة قابلة للتغير).

## 4) نموذج الأمان (Security model)

- التحقق يعتمد على `orderId + phone` معاً عبر **استعلام واحد**: `WHERE id = $orderId AND customer_phone = $phone`.
- الحالات الأربع (orderId غير موجود / phone خاطئ / طلب متجر آخر / بيانات ناقصة) تعيد **نفس** الجسم بالضبط ونفس الحالة `404` — بدون أي فرق يساعد على enumeration أكان الطلب موجوداً أم لا.
- لا كشف لأي حقل حساس: الاستعلام يحدد عمود select واحداً من 6 حقول فقط (id، status، createdAt، updatedAt، returnedAt، deliveredAt) — لا اسم، لا هاتف، لا عنوان، لا ملاحظات، لا أسعار، لا storeId.
- لا حاجة لأي authentication أو session؛ الـ endpoint يقع على `publicRouter` المُسجّل قبل وسطاء المصادقة.

## 5) Rate limiting

- `trackOrderLimiter` جديد في `apps/api-server/src/middleware/rateLimiter.ts` بنفس بنية limiters الموجودة (express-rate-limit، standardHeaders، نفس نمط الرسالة العربية): **20 طلباً / 10 دقائق / IP**.
- عند التجاوز: `429 { error: "طلبات كثيرة، حاول لاحقاً" }` مطابق لنمط بقية النظام.

## 6) الواجهة (UI) - صفحة /track

- `apps/web/src/pages/TrackOrder.tsx` + Route عام `path="/track"` في `App.tsx` قبل MerchantRouter (لا حاجة لمصادقة).
- حقول: رقم الطلب (prefill من `?orderId=` فقط)، رقم الهاتف، زر "تتبع الطلب".
- الحالات: idle / loading (سبينر "جارٍ التتبع...") / success / not-found / rate-limit / server-error + تحقق محلي (رقم صحيح موجب، هاتف غير فارغ) بدون استهلاك حد الشبكة.
- شاشة النجاح: رقم الطلب `#...`، **الحالة** عبر `StatusBadge` (القاموس الحالي: جديد، بانتظار التأكيد، مؤكد، تم الشحن، تم التسليم، مسترجع، ملغي، مرفوض)، تاريخ الطلب، آخر تحديث، وتاريخَ التسليم/الإرجاع عند توافرهما. لا حالة جديدة مضافة.
- التمييز بين 404 و429 وغيرها يتم عبر `ApiError.status` (صُدِّر `ApiError` من `@workspace/api-client-react`).

## 7) الربط مع نجاح الطلب (Success-page integration)

- في شاشة "تم استلام طلبك" (`PublicLandingPage.tsx`) أُضيف زر رابط **"تتبع طلبك"** (`data-testid="link-track-order"`) يوجه إلى `/track?orderId=<id>`.
- الهاتف **لا** يظهر في الرابط إطلاقاً؛ يُملأ رقم الطلب تلقائياً والعميل يدخل هاتفه من جديد. لا token في هذه المرحلة.

## 8) العقود (Contracts)

- OpenAPI (`lib/api-spec/openapi.yaml`): مسار `/public/orders/status.post (operationId trackOrderStatus)` + schemas `OrderTrackingRequest` و `OrderTracking` (status كـ enum للحالات الثماني، التواريخ date-time، returnedAt/deliveredAt nullable).
- Zod (`lib/api-zod/src/generated/api.ts`): `TrackOrderStatusBody` (`orderId number int positive`, `phone string`) و `TrackOrderStatusResponse` (enum الحالات الثماني + 4 حقول زمنية مع nullish للبعدَين).
- Generated types (api-zod `types/orderTracking.ts`, `types/orderTrackingRequest.ts` + بدّل التصدير في `types/index.ts`؛ react `api.schemas.ts` يضيف نفسهما).
- React API client: `trackOrderStatus` + `getTrackOrderStatusMutationOptions` + `useTrackOrderStatus` (نمط mutation مطابق لبقية الـ POSTs)؛ وتصدير `ApiError`/`ResponseParseError` من الـ index للاستهلاك العام.
- لا تغيير على أي عقد موجود (Order، Store، ...) — سوى عمليات إضافة.

## 9) الاختبارات (Tests)

`npm --prefix apps/api-server run test:tracking` — بنية المراحل السابقة (معاملة واحدة ترمي رمزاً للتراجع الكامل + فحص خلو الأثر). **23 فحصاً كلها نجحت**:

1. عقد الطلب: صالح → مقبول؛ orderId نصي / صفر / phone مفقود → مرفوض (convention 400/422).
2. عقد الاستجابة: كاملة مقبولة؛ returnedAt/deliveredAt اختيارية؛ **لا تعرض** customerName/customerPhone/customerAddress/notes (لا تسريب).
3. `orderId + phone` صحيحان → صف موجود، الحالة مطابقة للـ DB، والاستعلام يعيد 6 حقول أساسية فقط.
4. phone خاطئ → no row (404 موحدة).
5. orderId غير موجود → no row (404 موحدة).
6. عزل المتاجر: رقم طلب B مع هاتف A → لا صف، وعكسه → لا صف.
7. RETURNED / CANCELLED / REJECTED تُتتبع وتبقى حالاتها مطابقة للـ DB.
8. التتبع قراءة فقط: عدد الطلبات لا يتغير أثناء التتبع.

## 10) الفحص التشغيلي HTTP (Live HTTP smoke)

نفّذت smoke على الخادم الحقيقي (منفذ 8080) بمتجري رمل وطلب أُنشئ عبر واجهة إنشاء الطلب العامة فعلياً ثم نُظّف الاتنين بالكامل. **29 فحصاً كلها نجحت**:

1. إنشاء طلب عبر `POST /api/public/s/{slug}/p/{product}/order` → 201 (يُثبت أيضاً سلامة create-order flow).
2. تتبع صحيح → 200، `Cache-Control: no-store`، الجواب يحوي الحقول الأساسية فقط بلا حساسات.
3. phone خاطئ → 404، orderId غير موجود → 404، والجسمان **متطابقان** (لا enumeration).
4. لا مصادقة/جلسة → يعمل.
5. malformed body (orderId نصي / phone مفقود) → 400.
6. تسلسل NEW→...→DELIVERED عبر التاجر ثم التتبع → 200 مع `status=DELIVERED` و `deliveredAt` (الحالة المتبوعة تعكس التغيير).
7. RETURNED/CANCELLED/REJECTED مُنشأة مباشرة → تُتتبع مطابقة للـ DB.
8. هاتف عشوائي لطلب المتجر A → 404 (عزل عبر HTTP).
9. rate limit: أول 20 طلباً تمر بلا 429 والطلب 21 → 429 بنمط الخطأ المطلوب.
10. التنظيف: حُذف المتجران الرملان وكل المرتبط بهما.

## 11) التراجع (Regression)

- `test:tracking`: 23 ✓
- `test:return` (P1-03): 58 ✓
- `test:lifecycle` (P1-04): 47 ✓
- `test:readiness` (P1-02): 30 ✓
- `npm run typecheck` (المكتبات + الخادم + الويب): ناجح.
- `npm run build` الكامل (typecheck + api-server + web/vite): ناجح (تحذير حجم الحزمة السابق خارج النطاق).
- P1-02 readiness و P1-03 return و P1-04 subscription lifecycle سليمة كما أعلاه.

## 12) فحص الواجهات عبر الـ API (UI regression)

- الواجهة العامة `GET /api/public/s/ordely-showcase`: 200 مع 8 منتجات.
- صفحة المنتج `GET /api/public/s/ordely-showcase/p/{slug}`: 200.
- create order flow: 201 (طُبّق في الـ smoke على الرمل).
- merchant orders: `GET /api/stores/1/orders` بلا جلسة → 401 (الحارس والمسارات سليمة)، وتدفق PATCH عبر التاجر نجح في الـ smoke.
- provider: `GET /api/provider/summary` بلا جلسة → 401 (سليم).
- `/track` وشاشة النجاح صفحات SPA راجعة عميلاً — تحققت عبر web typecheck الصارم واستخدام الـ data-testids الجديدة.
- لم تتأثر لوحات المزوّد/التاجر (لا تغيير في مساراتها).

## 13) سلامة قاعدة البيانات (Database integrity)

- قبل التنفيذ (baseline): متاجر 3، طلبات 24، زبائن 15، صفحات 8، ولايات 58، تدقيق 74، رمل/مخلفات تتبع 0.
- بعد التنفيذ وكامل الاختبارات والـ smoke والبناء: الأعداد **نفسها تماماً** ورمل 0 ومخلفات 0.
- **لا جدول جديد ولا عمود ولا migration** — التتبع يعتمد كلياً على البيانات الموجودة.

## 14) المخاطر المتبقية (Remaining risks)

- القيد `orderId + phone` يعتمد على قابلية العميل لمعرفة رقم الطلب وهاتفه الصحيحَين؛ لا يوجد PIN/رمز تتبع (خارج النطاق ومذكور في المواصفة).
- الـ rate limit في الذاكرة (نفس نمط بقية النظام): يُصفَّر عند إعادة تشغيل الخادم ولا يتشارك بين عقد متعددة.
- `phone` يُقارن كنص بالضبط (الـ trim لتسهيل الإدخال)؛ هواتف ميّتَة بمسافات مخزنة سلفاً قد تحتاج match مطابق — عملياً الطلبات المتاحة أُنشئت عبر نفس الـ PublicOrderSchema المطابق.
- لا تمييز بين "الطلب موجود لكن الهاتف خاطئ" و"الطلب غير موجود" عمداً — كلاهما 404 متطابق؛ وهذا يمنع enumeration لكنه قد يُربك المرسل للرقم الصحيح فقط (سلوك مقصود).
- صفحة `/track` لا تعرض اسم المنتج ولا الأسعار (حقول حساسة) — تصميم مقصود حسب المواصفة.

## 15) التأكيد الصريح

- **P1-01 تتبع الطلب من العميل: نُفِّذ** (endpoint عام + صفحة /track + رابط بعد نجاح الطلب + rate limit + no-store + عزل + 404 موحد + اختبارات وsmoke).
- **P2-01 Manual Order: لم يُنفَّذ** — لا واجهة إدخال يدوي ولا تغيير على CreateOrderBody، لا حقل `order_source`.
- **لم تُنفَّذ**: مدفوعات (لا بوابة ولا حقل دفع)، إشعارات (لا SMS/email)، مخزون (لا أعمدة ولا عدادات مخزون)، CRM (لا شيء جديد)، custom domains، ولا أي إعادة تصميم لحلقة حياة الطلب — `transitions.ts` لم يُمَس في هذه المرحلة.
- لا جدول ولا عمود ولا migration؛ `orders` بقي المصدر الوحيد.

## 16) الخلاصة

مسار تتبع آمن وبسيط جاهز: العميل يُدخل رقم الطلب وهاتفه في `/track` (أو ينقر "تتبع طلبك" بعد إنشاء الطلب مع prefill للرقم)؛ endpoint عام بلا مصادقة يعيد الحالة الحالية مع الزمن، مع no-store، حد 20/10د/IP، 404 موحّد يمنع كشف وجود الطلب، واستعلام واحد لا يسرّب أي حقل حساس. الاختبارات (23) والـ smoke (29) والتراجع الكامل (58/47/30) والبناء كلها خضراء وقاعدة البيانات بلا أي تغيير. المرحلة توقفت عند هذا الحد.

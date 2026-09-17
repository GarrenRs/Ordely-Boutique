# Phase 10.3 - تقرير تنفيذ الإرجاع بعد التسليم (P1-03)

<!-- DOC-META
type: phase-report
status: historical
verified-as-of: 2026-09-17
related: Docs/INDEX.md
notes: Closure stamp. Immutable historical record - not current truth. See Docs/current/ and Docs/decisions/ for the living model.
-->

التاريخ: 15-09-2026
النطاق: تنفيذ P1-03 فقط وفق المواصفة المعتمدة في `Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md` (القسم 4). لا يشمل هذا التقرير أي عنصر آخر من Phase 10.

## 1) السبب الجذري (Root cause)

السبب الجذري المغلق في هذه المرحلة: حالة `RETURNED` كانت موجودة في المخطط والواجهات لكنها بلا مسار شرعي كامل - كان الانتقال إليها (من `SHIPPED`) بلا أي اشتراط أو توثيق لسبب الإرجاع، وحالة `DELIVERED` كانت نهائية تماماً (بلا أي مسار بعدها). لذلك كان "إرجاع طلب سلَّمه التاجر" مستحيلاً داخل النظام، وكان أي إرجاع يُدوَّن خارج النظام أو يُقتطع يدوياً. غاية P1-03: مسار شرعي واحد موثّق `DELIVERED -> RETURNED` مع سبب إلزامي يحفظ في قاعدة البيانات وسجل التدقيق، دون إعادة كتابة التقارير أو إضافة أنظمة جديدة.

## 2) النطاق (Scope)

- إضافة عمود `return_reason` (text nullable) لجدول `orders` فقط، بآلية المشروع المعتمدة (`drizzle-kit push`).
- مسار انتقال قانوني واحد جديد: `DELIVERED -> RETURNED`.
- منع `RETURNED -> أي حالة أخرى` (نهائي).
- منع الحالات السابقة (`NEW / PENDING_CONFIRMATION / CONFIRMED / SHIPPED / CANCELLED / REJECTED`) من الانتقال مباشرة إلى `RETURNED` (أُزيل `SHIPPED -> RETURNED` الذي كان موجوداً سابقاً).
- `returnReason` إلزامي (غير فارغ بعد trim) عند الانتقال إلى `RETURNED`، ويُحفظ في `orders.return_reason` ويظهر في note سجل التدقيق.
- تحديث العقود الأربعة المتأثرة فقط (DB schema، Zod، OpenAPI، React client).
- واجهة التاجر: زر "إرجاع الطلب" يظهر لحالة `DELIVERED` فقط مع نافذة تأكيد وحقل سبب مطلوب.
- لا صفحة جديدة، لا نظام تدفق جديد للمزوّد (يبقى شاهداً على `RETURNED` عبر العقد المشترك)، لا إعادة كتابة للتقارير.

## 3) تغيير المخطط (Schema change)

- `lib/db/src/schema/orders.ts`: إضافة
  `returnReason: text("return_reason")` (nullable، بلا قيمة افتراضية).
- أُجري `npm run db:push` (آلية المشروع المعتمدة عبر `drizzle-kit push`) وطُبّق التغيير:
  `[✓] Changes applied`.
- التحقق المباشر عبر `information_schema` بعد التطبيق:
  `return_reason / text / is_nullable = YES`.
- لا أعمدة إضافية، لا `order_source`، لا جداول، لا إعادة تغذية، لا ترحيل ملفات (المشروع يعتمد push). انتهى التغيير الدائم الوحيد المخطط عند هذا العمود.

## 4) سلوك الـ API

- نهاية التحديث `PATCH /api/stores/:storeId/orders/:orderId`:
  - لا تزال `isValidTransition` تحكم الصلاحية أولاً (رسالة `انتقال غير مسموح من X إلى Y`).
  - عند `status === "RETURNED"`: يُقرأ `returnReason?.trim()`؛ إن غاب أو أصبح فارغاً بعد trim -> `422 { error: "سبب الإرجاع مطلوب" }` قبل أي كتابة أو تدقيق.
  - عند الصلاحية: يُحدَّث الطلب إلى `RETURNED` مع `returned_at = now()` و `return_reason` محفوظاً.
  - `formatOrder` يعرض `returnReason` في الاستجابة (nullable في القراءة) في `GET` و `GET` المفرد و `PATCH` والقائمة.
- تبقى كل التحولات القائمة (NEW->PENDING_CONFIRMATION، PENDING_CONFIRMATION->CONFIRMED/REJECTED، CONFIRMED->SHIPPED/CANCELLED، SHIPPED->DELIVERED، NEW->CANCELLED) بلا تغيير.
- `RETURNED` لا يقبل أي انتقال لاحق: مصفوفة `VALID_TRANSITIONS["RETURNED"] = []`.

## 5) سلوك الواجهة (Merchant UI)

- `apps/web/src/pages/OrderDetail.tsx`:
  - أُزيل "استرجاع" من قائمة انتقالات `SHIPPED`.
  - حقل `DELIVERED` يعرض الزر الوحيد **"إرجاع الطلب"** (مع `data-testid="btn-status-RETURNED"`).
  - الضغط على "إرجاع الطلب" يفتح نافذة تأكيد (backdrop + dialog) فيها حقل `سبب الإرجاع` مطلوب وزرا "إلغاء" و"تأكيد الإرجاع" (`data-testid="btn-confirm-return"` / `data-testid="input-return-reason"`).
  - التأكيد يرسل `{ status: "RETURNED", returnReason }`؛ إن كان السبب فارغاً بعد trim تُعرض رسالة "سبب الإرجاع مطلوب" محلياً قبل الإرسال.
  - بعد النجاح يظهر الطلب `RETURNED` (شارة الحالة + "سبب الإرجاع" في تفاصيل الطلب + سطر التدقيق)، وتُحدَّث القوائم والملخص والزبائن تلقائياً (نفس إبطال الاستعلامات القائم).
  - لا يظهر زر الإرجاع لغير `DELIVERED`.
  - حقل الملاحظات العامة يُخفى عندما يكون الانتقال المتاح الوحيد هو الإرجاع (لأن السبب له حقل مخصص).

## 6) انتقال الحالة (State transition)

`VALID_TRANSITIONS` بعد المرحلة:

```text
NEW:                    PENDING_CONFIRMATION, CANCELLED
PENDING_CONFIRMATION:   CONFIRMED, REJECTED
CONFIRMED:              SHIPPED, CANCELLED
SHIPPED:                DELIVERED
DELIVERED:              RETURNED
RETURNED:               (نهائي - لا شيء)
CANCELLED:              (نهائي)
REJECTED:               (نهائي)
```

التغيير الوحيد على المصفوفة: أُزيل `RETURNED` من قائمة `SHIPPED` وأُضيف `RETURNED` إلى `DELIVERED`. أي محاولة انتقال خارج هذه المصفوفة تُرفض بـ 422 ولا تُكتب بيانات.

## 7) سلوك التدقيق (Audit behavior)

- عبر النظام القائم `logAudit` (جدول `audit_logs` بالبنية الحالية: action / from_status / to_status / note) دون إنشاء نظام جديد.
- عند `DELIVERED -> RETURNED` يُسجَّل صف:
  `action = STATUS_CHANGED`, `fromStatus = DELIVERED`, `toStatus = RETURNED`, `note = سبب الإرجاع` (المقصّ).
- لا يُنشأ سجل تدقيق عند رفض السبب الفارغ (لا كتابة إطلاقاً).
- يبقى "سجل الحالة" في واجهة التاجر يعرض سبب الإرجاع بعد العملية.

## 8) العقود (Contracts)

- `lib/api-zod/src/generated/api.ts`: `returnReason` (nullish) في `GetOrderResponse` و `UpdateOrderResponse`، وفي `UpdateOrderBody`.
- `lib/api-zod/src/generated/types/order.ts` و `orderUpdate.ts`: `returnReason?: string | null`.
- `lib/api-client-react/src/generated/api.schemas.ts`: `Order` و `OrderUpdate` تشملان `returnReason` (nullable في القراءة).
- `lib/api-spec/openapi.yaml`: `Order.returnReason` و `OrderUpdate.returnReason` (type ["string","null"]).
- مزامنة يدوية للعقود الثلاثة كالمعتاد في المرحلة 10.1/10.2؛ `api.ts` في react client لم يتغيّر (حقل اختياري).

## 9) التقارير (Reporting)

- فُحصت التقارير القائمة دون تعديل أي سطر فيها لأنها كانت تعالج `RETURNED` سلفاً بشكل صحيح:
  - `GET /orders/summary`: `returned` count + `returnLoss` (مجموع `return_fee`) + `netRevenue` مخصومة من `returnLoss`.
  - `GET /reports/daily` و `GET /reports/weekly`: فئة `RETURNED` تُحصى وتعكس `returnLoss` في net.
  - لوحة المزوّد: `todayReturned` في الملخص (محسوب من `status = 'RETURNED'`).
  - قائمة الطلبات: فلتر `status=RETURNED` يعمل ويعرض السبب.
- لا إعادة كتابة للتقارير.

## 10) الملفات المتغيّرة (Files changed - P1-03)

- `lib/db/src/schema/orders.ts` - عمود `return_reason`.
- `apps/api-server/src/lib/transitions.ts` - مصفوفة الانتقال (إزالة SHIPPED->RETURNED، إضافة DELIVERED->RETURNED).
- `apps/api-server/src/routes/orders.ts` - حارس سبب الإرجاع، حفظ السبب و `returned_at`، تدقيق النوت، `returnReason` في `formatOrder`.
- `apps/web/src/pages/OrderDetail.tsx` - زر "إرجاع الطلب" ونافذة التأكيد وحقل السبب وعرض السبب بعد الإرجاع.
- العقود: `lib/api-zod/src/generated/api.ts` و `types/order.ts` و `types/orderUpdate.ts` و `lib/api-client-react/src/generated/api.schemas.ts` و `lib/api-spec/openapi.yaml`.
- الاختبارات: `apps/api-server/src/tests/return.test.ts` (جديد) + `test-return.mjs` (جديد) + سكربت `test:return` في `package.json`.

## 11) الاختبارات (Tests)

`npm --prefix apps/api-server run test:return` - بنية موحّدة مثل 10.1/10.2 (معاملة واحدة ترمي رمزاً خاصاً للتراجع الكامل + فحص خلوه من أي أثر بعد التراجع). النتيجة: **58 فحصاً جميعها نجحت**، منها:

1. `DELIVERED -> RETURNED` مقبول؛ وكل وجهات الخروج من `DELIVERED` الأخرى مرفوضة.
2. الحالات السابقة (`NEW/PENDING_CONFIRMATION/CONFIRMED/SHIPPED/CANCELLED/REJECTED`) -> `RETURNED` مرفوضة جميعها، و`SHIPPED -> RETURNED` لم يعد مقبولاً.
3. `RETURNED` نهائي: لا ينتقل إلى أي حالة أخرى.
4. التحولات القائمة قبل المرحلة تبقى سليمة (الشبكة الكاملة).
5. `UpdateOrderBody` يقبل `returnReason` ويُمرّره كما أُرسل (trim يحدث في الخادم).
6. حارس السبب: مفقود/null/فارغ/مسافات بعد trim -> مرفوض؛ سبب صالح -> مقبول.
7. تدفق كامل داخل معاملة: بدون سبب لا يحدث تحديث ولا تدقيق؛ بسب صالح يُصبح `RETURNED` مع `return_reason` محفوظاً فعلياً و `returned_at` مضبوطاً، ويُنشأ سجل تدقيق واحد `STATUS_CHANGED` بـ `note = سبب الإرجاع`.
8. طلب غير `DELIVERED` لا ينتقل إلى `RETURNED` (مصفوفة الانتقال تمنع).
9. عزل متعدد المتاجر: طلب المتجر B لا يُرى ضمن نطاق A ولا يُمسّ تدقيقه.
10. تجميع التقارير: فئة `RETURNED` موجودة ومحصاة مع `returnLoss` من `return_fee`.
11. عقود القراءة تقبل `returnReason` (nullable) و تقبل غيابها.

## 12) الفحص التشغيلي HTTP (Live HTTP smoke)

نُفّذ فحص HTTP حي على الخادم الجاري (منفذ 8080) بمتجر رملي كامل (متجر + صفحة + ولاية + حساب تاجر بكلمة مرور معروفة) أُنشئ مباشرة ثم نُظّف بالكامل في النهاية. **32 فحصاً نجحت كلها**:

0. تسجيل دخول التاجر الرملي -> 200 مع جلسة.
1. إنشاء طلب -> 201 ثم التسلسل `NEW -> PENDING_CONFIRMATION -> CONFIRMED -> SHIPPED -> DELIVERED` كلها 200.
2. `SHIPPED -> RETURNED` (حتى مع سبب) -> 422 "انتقال غير مسموح".
3. `DELIVERED -> RETURNED` بدون سبب -> 422 "سبب الإرجاع مطلوب"؛ وبسبب مسافات -> 422 أيضاً.
4. `DELIVERED -> RETURNED` بسبب صالح -> 200 والاستجابة تحمل `RETURNED` والسبب.
5. قاعدة البيانات: الصف `RETURNED`، `return_reason` محفوظ فعلياً، `returned_at` مضبوط.
6. سجل التدقيق: `STATUS_CHANGED DELIVERED -> RETURNED` موجود و `note` يحوي السبب.
7. بعد `RETURNED`: محاولة `-> DELIVERED` -> 422.
8. التقارير: `/orders/summary` `returned=1` و `returnLoss=200`؛ `/reports/daily` `returned=1`؛ قائمة `status=RETURNED` تعيد الطلب مع السبب.
9. التنظيف: حُذف المتجر الرملي وجميع صفوفه (تدقيق/طلبات/زبائن/مستخدمين/ولايات/صفحات). تحقق لاحق: أعداد قاعدة البيانات عادت إلى الخط الأساس و0 متجر رملي.

## 13) نتائج البناء والتراجع (Build & regression)

- `npm run typecheck` (المكتبات + الخادم + الويب): ناجح بلا أخطاء.
- `npm --prefix apps/api-server run test:return`: 58 فحصاً + تراجع كامل.
- `npm --prefix apps/api-server run test:lifecycle` (Phase 10.2): 47 فحصاً ناجحة.
- `npm --prefix apps/api-server run test:readiness` (Phase 10.1): 30 فحصاً ناجحة.
- `npm run build` الكامل (typecheck libs + api-server + web/vite): ناجح (تحذير حجم الحزمة سابق 1.08MB خارج النطاق).
- تراجع تشغيلي P1-02: واجهة العرض `GET /api/public/s/ordely-showcase -> 200` مع 8 منتجات (سليمة).

## 14) سلامة قاعدة البيانات (Database integrity)

- قبل التنفيذ (baseline): متاجر 3، طلبات 24، زبائن 15، صفحات 8، ولايات 58، تدقيق 74، مستخدمون 3، مزوّدون 1، رمل 0، مستخدموا @test.local 0.
- بعد التنفيذ: الأعداد نفسها تماماً، ورمل 0، @test.local 0. التغيير الدائم الوحيد في المخطط هو عمود `return_reason` (text nullable) - لا تغيير على بيانات الأعمال.
- لا reseed ولا `db:reset`؛ لم يتغيّر شيء في بيانات المتاجر الحقيقية (3 متاجر، 24 طلباً وغيرها).

## 15) المخاطر المتبقية (Remaining risks)

- `return_reason` حقل نصي حر دون قائمة أسباب مقنّنة (متعمّد حسب النطاق؛ يمكن لاحقاً تحويله إلى LOV مع الحفاظ على العقود).
- بيانات العرض القديمة في `showcaseSeed` تعرض مساراً قديماً `SHIPPED -> RETURNED` في الجدول الزمني التوضيحي للبيانات التجريبية فقط (نقطة تدوين، لا تؤثر على مصفوفة الانتقال الفعلية ولا على البيانات الحقيقية).
- لا يوجد حد زمني لإجراء الإرجاع بعد التسليم (مثلاً "خلال X يوم") - خارج النطاق.
- حالات `RETURNED` الحالية في قاعدة التطوير تبقى كما هي ولا يُعاد تشكيلها تلقائياً.
- لم تُغيّر لوحة المزوّد (فحص رؤية `RETURNED` فقط عبر العقد المشترك كما هو مطلوب).

## 16) تأكيد عدم تنفيذ P1-01 و P2-01

- **لم يُنفَّذ P1-01 (تتبع الطلبات):** لا توجد أي واجهة أو نهاية تتبع عامة للعميل، ولا جدول/حقول تتبع، ولا رمز تتبع؛ كل ما أُنجز توثيق الإرجاع داخل نظام التدقيق الموجود.
- **لم يُنفَّذ P2-01 (الإدخال اليدوي للطلبات):** لا واجهة إنشاء طلب يدوي، لا تغيير على `CreateOrderBody`، لا عمود `order_source` أو غير ذلك.
- لم تُنفَّذ أيضاً: مدفوعات، مخزون، CRM، إشعارات، أو أي تحسين غير ضروري خارج النطاق. التحكم ببيانات العميل/تعديل القوائم وغيرها بقيت كما كانت.

## 17) الخلاصة

المسار `DELIVERED -> RETURNED` أصبح قانونياً وموثّقاً: انتقال واحد، سبب إلزامي محفوظ في `orders.return_reason`، مرآة في سجل التدقيق، رفض صارم لكل ما عداه (من `RETURNED` أو من الحالات السابقة)، عقود محدّثة في القراءة (nullable) والكتابة، وواجهة تاجر بنافذة تأكيد. التقارير لم تُلمس لأنها تعالج الحالة سلفاً. توقّفت المرحلة هنا.

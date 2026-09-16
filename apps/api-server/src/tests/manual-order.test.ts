import { and, auditLogsTable, customersTable, db, deliveryCommuneSettingsTable, deliveryZonesTable, eq, landingPagesTable, ordersTable, sql, storesTable } from "@workspace/db";
import { CreateOrderBody, GetOrderResponse, ManualOrderBody } from "@workspace/api-zod";
import { executeManualOrder, MANUAL_ORDER_AUDIT_NOTE } from "../lib/manual-order.js";
import { findWilayaByCode } from "../lib/algeria-locations.js";
import type { ReadinessDb } from "../lib/readiness.js";

const ROLLBACK_SENTINEL = "__MANUAL_ORDER_TEST_ROLLBACK__";

let passed = 0;

function idOf(body: Record<string, unknown>): number {
  return Number((body as { id?: unknown }).id);
}

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${label}`);
  }
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function run() {
  const slug = `manual-order-${Date.now()}`;

  console.log("1: عقد ManualOrderBody - حدود الكمية");
  for (const qty of [1, 10]) {
    const ok = ManualOrderBody.safeParse({
      landingPageId: 1, customerName: "عميل", customerPhone: "0555000001",
      deliveryZoneId: 1, deliveryCommuneName: "بلدية", deliveryMethod: "OFFICE",
      quantity: qty,
    });
    assert(ok.success === true, `quantity = ${qty} مقبول`);
  }
  for (const qty of [0, 11, -1, 1.5]) {
    const bad = ManualOrderBody.safeParse({
      landingPageId: 1, customerName: "عميل", customerPhone: "0555000001",
      deliveryZoneId: 1, deliveryCommuneName: "بلدية", deliveryMethod: "OFFICE",
      quantity: qty,
    });
    assert(bad.success === false, `quantity = ${qty} مرفوض`);
  }

  console.log("2: عقد ManualOrderBody - الإلزاميات والاختياريات");
  const required = ManualOrderBody.safeParse({
    landingPageId: 1, customerName: "عميل", customerPhone: "0555000001",
    deliveryZoneId: 1, deliveryCommuneName: "بلدية", deliveryMethod: "OFFICE",
  });
  assert(required.success === true, "بدون quantity -> مقبول (الإلزاميات فقط)");
  const parsed = required.data as { quantity: number };
  assert(parsed.quantity === 1, "الكمية الافتراضية = 1");
  const missingPhone = ManualOrderBody.safeParse({
    landingPageId: 1, customerName: "عميل", deliveryZoneId: 1,
    deliveryCommuneName: "بلدية", deliveryMethod: "OFFICE",
  });
  assert(missingPhone.success === false, "بدون هاتف -> مرفوض");
  const missingMethod = ManualOrderBody.safeParse({
    landingPageId: 1, customerName: "عميل", customerPhone: "0555000001",
    deliveryZoneId: 1, deliveryCommuneName: "بلدية",
  });
  assert(missingMethod.success === false, "بدون طريقة التوصيل -> مرفوض");

  console.log("3: فصل تدفق اليدوي عن legacy");
  const manual = ManualOrderBody.safeParse({
    landingPageId: 1, customerName: "عميل", customerPhone: "0555000001",
    deliveryZoneId: 1, deliveryCommuneName: "بلدية", deliveryMethod: "OFFICE",
    customerCity: "الجزائر",
  });
  assert(manual.success === true, "ManualOrderBody يقبل payload شامل");
  assert(!("customerCity" in (manual.data as object)), "manual لا يحمل customerCity (تُقصّ المفاتيح الخارجية)");
  const legacy = CreateOrderBody.safeParse({
    landingPageId: 1, customerName: "عميل", customerPhone: "0555000001",
    customerCity: "الجزائر", deliveryZoneId: 1, deliveryCommuneName: "بلدية",
    deliveryMethod: "OFFICE", quantity: 1,
  });
  assert(legacy.success === true, "عقد CreateOrderBody (legacy) ما زال يقبل customerCity - التدفق القديم لم يُكسر");

  await db.transaction(async (tx) => {
    const client = tx as unknown as ReadinessDb;

    console.log("4: إنشاء طلب يدوي ناجح (OFFICE)");
    const [storeA] = await tx.insert(storesTable).values({
      name: "Manual Test A", slug, ownerName: "Owner A",
      phone: "0000000000", city: "Algiers", isActive: true,
    }).returning();
    const [storeB] = await tx.insert(storesTable).values({
      name: "Manual Test B", slug: `${slug}-b`, ownerName: "Owner B",
      phone: "0000000001", city: "Oran", isActive: true,
    }).returning();
    const [storeExpired] = await tx.insert(storesTable).values({
      name: "Manual Test Expired", slug: `${slug}-exp`, ownerName: "Owner Exp",
      phone: "0000000002", city: "Oran", isActive: true,
      subscriptionExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    }).returning();
    const [storeSuspended] = await tx.insert(storesTable).values({
      name: "Manual Test Suspended", slug: `${slug}-sus`, ownerName: "Owner Sus",
      phone: "0000000003", city: "Oran", isActive: false,
    }).returning();

    const [pageA] = await tx.insert(landingPagesTable).values({
      storeId: storeA.id, productName: "منتج يدوي", price: "1200",
      description: "منتج لاختبار الطلب اليدوي", slug: "manual-product",
      template: "classic", isActive: true,
      availableSizes: ["M", "L"], availableColors: ["أسود"],
    }).returning();
    const [pageB] = await tx.insert(landingPagesTable).values({
      storeId: storeB.id, productName: "منتج B", price: "900",
      description: "منتج المتجر الثاني", slug: "manual-product-b",
      template: "classic", isActive: true,
    }).returning();
    const [pageBare] = await tx.insert(landingPagesTable).values({
      storeId: storeA.id, productName: "منتج بدون خيارات", price: "800",
      description: "منتج بلا مقاسات", slug: "manual-product-bare",
      template: "classic", isActive: true,
    }).returning();

    const WILAYA = "16";
    const sourceWilaya = findWilayaByCode(WILAYA)!;
    const communeName = sourceWilaya.communes[0].name;

    const [zoneA] = await tx.insert(deliveryZonesTable).values({
      storeId: storeA.id, wilayaCode: WILAYA, wilayaName: sourceWilaya.name,
      isActive: true, officeFee: "500", homeFee: "300", returnFee: "200",
    }).returning();
    const [zoneB] = await tx.insert(deliveryZonesTable).values({
      storeId: storeB.id, wilayaCode: "31", wilayaName: "وهران",
      isActive: true, officeFee: "400", returnFee: "100",
    }).returning();

    const okBodyScalar = {
      landingPageId: Number(pageA.id), customerName: "عميل يدوي", customerPhone: "0555000011",
      deliveryZoneId: Number(zoneA.id), deliveryCommuneName: communeName,
      deliveryMethod: "OFFICE" as const, selectedSize: "M", selectedColor: "أسود", quantity: 1,
    };

    const outcome4 = await executeManualOrder(storeA.id, okBodyScalar, client);
    assert(outcome4.status === 201, "إنشاء ناجح -> 201");
    const body4 = outcome4 as Extract<typeof outcome4, { status: 201 }>;
    const order4 = body4.body as { id: number; status: string; unitPrice: number; totalPrice: number; deliveryFee: number; payableTotal: number; customerName: string; customerPhone: string };
    assert(order4.status === "NEW", "الحالة = NEW");
    assert(order4.unitPrice === 1200 && order4.totalPrice === 1200, "unitPrice=1200 و totalPrice=1200");
    assert(order4.deliveryFee === 500, "deliveryFee = رقم المكتب 500");
    assert(order4.payableTotal === 1700, "payableTotal = 1200 + 500");
    const [row4] = await tx.select().from(ordersTable).where(eq(ordersTable.id, order4.id));
    assert(row4.status === "NEW", "صف الطلب فعلياً في جدول orders بحالة NEW");
    assert(row4.deliveryMethod === "OFFICE", "deliveryMethod = OFFICE محفوظ");
    assert(row4.selectedSize === "M" && row4.selectedColor === "أسود", "المقاس واللون محفوظان");
    assert(Number(row4.returnFee) === 200, "returnFee محفوظ = 200");

    console.log("5: الكمية الافتراضية والحد الأعلى");
    const body5 = { ...okBodyScalar, quantity: undefined, deliveryCommuneName: communeName };
    const outcome5 = await executeManualOrder(storeA.id, body5, client);
    assert(outcome5.status === 201, "بدون كمية -> 201");
    if (outcome5.status === 201) {
      const b5 = outcome5.body as { id: number; quantity: number; totalPrice: number };
      const [r5] = await tx.select().from(ordersTable).where(eq(ordersTable.id, b5.id));
      assert(r5.quantity === 1, "الكمية الافتاراضية محفوظة = 1");
      assert(b5.totalPrice === 1200, "totalPrice = unitPrice عند الكمية 1");
    }
    const outcome5b = await executeManualOrder(storeA.id, { ...okBodyScalar, quantity: 10 }, client);
    assert(outcome5b.status === 201, "كمية 10 -> 201");
    if (outcome5b.status === 201) {
      const b5b = outcome5b.body as { totalPrice: number };
      assert(b5b.totalPrice === 12000, "totalPrice = 1200 * 10");
    }

    console.log("6: التحقق من الأصناف (مقاس/لون)");
    const noSize = await executeManualOrder(storeA.id, { ...okBodyScalar, selectedSize: undefined, selectedColor: undefined }, client);
    assert(noSize.status === 422, "غياب المقاس عندما يكون مطلوباً -> 422");
    if (noSize.status === 422) assert((noSize.body as { error: string }).error === "selectedSize is required for this product", "رسالة المقاس المطلوب");
    const badSize = await executeManualOrder(storeA.id, { ...okBodyScalar, selectedSize: "XXL" }, client);
    assert(badSize.status === 422, "مقاس غير متوفر -> 422");
    const bareOk = await executeManualOrder(storeA.id, {
      landingPageId: Number(pageBare.id), customerName: "بلا خيارات", customerPhone: "0555000012",
      deliveryZoneId: Number(zoneA.id), deliveryCommuneName: communeName,
      deliveryMethod: "OFFICE", quantity: 1,
    }, client);
    assert(bareOk.status === 201, "منتج بدون خيارات -> نجاح بدون مقاس/لون");

    console.log("7: إعادة استخدام العميل عند تكرار الهاتف");
    const [order7] = await tx.select().from(ordersTable).where(eq(ordersTable.id, idOf(outcome4.body)));
    const [cust7Before] = await tx.select().from(customersTable).where(eq(customersTable.id, order7.customerId!));
    assert(cust7Before.name === "عميل يدوي", "العميل الأول باسمه الأصلي");
    const outcome7 = await executeManualOrder(storeA.id, { ...okBodyScalar, customerName: "عميل محدّث", customerPhone: "0555000011" }, client);
    assert(outcome7.status === 201, "نفس الهاتف -> 201");
    if (outcome7.status === 201) {
      const [order7b] = await tx.select().from(ordersTable).where(eq(ordersTable.id, idOf(outcome7.body)));
      assert(order7b.customerId === order7.customerId, "نفس customerId أُعيد استخدامه");
      const [cust7After] = await tx.select().from(customersTable).where(eq(customersTable.id, order7.customerId!));
      assert(cust7After.name === "عميل محدّث", "اسم العميل حُدّث للطلب الجديد");
    }
    const aCustomers = await tx.select().from(customersTable).where(eq(customersTable.storeId, storeA.id));
    assert(aCustomers.filter(c => c.phone === "0555000011").length === 1, "صف عميل واحد فقط لنفس الهاتف");

    console.log("8: إنشاء عميل جديد بالمدينة من الولاية");
    const outcome8 = await executeManualOrder(storeA.id, { ...okBodyScalar, customerName: "عميل جديد", customerPhone: "0555000022" }, client);
    assert(outcome8.status === 201, "هاتف جديد -> 201");
    if (outcome8.status === 201) {
      const [order8] = await tx.select().from(ordersTable).where(eq(ordersTable.id, idOf(outcome8.body)));
      const [cust8] = await tx.select().from(customersTable).where(eq(customersTable.id, order8.customerId!));
      assert(cust8.phone === "0555000022", "العميل الجديد أُنشئ");
      assert(cust8.city === sourceWilaya.name, `customerCity = اسم الولاية (${sourceWilaya.name})`);
    }

    console.log("9: عزل المنتج بين المتاجر والمتجر غير الموجود");
    const crossPage = await executeManualOrder(storeA.id, {
      ...okBodyScalar, landingPageId: Number(pageB.id), customerName: "مستخدم B", customerPhone: "0555000033",
    }, client);
    assert(crossPage.status === 404, "منتج المتجر B عبر A -> 404");
    if (crossPage.status === 404) assert((crossPage.body as { error: string }).error === "المنتج غير موجود", "رسالة المنتج غير موجود");
    const noStore = await executeManualOrder(9999999, okBodyScalar, client);
    assert(noStore.status === 404, "متجر غير موجود -> 404");
    if (noStore.status === 404) assert((noStore.body as { error: string }).error === "Store not found", "رسالة Store not found");

    console.log("10: عزل العميل بين المتاجر");
    await tx.insert(customersTable).values({
      storeId: storeB.id, name: "عميل B", phone: "0777000001", city: "وهران",
    });
    const outcome10 = await executeManualOrder(storeA.id, { ...okBodyScalar, customerPhone: "0777000001" }, client);
    assert(outcome10.status === 201, "نفس الهاتف على متجر آخر -> 201 (لا رفض)");
    if (outcome10.status === 201) {
      const [order10] = await tx.select().from(ordersTable).where(eq(ordersTable.id, idOf(outcome10.body)));
      const [custB] = await tx.select().from(customersTable).where(and(eq(customersTable.storeId, storeB.id), eq(customersTable.phone, "0777000001")));
      const [custA] = await tx.select().from(customersTable).where(and(eq(customersTable.storeId, storeA.id), eq(customersTable.phone, "0777000001")));
      assert(order10.customerId === custA.id && custA.id !== custB.id, "عميل A جديد مستقل عن عميل B (لا يُسرَّب)");
    }

    console.log("11: عزل الولاية بين المتاجر");
    const crossZone = await executeManualOrder(storeA.id, {
      ...okBodyScalar, deliveryZoneId: Number(zoneB.id), customerPhone: "0555000044",
      deliveryCommuneName: "بلدية وهمية",
    }, client);
    assert(crossZone.status === 422, "ولاية المتجر B عبر A -> 422");
    if (crossZone.status === 422) assert((crossZone.body as { error: string }).error === "الولاية غير متاحة للتوصيل حاليا", "رسالة الولاية غير متاحة");

    console.log("12: بلدية لا تتبع الولاية المختارة");
    const badCommune = await executeManualOrder(storeA.id, { ...okBodyScalar, deliveryCommuneName: "بلدية وهمية" }, client);
    assert(badCommune.status === 422, "بلدية غير تابعة -> 422");
    if (badCommune.status === 422) assert((badCommune.body as { error: string }).error === "البلدية لا تتبع الولاية المختارة", "رسالة عدم التبعية");

    console.log("13: بلدية معطّلة عبر إعدادات البلديات");
    const [disabledCommune] = await tx.insert(deliveryCommuneSettingsTable).values({
      storeId: storeA.id, wilayaCode: WILAYA, communeName, dairaName: sourceWilaya.communes[0].dairaName, isActive: false,
    }).returning();
    void disabledCommune;
    const disabled = await executeManualOrder(storeA.id, {
      ...okBodyScalar, deliveryCommuneName: communeName, customerPhone: "0555000055",
    }, client);
    assert(disabled.status === 422, "بلدية معطّلة -> 422");
    if (disabled.status === 422) assert((disabled.body as { error: string }).error === "البلدية غير متاحة للتوصيل حاليا", "رسالة البلدية غير متاحة");
    await tx.delete(deliveryCommuneSettingsTable).where(eq(deliveryCommuneSettingsTable.id, disabledCommune.id));

    console.log("14: طريقة توصيل غير صالحة");
    const badMethod = ManualOrderBody.safeParse({
      landingPageId: 1, customerName: "عميل", customerPhone: "0555000001",
      deliveryZoneId: 1, deliveryCommuneName: "بلدية", deliveryMethod: "CAR",
    });
    assert(badMethod.success === false, "deliveryMethod خارج HOME/OFFICE -> عقد يرفض 400");

    console.log("15: HOME - العنوان مطلوب ثم النجاح");
    const homeNoAddress = await executeManualOrder(storeA.id, { ...okBodyScalar, deliveryMethod: "HOME", customerAddress: undefined }, client);
    assert(homeNoAddress.status === 422, "HOME بدون عنوان -> 422");
    if (homeNoAddress.status === 422) assert((homeNoAddress.body as { error: string }).error === "العنوان مطلوب عند التوصيل إلى المنزل", "رسالة العنوان المطلوب");
    const homeOk = await executeManualOrder(storeA.id, { ...okBodyScalar, deliveryMethod: "HOME", customerAddress: "حي 5 جويلية، شارع 1" }, client);
    assert(homeOk.status === 201, "HOME مع عنوان -> 201");
    if (homeOk.status === 201) {
      const h = homeOk.body as { deliveryFee: number; payableTotal: number };
      assert(h.deliveryFee === 800, "رسوم المنزل = office 500 + home 300");
      assert(h.payableTotal === 1200 + 800, "payableTotal يشمل رسوم المنزل");
    }

    console.log("16: OFFICE لا يتطلب عنواناً");
    const officeOk = await executeManualOrder(storeA.id, {
      ...okBodyScalar, deliveryMethod: "OFFICE", customerAddress: undefined, customerPhone: "0555000066",
    }, client);
    assert(officeOk.status === 201, "OFFICE بدون عنوان -> 201");
    if (officeOk.status === 201) assert((officeOk.body as { deliveryFee: number }).deliveryFee === 500, "رسوم المكتب فقط 500");

    console.log("17: الاشتراك - EXPIRED يرفض و EXPIRING_SOON يقبل");
    const expired = await executeManualOrder(storeExpired.id, {
      landingPageId: Number(pageA.id), customerName: "عميل", customerPhone: "0555000077",
      deliveryZoneId: Number(zoneA.id), deliveryCommuneName: communeName, deliveryMethod: "OFFICE", quantity: 1,
    }, client);
    assert(expired.status === 422, "اشتراك منتهي -> 422");
    if (expired.status === 422) {
      const msg = (expired.body as { error: string }).error;
      assert(msg === "اشتراك المتجر منتهي", "رسالة الاشتراك المنتهي");
    }
    const [storeSoon] = await tx.insert(storesTable).values({
      name: "Manual Test Soon", slug: `${slug}-soon`, ownerName: "Owner Soon",
      phone: "0000000004", city: "Oran", isActive: true,
      subscriptionExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    }).returning();
    const [pageSoon] = await tx.insert(landingPagesTable).values({
      storeId: storeSoon.id, productName: "منتج Soon", price: "1500",
      description: "منتج متجر قارب الانتهاء", slug: "manual-product-soon",
      template: "classic", isActive: true,
    }).returning();
    const [zoneSoon] = await tx.insert(deliveryZonesTable).values({
      storeId: storeSoon.id, wilayaCode: WILAYA, wilayaName: sourceWilaya.name,
      isActive: true, officeFee: "500", homeFee: "300", returnFee: "200",
    }).returning();
    const soon = await executeManualOrder(storeSoon.id, {
      landingPageId: Number(pageSoon.id), customerName: "عميل", customerPhone: "0555000088",
      deliveryZoneId: Number(zoneSoon.id), deliveryCommuneName: communeName, deliveryMethod: "OFFICE", quantity: 1,
    }, client);
    assert(soon.status === 201, "اشتراك قارب الانتهاء (EXPIRING_SOON) -> مقبول");

    console.log("18: المتجر الموقوف (is_active = false)");
    const suspended = await executeManualOrder(storeSuspended.id, {
      landingPageId: Number(pageA.id), customerName: "عميل", customerPhone: "0555000099",
      deliveryZoneId: Number(zoneA.id), deliveryCommuneName: communeName, deliveryMethod: "OFFICE", quantity: 1,
    }, client);
    assert(suspended.status === 422, "متجر موقوف -> 422");
    if (suspended.status === 422) assert((suspended.body as { error: string }).error === "المتجر موقوف حالياً ولا يقبل طلبات جديدة", "رسالة المتجر الموقوف");

    console.log("19: سجل التدقيق للطلب اليدوي");
    const auditRows = await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.orderId, order4.id), eq(auditLogsTable.storeId, storeA.id)));
    assert(auditRows.length === 1, "سجل تدقيق واحد للطلب اليدوي");
    assert(auditRows[0].action === "ORDER_CREATED", "action = ORDER_CREATED");
    assert(auditRows[0].toStatus === "NEW", "toStatus = NEW");
    assert(auditRows[0].note === MANUAL_ORDER_AUDIT_NOTE, "الملاحظة = 'طلب يدوي عبر التاجر'");
    assert(MANUAL_ORDER_AUDIT_NOTE === "طلب يدوي عبر التاجر", "النوت الثابتة صحيحة");

    console.log("20: التقارير تشمل الطلب اليدوي + الاتساق مع المسار العام");
    const reportRows = await tx.select({
      status: ordersTable.status,
      count: sql<number>`count(*)::int`,
    }).from(ordersTable).where(eq(ordersTable.storeId, storeA.id)).groupBy(ordersTable.status);
    const newBucket = reportRows.find(r => r.status === "NEW");
    assert(newBucket !== undefined, "فئة NEW موجودة في تجميع التقارير");
    const newCount = newBucket ? Number(newBucket.count) : 0;
    assert(newCount >= 7, `التقارير تحسب الطلبات اليدوية (NEW=${newCount})`);
    const orderParsed = GetOrderResponse.safeParse({
      id: order4.id, storeId: storeA.id, landingPageId: pageA.id,
      customerName: order4.customerName, customerPhone: order4.customerPhone,
      customerCity: sourceWilaya.name, quantity: 1, totalPrice: 1200,
      status: "NEW", createdAt: new Date().toISOString(),
    });
    assert(orderParsed.success === true, "عقد القراءة المشترك يقبل الطلب اليدوي (نفس جدول orders / حالة NEW)");
    assert(row4.storeId === storeA.id && row4.landingPageId === pageA.id, "الطلب اليدوي مقيّد بالمتجر والمنتج نفسه");

    throw new Error(ROLLBACK_SENTINEL);
  });

  const survivors = await db.select().from(storesTable).where(eq(storesTable.slug, slug));
  assert(survivors.length === 0, "لا أثر للمتاجر الرملية بعد التراجع");
}

try {
  await run();
  console.log(`\nجميع الاختبارات نجحت (${passed} assertion).`);
} catch (err) {
  if (err instanceof Error && err.message === ROLLBACK_SENTINEL) {
    console.log(`\nنجحت جميع الاختبارات وتم التراجع (${passed} assertion).`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
}
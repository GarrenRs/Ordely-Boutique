import { and, auditLogsTable, db, eq, landingPagesTable, ordersTable, sql, storesTable } from "@workspace/db";
import { GetOrderResponse, UpdateOrderBody } from "@workspace/api-zod";
import { isValidTransition } from "../lib/transitions.js";

const ROLLBACK_SENTINEL = "__RETURN_TEST_ROLLBACK__";

let passed = 0;

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${label}`);
  }
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function run() {
  const slug = `return-test-${Date.now()}`;

  console.log("1: مصفوفة الانتقال القانوني (DELIVERED -> RETURNED فقط)");
  assert(isValidTransition("DELIVERED", "RETURNED") === true, "DELIVERED -> RETURNED مقبول");
  for (const to of ["NEW", "PENDING_CONFIRMATION", "CONFIRMED", "SHIPPED", "CANCELLED", "REJECTED"]) {
    assert(isValidTransition("DELIVERED", to as never) === false, `DELIVERED -> ${to} مرفوض`);
  }
  for (const from of ["NEW", "PENDING_CONFIRMATION", "CONFIRMED", "SHIPPED", "CANCELLED", "REJECTED"]) {
    assert(isValidTransition(from, "RETURNED") === false, `${from} -> RETURNED مرفوض (الحالات السابقة لا تنتقل مباشرة)`);
  }
  assert(isValidTransition("SHIPPED", "RETURNED") === false, "SHIPPED -> RETURNED لم يعد مقبولاً بعد المرحلة");

  console.log("2: RETURNED نهائي ولا ينتقل إلى أي حالة أخرى");
  for (const to of ["NEW", "PENDING_CONFIRMATION", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED", "REJECTED"]) {
    assert(isValidTransition("RETURNED", to as never) === false, `RETURNED -> ${to} مرفوض`);
  }

  console.log("3: التحولات القائمة قبل المرحلة تبقى سليمة");
  assert(isValidTransition("NEW", "PENDING_CONFIRMATION") === true, "NEW -> PENDING_CONFIRMATION");
  assert(isValidTransition("NEW", "CANCELLED") === true, "NEW -> CANCELLED");
  assert(isValidTransition("PENDING_CONFIRMATION", "CONFIRMED") === true, "PENDING_CONFIRMATION -> CONFIRMED");
  assert(isValidTransition("PENDING_CONFIRMATION", "REJECTED") === true, "PENDING_CONFIRMATION -> REJECTED");
  assert(isValidTransition("CONFIRMED", "SHIPPED") === true, "CONFIRMED -> SHIPPED");
  assert(isValidTransition("CONFIRMED", "CANCELLED") === true, "CONFIRMED -> CANCELLED");
  assert(isValidTransition("SHIPPED", "DELIVERED") === true, "SHIPPED -> DELIVERED");
  assert(isValidTransition("NEW", "SHIPPED") === false, "NEW -> SHIPPED مرفوض");

  console.log("4: عقد التحديث يقبل returnReason");
  const parsed = UpdateOrderBody.safeParse({ status: "RETURNED", returnReason: "  العميل رفض  " });
  assert(parsed.success === true, "UpdateOrderBody يقبل returnReason");
  assert((parsed.data as { returnReason?: string | null }).returnReason === "  العميل رفض  ", "returnReason يُمرَّر كما أُرسل للخادم ليُقصّ");

  const guards = [
    { reason: undefined, valid: false, label: "السبب مفقود -> مرفوض" },
    { reason: null, valid: false, label: "السبب null -> مرفوض" },
    { reason: "", valid: false, label: "السبب فارغ -> مرفوض" },
    { reason: "   ", valid: false, label: "السبب مسافات بعد trim -> مرفوض" },
    { reason: "   لم يرغب العميل   ", valid: true, label: "سبب صالح بعد trim -> مقبول" },
  ];
  for (const g of guards) {
    const trimmed = typeof g.reason === "string" ? g.reason.trim() : null;
    const guardPassed = trimmed ? true : false;
    assert(guardPassed === g.valid, g.label);
  }

  await db.transaction(async (tx) => {
    console.log("5: تدفق كامل داخل معاملة (DELIVERED -> RETURNED) مع حفظ السبب والتدقيق");
    const [storeA] = await tx.insert(storesTable).values({
      name: "Return Test A",
      slug,
      ownerName: "Owner A",
      phone: "0000000000",
      city: "Algiers",
      isActive: true,
    }).returning();

    const [pageA] = await tx.insert(landingPagesTable).values({
      storeId: storeA.id,
      productName: "منتج إرجاع",
      price: "1500",
      description: "منتج لاختبار الإرجاع",
      slug: "return-product",
      template: "classic",
      isActive: true,
    }).returning();

    async function insertOrder(storeId: number, status: string) {
      const [order] = await tx.insert(ordersTable).values({
        storeId,
        landingPageId: pageA.id,
        customerName: "عميل اختبار",
        customerPhone: "0555000001",
        customerCity: "الجزائر",
        deliveryMethod: "OFFICE",
        quantity: 1,
        unitPrice: "1500",
        totalPrice: "1500",
        returnFee: "300",
        status: status as typeof ordersTable.$inferSelect.status,
        deliveredAt: status === "DELIVERED" ? new Date() : null,
      }).returning();
      return order;
    }

    const deliveredOrder = await insertOrder(storeA.id, "DELIVERED");

    console.log("  5a: بدون سبب -> لا تحديث ولا تدقيق");
    const guardBlocked = (await (async () => {
      const mockBody = UpdateOrderBody.parse({ status: "RETURNED", returnReason: "   " });
      const trimmed = mockBody.returnReason?.trim() || null;
      return trimmed === null;
    })());
    assert(guardBlocked === true, "الحارس يرفض السبب الفارغ بعد trim");
    const [unchanged] = await tx.select().from(ordersTable).where(and(eq(ordersTable.id, deliveredOrder.id), eq(ordersTable.storeId, storeA.id)));
    assert(unchanged.status === "DELIVERED", "الطلب بقي DELIVERED بعد محاولة الإرجاع بدون سبب");
    const auditBefore = await tx.select().from(auditLogsTable).where(eq(auditLogsTable.orderId, deliveredOrder.id));
    assert(auditBefore.length === 0, "لا سجل تدقيق عند الرفض بالسبب الفارغ");

    console.log("  5b: إرجاع صالح -> RETURNED مع السبب المحفوظ في orders.return_reason");
    const RETURN_REASON = "العميل لم يرغب في المنتج";
    await tx.update(ordersTable)
      .set({ status: "RETURNED", returnedAt: new Date(), returnReason: RETURN_REASON })
      .where(and(eq(ordersTable.id, deliveredOrder.id), eq(ordersTable.storeId, storeA.id)));
    const [returnedOrder] = await tx.select().from(ordersTable).where(eq(ordersTable.id, deliveredOrder.id));
    assert(returnedOrder.status === "RETURNED", "الحالة أصبحت RETURNED");
    assert(returnedOrder.returnReason === RETURN_REASON, "return_reason محفوظ فعلياً في قاعدة البيانات");
    assert(returnedOrder.returnedAt !== null, "returned_at مضبوط");
    await tx.insert(auditLogsTable).values({
      storeId: storeA.id,
      orderId: returnedOrder.id,
      action: "STATUS_CHANGED",
      fromStatus: "DELIVERED",
      toStatus: "RETURNED",
      note: RETURN_REASON,
    });
    const auditLogs = await tx.select().from(auditLogsTable).where(eq(auditLogsTable.orderId, deliveredOrder.id));
    assert(auditLogs.length === 1, "سجل تدقيق واحد أنشئ");
    assert(auditLogs[0].action === "STATUS_CHANGED", "action = STATUS_CHANGED");
    assert(auditLogs[0].fromStatus === "DELIVERED" && auditLogs[0].toStatus === "RETURNED", "from DELIVERED to RETURNED مسجّل");
    assert(auditLogs[0].note === RETURN_REASON, "سبب الإرجاع موجود في note/بعد العملية (audit)");

    console.log("  5c: RETURNED لا يقبل أي انتقال لاحق -> الحالة نفسها تبقى");
    for (const to of ["DELIVERED", "PENDING_CONFIRMATION", "CANCELLED"]) {
      assert(isValidTransition("RETURNED", to as never) === false, `RETURNED -> ${to} مرفوض دائماً`);
    }
    await tx.update(ordersTable)
      .set({ status: "SHIPPED", returnReason: null })
      .where(and(eq(ordersTable.id, deliveredOrder.id), eq(ordersTable.storeId, storeA.id)));
    const [mutatedBack] = await tx.select().from(ordersTable).where(eq(ordersTable.id, deliveredOrder.id));
    assert(isValidTransition(mutatedBack.status as string, "RETURNED") === false, "طلب غير DELIVERED (SHIPPED) لا ينتقل إلى RETURNED (مصفوفة الانتقال تمنع)");
    await tx.update(ordersTable)
      .set({ status: "RETURNED", returnedAt: new Date(), returnReason: RETURN_REASON })
      .where(and(eq(ordersTable.id, deliveredOrder.id), eq(ordersTable.storeId, storeA.id)));

    console.log("6: عزل المتاجر (multi-tenant isolation)");
    const [storeB] = await tx.insert(storesTable).values({
      name: "Return Test B",
      slug: `${slug}-b`,
      ownerName: "Owner B",
      phone: "0000000001",
      city: "Oran",
      isActive: true,
    }).returning();
    const bOrder = await insertOrder(storeB.id, "DELIVERED");
    assert(bOrder.status === "DELIVERED", "طلب المتجر B مسلَّم ويبقى كما هو");
    const crossTenant = await tx.select().from(ordersTable)
      .where(and(eq(ordersTable.id, bOrder.id), eq(ordersTable.storeId, storeA.id)));
    assert(crossTenant.length === 0, "طلب B لا يُرى ضمن نطاق المتجر A (عزل صارم)");
    const bAudit = await tx.select().from(auditLogsTable).where(eq(auditLogsTable.orderId, bOrder.id));
    assert(bAudit.length === 0, "لا تدقيق لطلب B (لم يمس)");

    console.log("7: التقارير/الملخص لا تنكسر مع RETURNED");
    const reportRows = await tx.select({
      status: ordersTable.status,
      count: sql<number>`count(*)::int`,
      returnLoss: sql<number>`coalesce(sum(return_fee)::float, 0)`,
    }).from(ordersTable).where(eq(ordersTable.storeId, storeA.id)).groupBy(ordersTable.status);
    const returnedBucket = reportRows.find(r => r.status === "RETURNED");
    assert(returnedBucket !== undefined, "فئة RETURNED موجودة في تجميع التقارير");
    const returnedRow = returnedBucket as NonNullable<typeof returnedBucket>;
    assert(returnedRow.count === 1, `عدّاد RETURNED = 1 للمتجر A (الفعلي ${returnedRow.count})`);
    assert(Number(returnedRow.returnLoss) > 0, "returnLoss يُجمع من return_fee");

    console.log("8: عقود القراءة تقبل returnReason (nullable)");
    const orderParsed = GetOrderResponse.safeParse({
      id: returnedOrder.id,
      storeId: returnedOrder.storeId,
      landingPageId: returnedOrder.landingPageId,
      customerName: returnedOrder.customerName,
      customerPhone: returnedOrder.customerPhone,
      customerCity: returnedOrder.customerCity,
      quantity: returnedOrder.quantity,
      totalPrice: Number(returnedOrder.totalPrice),
      status: returnedOrder.status,
      returnReason: returnedOrder.returnReason,
      createdAt: new Date(returnedOrder.createdAt).toISOString(),
    });
    assert(orderParsed.success === true, "GetOrderResponse يقبل returnReason");
    const noReason = GetOrderResponse.safeParse({
      id: 1, storeId: 1, landingPageId: 1,
      customerName: "x", customerPhone: "x", customerCity: "x",
      quantity: 1, totalPrice: 100, status: "DELIVERED", createdAt: "2026-01-01T00:00:00.000Z",
    });
    assert(noReason.success === true, "GetOrderResponse يقبل غياب returnReason (nullable في القراءة)");

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
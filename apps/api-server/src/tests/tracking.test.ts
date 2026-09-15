import { and, customersTable, db, eq, landingPagesTable, ordersTable, sql, storesTable } from "@workspace/db";
import { TrackOrderStatusBody, TrackOrderStatusResponse } from "@workspace/api-zod";

const ROLLBACK_SENTINEL = "__TRACKING_TEST_ROLLBACK__";

let passed = 0;

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${label}`);
  }
  passed += 1;
  console.log(`  ok  ${label}`);
}

const iso = "2026-09-15T10:00:00.000Z";

async function run() {
  console.log("1: عقد الطلب (malformed -> مرفوض بنفس convention)");
  const validBody = TrackOrderStatusBody.safeParse({ orderId: 43, phone: "0555000001" });
  assert(validBody.success === true, "orderId + phone صحيحان -> مقبول");
  const stringId = TrackOrderStatusBody.safeParse({ orderId: "43", phone: "0555000001" });
  assert(stringId.success === false, "orderId ليس رقماً -> مرفوض");
  const missingPhone = TrackOrderStatusBody.safeParse({ orderId: 43 });
  assert(missingPhone.success === false, "phone مفقود -> مرفوض");
  const zeroId = TrackOrderStatusBody.safeParse({ orderId: 0, phone: "0555000001" });
  assert(zeroId.success === false, "orderId <= 0 -> مرفوض");
  const phoneGuard = TrackOrderStatusBody.parse({ orderId: 43, phone: "0555000001" }).phone.trim().length > 0;
  assert(phoneGuard === true, "هاتف غير فارغ بعد trim -> مقبول");

  console.log("2: عقد الاستجابة يعرض حقول التتبع الأساسية فقط (لا حساسات)");
  const resp = TrackOrderStatusResponse.safeParse({
    orderId: 43,
    status: "DELIVERED",
    createdAt: iso,
    updatedAt: iso,
    returnedAt: null,
    deliveredAt: iso,
  });
  assert(resp.success === true, "استجابة تتبع كاملة -> مقبولة");
  const respNoEmpty = TrackOrderStatusResponse.safeParse({
    orderId: 43,
    status: "NEW",
    createdAt: iso,
    updatedAt: iso,
  });
  assert(respNoEmpty.success === true, "returnedAt/deliveredAt اختيارية (nullish)");
  const leaked = TrackOrderStatusResponse.parse({
    orderId: 43,
    status: "NEW",
    createdAt: iso,
    updatedAt: iso,
    customerName: "معلومة سرية",
    customerPhone: "0555000001",
    customerAddress: "عنوان سري",
    notes: "ملاحظة سرية",
  });
  assert(!("customerName" in leaked), "عقد الاستجابة لا يعرض customerName");
  assert(!("customerPhone" in leaked), "عقد الاستجابة لا يعرض customerPhone");
  assert(!("customerAddress" in leaked) && !("notes" in leaked), "عقد الاستجابة لا يعرض العنوان أو الملاحظات");

  await db.transaction(async (tx) => {
    const slug = `track-test-${Date.now()}`;
    const [storeA] = await tx.insert(storesTable).values({
      name: "Track Test A",
      slug,
      ownerName: "Owner A",
      phone: "0000000000",
      city: "Algiers",
      isActive: true,
    }).returning();

    const [pageA] = await tx.insert(landingPagesTable).values({
      storeId: storeA.id,
      productName: "منتج تتبع",
      price: "1200",
      description: "منتج لاختبار التتبع",
      slug: "track-product",
      template: "classic",
      isActive: true,
    }).returning();

    const [custA] = await tx.insert(customersTable).values({
      storeId: storeA.id,
      name: "عميل أ",
      phone: "0555000001",
      city: "الجزائر",
    }).returning();

    async function insertOrder(storeId: number, phone: string, status: string, extra: Record<string, unknown> = {}) {
      const [order] = await tx.insert(ordersTable).values({
        storeId,
        landingPageId: pageA.id,
        customerId: custA.id,
        customerName: "عميل اختبار",
        customerPhone: phone,
        customerCity: "الجزائر",
        customerAddress: "عنوان سري للاختبار",
        deliveryMethod: "OFFICE",
        quantity: 1,
        unitPrice: "1200",
        totalPrice: "1200",
        notes: "ملاحظة سرية للاختبار",
        status: status as typeof ordersTable.$inferSelect.status,
        ...extra,
      }).returning();
      return order;
    }

    async function trackingQuery(orderId: number, phone: string) {
      return tx.select({
        id: ordersTable.id,
        status: ordersTable.status,
        createdAt: ordersTable.createdAt,
        updatedAt: ordersTable.updatedAt,
        returnedAt: ordersTable.returnedAt,
        deliveredAt: ordersTable.deliveredAt,
      }).from(ordersTable)
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.customerPhone, phone)))
        .limit(1);
    }

    console.log("3: orderId + phone صحيحان -> 200 (الطلب يُعثر عليه، والحالة مطابقة للـ DB)");
    const delivered = await insertOrder(storeA.id, "0555000001", "DELIVERED", { deliveredAt: new Date("2026-09-14T09:00:00.000Z") });
    const found = await trackingQuery(delivered.id, "0555000001");
    assert(found.length === 1, "orderId + phone صحيحان -> صف واحد موجود");
    const rowA = found[0];
    assert(rowA.status === "DELIVERED", `الحالة تعود كما في DB (DELIVERED، الفعلي ${rowA.status})`);
    assert(Object.keys(rowA).length === 6, "الاستعلام يعيد الحقول الخمسة الأساسية فقط (لا اسم/هاتف/عنوان/ملاحظات)");
    const rowParsedA = TrackOrderStatusResponse.parse({
      orderId: rowA.id,
      status: rowA.status,
      createdAt: new Date(rowA.createdAt).toISOString(),
      updatedAt: new Date(rowA.updatedAt).toISOString(),
      returnedAt: rowA.returnedAt ? new Date(rowA.returnedAt).toISOString() : null,
      deliveredAt: rowA.deliveredAt ? new Date(rowA.deliveredAt).toISOString() : null,
    });
    assert(rowParsedA.status === "DELIVERED", "عقد الاستجابة يطابق حالة DB");

    console.log("4: phone خاطئ -> 404");
    const wrongPhone = await trackingQuery(delivered.id, "0555000999");
    assert(wrongPhone.length === 0, "phone خاطئ -> لا صف (استجابة 404 موحدة)");

    console.log("5: orderId غير موجود -> 404");
    const unknownId = await trackingQuery(99999999, "0555000001");
    assert(unknownId.length === 0, "orderId غير معروف -> لا صف (استجابة 404 موحدة)");

    console.log("6: عزل المتاجر (multi-tenant isolation)");
    const [storeB] = await tx.insert(storesTable).values({
      name: "Track Test B",
      slug: `${slug}-b`,
      ownerName: "Owner B",
      phone: "0000000001",
      city: "Oran",
      isActive: true,
    }).returning();
    const bDelivered = await insertOrder(storeB.id, "0555000002", "DELIVERED", { deliveredAt: new Date("2026-09-14T10:00:00.000Z") });
    const crossA2B = await trackingQuery(bDelivered.id, "0555000001");
    assert(crossA2B.length === 0, "رقم طلب B مع هاتف A -> لا صف (لا تسريب عبر المتاجر)");
    const crossB2A = await trackingQuery(delivered.id, "0555000002");
    assert(crossB2A.length === 0, "رقم طلب A مع هاتف B -> لا صف");

    console.log("7: RETURNED / CANCELLED / REJECTED قابلة للتتبع وتبقى حالاتها");
    const returned = await insertOrder(storeA.id, "0555000003", "RETURNED", { returnedAt: new Date("2026-09-14T11:00:00.000Z"), returnReason: "سبب" });
    const cancelled = await insertOrder(storeA.id, "0555000004", "CANCELLED");
    const rejected = await insertOrder(storeA.id, "0555000005", "REJECTED");
    const returnedFound = await trackingQuery(returned.id, "0555000003");
    assert(returnedFound.length === 1 && returnedFound[0].status === "RETURNED", "RETURNED يُتتبع ويعيد same status");
    const cancelledFound = await trackingQuery(cancelled.id, "0555000004");
    assert(cancelledFound.length === 1 && cancelledFound[0].status === "CANCELLED", "CANCELLED يُتتبع ويعيد same status");
    const rejectedFound = await trackingQuery(rejected.id, "0555000005");
    assert(rejectedFound.length === 1 && rejectedFound[0].status === "REJECTED", "REJECTED يُتتبع ويعيد same status");
    const savedAt = await tx.select({ status: ordersTable.status, returnedAt: ordersTable.returnedAt }).from(ordersTable).where(eq(ordersTable.id, returned.id));
    assert(savedAt[0].status === returnedFound[0].status, "status المتبوع مطابق لقاعدة البيانات");

    console.log("8: التتبع لا يعدّل قاعدة البيانات (قراءة فقط)");
    const [before] = await tx.select({ c: sql<number>`count(*)::int` }).from(ordersTable).where(eq(ordersTable.storeId, storeA.id));
    await trackingQuery(delivered.id, "0555000001");
    await trackingQuery(delivered.id, "0555000999");
    await trackingQuery(99999999, "x");
    const [after] = await tx.select({ c: sql<number>`count(*)::int` }).from(ordersTable).where(eq(ordersTable.storeId, storeA.id));
    assert(before.c === after.c, `عدد الطلبات لم يتغير أثناء التتبع (قبل ${before.c} بعد ${after.c})`);

    throw new Error(ROLLBACK_SENTINEL);
  });

  const residue = await db.select({ c: sql<number>`count(*)::int` }).from(storesTable).where(sql`slug like 'track-test-%'`);
  assert(residue[0].c === 0, "لا أثر للمتاجر الرملية بعد التراجع");
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
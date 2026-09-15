import { and, db, deliveryCommuneSettingsTable, deliveryZonesTable, eq, landingPagesTable, ordersTable, storesTable } from "@workspace/db";
import { findWilayaByCode } from "../lib/algeria-locations.js";
import { ReadinessDb, productPubliclyLive, productReadinessReason, storeDeliveryReady, storeHasUsableDeliveryZone, usableDeliveryZonesForStore } from "../lib/readiness.js";

const ROLLBACK_SENTINEL = "__READINESS_TEST_ROLLBACK__";

let passed = 0;

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${label}`);
  }
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function run() {
  const slug = `readiness-test-${Date.now()}`;

  await db.transaction(async (tx) => {
    const client = tx as unknown as ReadinessDb;

    async function currentPage(pageId: number) {
      const [row] = await client.select().from(landingPagesTable).where(eq(landingPagesTable.id, pageId));
      return row!;
    }

    const [storeA] = await tx.insert(storesTable).values({
      name: "Readiness Test A",
      slug,
      ownerName: "Test Owner",
      phone: "0000000000",
      city: "Algiers",
      isActive: true,
    }).returning();

    const [pageA] = await tx.insert(landingPagesTable).values({
      storeId: storeA.id,
      productName: "Test Product",
      price: "1200",
      description: "وصف منتج للاختبار",
      slug: "test-product",
      template: "classic",
      isActive: true,
    }).returning();

    const storeId = storeA.id;

    console.log("سيناريو 1: متجر بدون أي ولاية توصيل");
    assert((await usableDeliveryZonesForStore(storeId, client)).length === 0, "لا ولايات -> usable = []");
    assert(!(await storeHasUsableDeliveryZone(storeId, client)), "لا ولايات -> storeHasUsableDeliveryZone = false");
    assert(!(await storeDeliveryReady(storeId, client)), "لا ولايات -> deliveryReady = false");
    assert((await productPubliclyLive(storeId, pageA, client)) === false, "لا ولايات -> public ليس مباشر");
    assert((await productReadinessReason(storeId, pageA, client)) === "no_usable_delivery_zone", "سبب = no_usable_delivery_zone");

    console.log("سيناريو 2: ولاية غير مفعّلة");
    const [zone] = await tx.insert(deliveryZonesTable).values({
      storeId,
      wilayaCode: "01",
      wilayaName: "أدرار",
      isActive: false,
      officeFee: "500",
    }).returning();
    assert((await usableDeliveryZonesForStore(storeId, client)).length === 0, "ولاية غير فعّالة -> غير قابلة للاستخدام");
    assert((await productReadinessReason(storeId, pageA, client)) === "no_usable_delivery_zone", "سبب ما زال no_usable_delivery_zone");

    console.log("سيناريو 3: ولاية فعّالة بدون رسوم مكتب");
    await tx.update(deliveryZonesTable).set({ isActive: true, officeFee: null }).where(eq(deliveryZonesTable.id, zone.id));
    assert((await usableDeliveryZonesForStore(storeId, client)).length === 0, "بدون office_fee -> غير قابلة للاستخدام");
    assert((await productReadinessReason(storeId, pageA, client)) === "no_usable_delivery_zone", "سبب ما زال no_usable_delivery_zone");

    console.log("سيناريو 4: كل بلديات الولاية معطّلة");
    const sourceWilaya = findWilayaByCode("01")!;
    await tx.update(deliveryZonesTable).set({ officeFee: "500" }).where(eq(deliveryZonesTable.id, zone.id));
    const communeSettingsRows = sourceWilaya.communes.map((commune) => ({
      storeId,
      wilayaCode: "01",
      communeName: commune.name,
      dairaName: commune.dairaName,
      isActive: false,
    }));
    await tx.insert(deliveryCommuneSettingsTable).values(communeSettingsRows);
    assert((await usableDeliveryZonesForStore(storeId, client)).length === 0, "كل البلديات معطّلة -> غير قابلة للاستخدام");
    assert((await productReadinessReason(storeId, pageA, client)) === "no_usable_delivery_zone", "سبب ما زال no_usable_delivery_zone");

    console.log("سيناريو 5: ولاية واحدة صالحة");
    await tx.update(deliveryCommuneSettingsTable)
      .set({ isActive: true })
      .where(and(eq(deliveryCommuneSettingsTable.storeId, storeId), eq(deliveryCommuneSettingsTable.wilayaCode, "01")));
    assert((await usableDeliveryZonesForStore(storeId, client)).length === 1, "بلدية واحدة مفعّلة -> usable = 1");
    assert((await storeDeliveryReady(storeId, client)) === true, "deliveryReady = true");
    assert((await productReadinessReason(storeId, pageA, client)) === null, "المنتج جاهز -> بدون سبب");
    assert((await productPubliclyLive(storeId, pageA, client)) === true, "publiclyLive = true");

    console.log("سيناريو 6: المنتج مخفي يدوياً");
    await tx.update(landingPagesTable).set({ isActive: false }).where(eq(landingPagesTable.id, pageA.id));
    const hiddenPage = await currentPage(pageA.id);
    assert((await productReadinessReason(storeId, hiddenPage, client)) === "product_unpublished", "مخفي -> product_unpublished");
    assert((await productPubliclyLive(storeId, hiddenPage, client)) === false, "publiclyLive = false");

    console.log("سيناريو 6b: بيانات المنتج غير مكتملة");
    await tx.update(landingPagesTable).set({ price: "0", isActive: true }).where(eq(landingPagesTable.id, pageA.id));
    const zeroPricePage = await currentPage(pageA.id);
    assert((await productReadinessReason(storeId, zeroPricePage, client)) === "product_incomplete", "سعر صفر -> product_incomplete");
    await tx.update(landingPagesTable).set({ price: "1200" }).where(eq(landingPagesTable.id, pageA.id));

    console.log("سيناريو 7: متجر مفعّل ومنتج مكتمل");
    const restoredPage = await currentPage(pageA.id);
    assert((await productReadinessReason(storeId, restoredPage, client)) === null, "جاهز -> بدون سبب");
    assert((await productPubliclyLive(storeId, restoredPage, client)) === true, "publiclyLive = true");

    console.log("سيناريو 8: اشتراك المتجر منتهي");
    await tx.update(storesTable)
      .set({ subscriptionExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
      .where(eq(storesTable.id, storeId));
    assert((await productReadinessReason(storeId, pageA, client)) === "subscription_expired", "اشتراك منتهي -> subscription_expired");
    assert((await productPubliclyLive(storeId, pageA, client)) === false, "publiclyLive = false");
    await tx.update(storesTable).set({ subscriptionExpiresAt: null }).where(eq(storesTable.id, storeId));

    console.log("سيناريو 9: متجر غير مفعّل (is_active = false)");
    await tx.update(storesTable).set({ isActive: false }).where(eq(storesTable.id, storeId));
    assert((await productReadinessReason(storeId, pageA, client)) === "store_inactive", "متجر معطّل -> store_inactive");
    await tx.update(storesTable).set({ isActive: true }).where(eq(storesTable.id, storeId));

    console.log("سيناريو 10: عزل عبر المتاجر (multi-tenant isolation)");
    const [storeB] = await tx.insert(storesTable).values({
      name: "Readiness Test B",
      slug: `${slug}-b`,
      ownerName: "Test Owner B",
      phone: "0000000001",
      city: "Oran",
      isActive: true,
    }).returning();
    const [zoneB] = await tx.insert(deliveryZonesTable).values({
      storeId: storeB.id,
      wilayaCode: "31",
      wilayaName: "وهران",
      isActive: true,
      officeFee: "400",
    }).returning();
    void zoneB;
    assert((await storeDeliveryReady(storeB.id, client)) === true, "متجر B جاهز من ولايته");
    assert((await storeDeliveryReady(storeId, client)) === true, "متجر A يبقى جاهزاً من ولايته (لا يتأثر بـ B)");

    console.log("سيناريو 10b: تراجع جاهزية المتجر يُحجب الطلبات بدون إنشاء صفوف");
    await tx.update(deliveryZonesTable).set({ isActive: false }).where(eq(deliveryZonesTable.id, zone.id));
    assert((await storeHasUsableDeliveryZone(storeId, client)) === false, "فقدان آخر ولاية -> الحارس يرفض");
    assert((await storeDeliveryReady(storeB.id, client)) === true, "متجر B لا يتأثر بتراجع A");
    const ordersA = await tx.select().from(ordersTable).where(eq(ordersTable.storeId, storeId));
    assert(ordersA.length === 0, "لا يوجد أي صف طلب للمتجر A قبل أي إنشاء طلب");
    const ordersB = await tx.select().from(ordersTable).where(eq(ordersTable.storeId, storeB.id));
    assert(ordersB.length === 0, "لا يوجد أي صف طلب لمتجر B (لم تُنشأ طلبات)");

    console.log("سيناريو 7b: إعادة الجاهزية بعد عودة الولاية");
    await tx.update(deliveryZonesTable).set({ isActive: true }).where(eq(deliveryZonesTable.id, zone.id));
    assert((await storeHasUsableDeliveryZone(storeId, client)) === true, "عودة الولاية -> جاهز مجدداً");

    throw new Error(ROLLBACK_SENTINEL);
  });

  const [survivor] = await db.select().from(storesTable).where(eq(storesTable.slug, slug));
  assert(!survivor, "لا يظهر أي أثر للمتجر بعد التراجع");
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
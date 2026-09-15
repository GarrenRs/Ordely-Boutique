import { db, eq, ordersTable, storesTable, usersTable, landingPagesTable } from "@workspace/db";
import { UpdateStoreBody, UpdateStoreResponse, ListProviderStoresResponseItem } from "@workspace/api-zod";
import { computeRenewalExpiry, computeStoreLifecycle, DAY_MS, providerSubscriptionStatus, storeAcceptsNewOrders } from "../lib/storeLifecycle.js";
import { isValidTransition } from "../lib/transitions.js";
import { productPubliclyLive, type ReadinessDb } from "../lib/readiness.js";

const ROLLBACK_SENTINEL = "__LIFECYCLE_TEST_ROLLBACK__";

let passed = 0;

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${label}`);
  }
  passed += 1;
  console.log(`  ok  ${label}`);
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * DAY_MS);
}

const baseStore = {
  id: 0,
  name: "Lifecycle Test",
  slug: "lifecycle-test",
  ownerName: "Test Owner",
  phone: "0000000000",
  city: "Algiers",
  logoUrl: null,
  subscriptionPlanDays: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

async function run() {
  console.log("أ: موقوف (SUSPENDED) - لا تسجيل دخول ولا طلبات جديدة");
  const suspended = computeStoreLifecycle({ isActive: false, subscriptionExpiresAt: daysFromNow(30) });
  assert(suspended.status === "SUSPENDED", "is_active=false مع اشتراك ساري -> SUSPENDED");
  assert(suspended.acceptsNewOrders === false, "SUSPENDED لا يقبل طلبات");
  assert(providerSubscriptionStatus(suspended) === "suspended", "provider status = suspended");
  assert(storeAcceptsNewOrders({ isActive: false, subscriptionExpiresAt: null }) === false, "موقوف بلا اشتراك -> لا يقبل");

  console.log("ب: منتهي (EXPIRED) - دخول محدود وطلبات جديدة مرفوضة");
  const expired = computeStoreLifecycle({ isActive: true, subscriptionExpiresAt: daysFromNow(-1) });
  assert(expired.status === "EXPIRED", "انتهاء قبل الآن -> EXPIRED");
  assert(expired.acceptsNewOrders === false, "EXPIRED لا يقبل طلبات جديدة");
  assert(expired.isActive === true, "EXPIRED يحافظ على is_active=true (وضع محدود)");
  assert(providerSubscriptionStatus(expired) === "expired", "provider status = expired");

  console.log("ج: يقترب من الانتهاء (EXPIRING_SOON) - حد 7 أيام");
  assert(computeStoreLifecycle({ isActive: true, subscriptionExpiresAt: daysFromNow(7) }).status === "EXPIRING_SOON", "7 أيام -> EXPIRING_SOON");
  assert(computeStoreLifecycle({ isActive: true, subscriptionExpiresAt: daysFromNow(7) }).acceptsNewOrders === true, "EXPIRING_SOON يقبل طلبات");
  assert(computeStoreLifecycle({ isActive: true, subscriptionExpiresAt: daysFromNow(1) }).status === "EXPIRING_SOON", "يوم واحد -> EXPIRING_SOON");
  assert(computeStoreLifecycle({ isActive: true, subscriptionExpiresAt: daysFromNow(8) }).status === "ACTIVE", "8 أيام -> ACTIVE");

  console.log("د: نشط (ACTIVE) - وصول كامل");
  const active = computeStoreLifecycle({ isActive: true, subscriptionExpiresAt: daysFromNow(30) });
  assert(active.status === "ACTIVE", "30 يوماً -> ACTIVE");
  assert(active.acceptsNewOrders === true, "ACTIVE يقبل طلبات");
  assert(providerSubscriptionStatus(active) === "active", "provider status = active");
  const noExpiry = computeStoreLifecycle({ isActive: true, subscriptionExpiresAt: null });
  assert(noExpiry.status === "ACTIVE" && noExpiry.acceptsNewOrders === true, "بدون تاريخ انتهاء -> ACTIVE ويقبل");
  assert(providerSubscriptionStatus(noExpiry) === "noSubscription", "provider status = noSubscription");

  console.log("هـ: قاعدة القرار D-06 لتجديد الاشتراك");
  const activeStore = { isActive: true, subscriptionExpiresAt: daysFromNow(5) };
  assert(computeStoreLifecycle(activeStore).status === "EXPIRING_SOON", "5 أيام -> EXPIRING_SOON قبل التجديد");
  const renewedExpiring = computeRenewalExpiry(activeStore, 30);
  const diffExpiring = Math.round((renewedExpiring.getTime() - new Date(activeStore.subscriptionExpiresAt).getTime()) / DAY_MS);
  assert(diffExpiring === 30, `5 أيام متبقية + 30 -> +30 من موعد الانتهاء الحالي (كانت ${diffExpiring})`);
  assert(computeStoreLifecycle({ isActive: true, subscriptionExpiresAt: renewedExpiring }).status === "ACTIVE", "بعد التجديد من EXPIRING_SOON -> ACTIVE");

  const active2 = { isActive: true, subscriptionExpiresAt: daysFromNow(2) };
  const renewed2 = computeRenewalExpiry(active2, 30);
  const diff2 = Math.round((renewed2.getTime() - new Date(active2.subscriptionExpiresAt).getTime()) / DAY_MS);
  assert(diff2 === 30, `يومان متبقيان + 30 -> +30 من موعد الانتهاء الحالي (كانت ${diff2})`);

  const expiredStore = { isActive: true, subscriptionExpiresAt: daysFromNow(-1) };
  const renewedFromExpired = computeRenewalExpiry(expiredStore, 30);
  const diffExpired = Math.round((renewedFromExpired.getTime() - Date.now()) / DAY_MS);
  assert(diffExpired >= 29 && diffExpired <= 31, `منتهي + 30 -> تقريباً الآن+30 (كانت ${diffExpired})`);
  assert(computeStoreLifecycle({ isActive: true, subscriptionExpiresAt: renewedFromExpired }).status === "ACTIVE", "بعد التجديد من EXPIRED -> ACTIVE");

  const suspendedStore = { isActive: false, subscriptionExpiresAt: daysFromNow(-3) };
  const renewedFromSuspended = computeRenewalExpiry(suspendedStore, 30);
  const diffSuspended = Math.round((renewedFromSuspended.getTime() - Date.now()) / DAY_MS);
  assert(diffSuspended >= 29 && diffSuspended <= 31, `موقوف + 30 -> الآن+30 (كانت ${diffSuspended})`);
  assert(renewedFromSuspended.getTime() > Date.now(), "موقوف -> تاريخ انتهاء جديد في المستقبل");
  assert(computeStoreLifecycle({ isActive: true, subscriptionExpiresAt: renewedFromSuspended }).status === "ACTIVE", "بعد إعادة التفعيل بالتجديد -> ACTIVE (is_active أصبح true)");

  const noExpiryRenew = computeRenewalExpiry({ isActive: true, subscriptionExpiresAt: null }, 30);
  const diffNoExpiry = Math.round((noExpiryRenew.getTime() - Date.now()) / DAY_MS);
  assert(diffNoExpiry >= 29 && diffNoExpiry <= 31, `بدون اشتراك + 30 -> الآن+30 (كانت ${diffNoExpiry})`);

  const slug = `lifecycle-test-${Date.now()}`;

  await db.transaction(async (tx) => {
    console.log("و: عزل المتاجر (multi-tenant isolation)");
    const [storeA] = await tx.insert(storesTable).values({
      name: "Lifecycle Test A",
      slug,
      ownerName: "Owner A",
      phone: "0000000000",
      city: "Algiers",
      isActive: true,
      subscriptionPlanDays: 30,
      subscriptionExpiresAt: new Date(Date.now() - DAY_MS),
    }).returning();
    const [storeB] = await tx.insert(storesTable).values({
      name: "Lifecycle Test B",
      slug: `${slug}-b`,
      ownerName: "Owner B",
      phone: "0000000001",
      city: "Oran",
      isActive: true,
      subscriptionPlanDays: 365,
      subscriptionExpiresAt: new Date(Date.now() + 200 * DAY_MS),
    }).returning();

    assert(computeStoreLifecycle(storeA).status === "EXPIRED", "متجر A منتهي");
    assert(computeStoreLifecycle(storeA).acceptsNewOrders === false, "متجر A يرفض الطلبات");
    assert(computeStoreLifecycle(storeB).status === "ACTIVE", "متجر B نشط");
    assert(computeStoreLifecycle(storeB).acceptsNewOrders === true, "متجر B يقبل الطلبات وهكذا لا يتأثر بـ A");
    assert(storeAcceptsNewOrders(storeA) === false, "الحارس المشترك يرفض A");
    assert(storeAcceptsNewOrders(storeB) === true, "الحارس المشترك يقبل B");

    console.log("ز: تحويلات الطلبات تبقى ممكنة رغم الانتهاء (وضع محدود)");
    assert(isValidTransition("NEW", "PENDING_CONFIRMATION") === true, "NEW -> PENDING_CONFIRMATION مقبول");
    assert(isValidTransition("PENDING_CONFIRMATION", "CONFIRMED") === true, "PENDING_CONFIRMATION -> CONFIRMED مقبول");
    assert(isValidTransition("CONFIRMED", "SHIPPED") === true, "CONFIRMED -> SHIPPED مقبول");
    assert(isValidTransition("SHIPPED", "DELIVERED") === true, "SHIPPED -> DELIVERED مقبول");
    assert(isValidTransition("NEW", "SHIPPED") === false, "NEW -> SHIPPED غير مسموح (لا تأثير للحالة)");

    console.log("ح: التاجر لا يستطيع تعديل is_active عبر عقد التحديث");
    const parsedMerchantBody = UpdateStoreBody.parse({ name: "متجر محدّث", ownerName: "مالك", isActive: false });
    assert("isActive" in parsedMerchantBody === false, "UpdateStoreBody يتجاهل isActive من الطرف التاجر");
    const [newStoreB] = await tx.insert(storesTable).values({
      name: "Lifecycle Test B2",
      slug: `${slug}-b2`,
      ownerName: "Owner B2",
      phone: "0000000002",
      city: "Setif",
      isActive: true,
      subscriptionPlanDays: 30,
      subscriptionExpiresAt: new Date(Date.now() + 30 * DAY_MS),
    }).returning();
    const [merchantUser] = await tx.insert(usersTable).values({
      storeId: newStoreB.id,
      email: `merchant-${slug}@test.local`,
      passwordHash: "x",
    }).returning();
    void merchantUser;
    await tx.update(storesTable)
      .set({ name: "متجر B2 محدّث" })
      .where(eq(storesTable.id, newStoreB.id));
    const [afterMerchantUpdate] = await tx.select().from(storesTable).where(eq(storesTable.id, newStoreB.id));
    assert(afterMerchantUpdate.isActive === true, "تحديث التاجر (بدون is_active) لا يغيّر حالة التفعيل");

    console.log("ط: المزوّد يستطيع إعادة التفعيل والتجديد بقاعدة D-06");
    await tx.update(storesTable).set({ isActive: false }).where(eq(storesTable.id, newStoreB.id));
    const [suspendedB] = await tx.select().from(storesTable).where(eq(storesTable.id, newStoreB.id));
    assert(computeStoreLifecycle(suspendedB).status === "SUSPENDED", "B2 موقوف بعد إيقاف المزوّد");
    const renewalTarget = computeRenewalExpiry(suspendedB, 30);
    await tx.update(storesTable)
      .set({ isActive: true, subscriptionPlanDays: 30, subscriptionExpiresAt: renewalTarget })
      .where(eq(storesTable.id, newStoreB.id));
    const [renewedB] = await tx.select().from(storesTable).where(eq(storesTable.id, newStoreB.id));
    assert(renewedB.isActive === true, "بعد تجديد المزوّد -> is_active=true");
    assert(computeStoreLifecycle(renewedB).status === "ACTIVE", "بعد تجديد المزوّد من موقوف -> ACTIVE");
    const orderB2 = await tx.select().from(ordersTable).where(eq(ordersTable.storeId, newStoreB.id));
    assert(orderB2.length === 0, "لا صفوف طلبات وهمية أثناء اختبارات الحارس/التجديد");

    console.log("ي: قوالب العقود المحدّثة تحمل الحالة المستمدّة");
    const providerItem = ListProviderStoresResponseItem.safeParse({
      id: storeA.id,
      name: storeA.name,
      slug: storeA.slug,
      ownerName: storeA.ownerName,
      phone: storeA.phone,
      city: storeA.city,
      isActive: storeA.isActive,
      subscriptionPlanDays: storeA.subscriptionPlanDays,
      subscriptionExpiresAt: new Date(storeA.subscriptionExpiresAt as Date).toISOString(),
      subscriptionStatus: "expired",
      ordersCount: 0,
      createdAt: new Date(storeA.createdAt).toISOString(),
    });
    assert(providerItem.success === true, "ListProviderStoresResponseItem يقبل subscriptionStatus");
    const merchantStore = UpdateStoreResponse.safeParse({
      id: storeB.id,
      name: storeB.name,
      slug: storeB.slug,
      ownerName: storeB.ownerName,
      phone: storeB.phone,
      city: storeB.city,
      logoUrl: storeB.logoUrl,
      isActive: storeB.isActive,
      deliveryReady: true,
      storeStatus: "ACTIVE",
      daysLeft: 200,
      createdAt: new Date(storeB.createdAt).toISOString(),
    });
    assert(merchantStore.success === true, "UpdateStoreResponse يقبل storeStatus و daysLeft");

    console.log("ك: توقف الواجهة العامة عند الانتهاء (لا تغيير في بوابة P1-02)");
    const [pageA] = await tx.insert(landingPagesTable).values({
      storeId: storeA.id,
      productName: "منتج اختبار",
      price: "100",
      description: "وصف منتج للاختبار",
      slug: "product",
      template: "classic",
      isActive: true,
    }).returning();
    assert((await productPubliclyLive(storeA.id, pageA, tx as unknown as ReadinessDb)) === false, "منتج متجر EXPIRED ليس مباشراً للعموم");

    throw new Error(ROLLBACK_SENTINEL);
  });

  const survivors = await db.select().from(storesTable).where(eq(storesTable.slug, slug));
  assert(survivors.length === 0, "لا يظهر أي أثر للمتاجر الرملية بعد التراجع");
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
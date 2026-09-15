import { and, db, deliveryCommuneSettingsTable, deliveryZonesTable, eq, landingPagesTable, sql, storesTable } from "@workspace/db";
import { findWilayaByCode } from "./algeria-locations.js";
import { computeStoreLifecycle } from "./storeLifecycle.js";

export type ReadinessReason =
  | "store_inactive"
  | "subscription_expired"
  | "no_usable_delivery_zone"
  | "product_incomplete"
  | "product_unpublished";

type StoreRow = typeof storesTable.$inferSelect;
type LandingPageRow = typeof landingPagesTable.$inferSelect;

export type ReadinessDb = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export const effectiveActiveStoreSql = sql`${storesTable.isActive} = true and (${storesTable.subscriptionExpiresAt} is null or ${storesTable.subscriptionExpiresAt} > now())`;

export function productDataComplete(page: LandingPageRow): boolean {
  return (
    Boolean(typeof page.productName === "string" && page.productName.trim().length > 0) &&
    Number(page.price) > 0 &&
    Boolean(typeof page.description === "string" && page.description.trim().length > 0) &&
    Boolean(typeof page.slug === "string" && page.slug.trim().length > 0)
  );
}

export function storeReason(store: StoreRow): ReadinessReason | null {
  const lifecycle = computeStoreLifecycle(store);
  if (lifecycle.status === "SUSPENDED") return "store_inactive";
  if (lifecycle.status === "EXPIRED") return "subscription_expired";
  return null;
}

export async function usableDeliveryZonesForStore(storeId: number, client: ReadinessDb = db) {
  const [zones, communeSettings] = await Promise.all([
    client
      .select()
      .from(deliveryZonesTable)
      .where(and(eq(deliveryZonesTable.storeId, storeId), eq(deliveryZonesTable.isActive, true)))
      .orderBy(deliveryZonesTable.wilayaCode),
    client
      .select()
      .from(deliveryCommuneSettingsTable)
      .where(eq(deliveryCommuneSettingsTable.storeId, storeId)),
  ]);

  const disabledCommuneNames = new Set(
    communeSettings
      .filter((setting) => !setting.isActive)
      .map((setting) => `${setting.wilayaCode}:${setting.communeName}`),
  );

  return zones
    .filter((zone) => zone.officeFee !== null)
    .filter((zone) => {
      const sourceWilaya = findWilayaByCode(zone.wilayaCode);
      if (!sourceWilaya) return false;
      return sourceWilaya.communes.some(
        (commune) => !disabledCommuneNames.has(`${zone.wilayaCode}:${commune.name}`),
      );
    });
}

export async function storeHasUsableDeliveryZone(storeId: number, client: ReadinessDb = db): Promise<boolean> {
  const zones = await usableDeliveryZonesForStore(storeId, client);
  return zones.length > 0;
}

export async function storeDeliveryReady(storeId: number, client: ReadinessDb = db): Promise<boolean> {
  return storeHasUsableDeliveryZone(storeId, client);
}

export async function productReadinessReasonWithContext(
  store: StoreRow,
  usableZoneCount: number,
  page: LandingPageRow,
): Promise<ReadinessReason | null> {
  const reason = storeReason(store);
  if (reason) return reason;
  if (usableZoneCount === 0) return "no_usable_delivery_zone";
  if (!productDataComplete(page)) return "product_incomplete";
  if (!page.isActive) return "product_unpublished";
  return null;
}

export async function productReadinessReason(
  storeId: number,
  page: LandingPageRow,
  client: ReadinessDb = db,
): Promise<ReadinessReason | null> {
  const [store] = await client.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) return "store_inactive";
  const zones = await usableDeliveryZonesForStore(storeId, client);
  return productReadinessReasonWithContext(store, zones.length, page);
}

export async function productPubliclyLive(
  storeId: number,
  page: LandingPageRow,
  client: ReadinessDb = db,
): Promise<boolean> {
  return (await productReadinessReason(storeId, page, client)) === null;
}
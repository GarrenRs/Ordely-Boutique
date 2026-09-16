import { and, db, eq, landingPagesTable, storesTable } from "@workspace/db";
import { CreateManualOrderParams, ManualOrderBody } from "@workspace/api-zod";
import { computeStoreLifecycle } from "./storeLifecycle.js";
import { createOrderCore } from "./order-creation.js";
import { firstProductImage, formatOrder } from "./order-format.js";
import type { ReadinessDb } from "./readiness.js";

export const MANUAL_ORDER_AUDIT_NOTE = "طلب يدوي عبر التاجر";

export type ManualOrderOutcome =
  | { status: 201; body: Record<string, unknown> }
  | { status: 400 | 404 | 422; body: { error: string; details?: unknown } };

export async function executeManualOrder(
  storeId: number,
  rawBody: unknown,
  client: ReadinessDb = db,
): Promise<ManualOrderOutcome> {
  const params = CreateManualOrderParams.safeParse({ storeId });
  if (!params.success) {
    return { status: 400, body: { error: "بيانات غير صحيحة" } };
  }
  const body = ManualOrderBody.safeParse(rawBody);
  if (!body.success) {
    return { status: 400, body: { error: "بيانات غير صحيحة", details: body.error.issues } };
  }

  const [store] = await client.select().from(storesTable).where(eq(storesTable.id, params.data.storeId));
  if (!store) {
    return { status: 404, body: { error: "Store not found" } };
  }
  const lifecycle = computeStoreLifecycle(store);
  if (lifecycle.status === "EXPIRED") {
    return { status: 422, body: { error: "اشتراك المتجر منتهي" } };
  }
  if (lifecycle.status === "SUSPENDED") {
    return { status: 422, body: { error: "المتجر موقوف حالياً ولا يقبل طلبات جديدة" } };
  }

  const [page] = await client
    .select()
    .from(landingPagesTable)
    .where(and(
      eq(landingPagesTable.id, body.data.landingPageId),
      eq(landingPagesTable.storeId, params.data.storeId),
    ));
  if (!page) {
    return { status: 404, body: { error: "المنتج غير موجود" } };
  }

  const result = await createOrderCore(page, body.data, {
    requireAddressForHome: true,
    auditNote: MANUAL_ORDER_AUDIT_NOTE,
  }, client);
  if (!result.ok) {
    return { status: result.status as 400 | 404 | 422, body: result.body };
  }

  return {
    status: 201,
    body: formatOrder(
      result.order as unknown as Record<string, unknown>,
      page.productName,
      firstProductImage(page),
      page.transportMode ?? "DELIVERY_COMPANY",
    ) as unknown as Record<string, unknown>,
  };
}
import { and, customersTable, db, deliveryCommuneSettingsTable, deliveryZonesTable, eq, landingPagesTable, ordersTable } from "@workspace/db";
import { findCommuneInWilaya, findWilayaByCode } from "./algeria-locations.js";
import { logAudit } from "./audit.js";
import { storeHasUsableDeliveryZone, type ReadinessDb } from "./readiness.js";
import { asStringArray, firstProductImage, validateVariantSelection } from "./order-format.js";

type LandingPageRow = typeof landingPagesTable.$inferSelect;

export interface OrderCreationInput {
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  deliveryZoneId: number;
  deliveryCommuneName: string;
  deliveryMethod: "HOME" | "OFFICE";
  selectedSize?: string | null;
  selectedColor?: string | null;
  quantity: number;
  notes?: string | null;
}

export interface OrderCreationOptions {
  requireAddressForHome: boolean;
  auditNote: string;
}

export type OrderCreationResult =
  | {
      ok: true;
      order: typeof ordersTable.$inferSelect;
      deliveryFee: number;
      returnFee: number;
      unitPrice: number;
      payableTotal: number;
      customerId: number | null;
    }
  | { ok: false; status: number; body: { error: string; details?: unknown } };

export async function createOrderCore(
  page: LandingPageRow,
  input: OrderCreationInput,
  options: OrderCreationOptions,
  client: ReadinessDb = db,
): Promise<OrderCreationResult> {
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return { ok: false, status: 422, body: { error: "الكمية يجب أن تكون بين 1 و 10" } };
  }

  if (!(await storeHasUsableDeliveryZone(page.storeId, client))) {
    return { ok: false, status: 422, body: { error: "الولاية غير متاحة للتوصيل حاليا" } };
  }

  const transportMode = page.transportMode ?? "DELIVERY_COMPANY";
  const effectiveDeliveryMethod = transportMode === "SHED_MED" ? "OFFICE" : input.deliveryMethod;

  if (options.requireAddressForHome && effectiveDeliveryMethod === "HOME" && !(input.customerAddress?.trim())) {
    return { ok: false, status: 422, body: { error: "العنوان مطلوب عند التوصيل إلى المنزل" } };
  }

  const sizeError = validateVariantSelection(asStringArray(page.availableSizes), input.selectedSize, "selectedSize");
  const colorError = validateVariantSelection(asStringArray(page.availableColors), input.selectedColor, "selectedColor");
  const variantError = sizeError ?? colorError;
  if (variantError) {
    return { ok: false, status: 422, body: { error: variantError } };
  }

  const [deliveryZone] = await client
    .select()
    .from(deliveryZonesTable)
    .where(and(
      eq(deliveryZonesTable.id, input.deliveryZoneId),
      eq(deliveryZonesTable.storeId, page.storeId),
      eq(deliveryZonesTable.isActive, true),
    ));

  if (!deliveryZone) {
    return { ok: false, status: 422, body: { error: "الولاية غير متاحة للتوصيل حاليا" } };
  }

  if (deliveryZone.officeFee === null || (effectiveDeliveryMethod === "HOME" && deliveryZone.homeFee === null)) {
    return { ok: false, status: 422, body: { error: "طريقة التوصيل غير متاحة لهذه الولاية" } };
  }

  const sourceWilaya = findWilayaByCode(deliveryZone.wilayaCode);
  const commune = findCommuneInWilaya(deliveryZone.wilayaCode, input.deliveryCommuneName);
  if (!sourceWilaya || !commune) {
    return { ok: false, status: 422, body: { error: "البلدية لا تتبع الولاية المختارة" } };
  }

  const [communeSetting] = await client
    .select()
    .from(deliveryCommuneSettingsTable)
    .where(and(
      eq(deliveryCommuneSettingsTable.storeId, page.storeId),
      eq(deliveryCommuneSettingsTable.wilayaCode, deliveryZone.wilayaCode),
      eq(deliveryCommuneSettingsTable.communeName, commune.name),
    ));
  if (communeSetting && !communeSetting.isActive) {
    return { ok: false, status: 422, body: { error: "البلدية غير متاحة للتوصيل حاليا" } };
  }

  const unitPrice = Number(page.price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return { ok: false, status: 422, body: { error: "المنتج غير صالح للإضافة" } };
  }
  const productTotal = unitPrice * quantity;
  const baseDeliveryFee = Number(deliveryZone.officeFee);
  const deliveryFee = effectiveDeliveryMethod === "HOME"
    ? baseDeliveryFee + Number(deliveryZone.homeFee)
    : baseDeliveryFee;
  const returnFee = Number(deliveryZone.returnFee);
  const productImageUrl = firstProductImage(page);
  const customerCity = sourceWilaya.name;

  let customerId: number | null = null;
  const [existing] = await client
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.storeId, page.storeId), eq(customersTable.phone, input.customerPhone)));

  if (existing) {
    customerId = existing.id;
    await client.update(customersTable)
      .set({ name: input.customerName, city: customerCity })
      .where(and(eq(customersTable.id, existing.id), eq(customersTable.storeId, page.storeId)));
  } else {
    const [newCustomer] = await client.insert(customersTable).values({
      storeId: page.storeId,
      name: input.customerName,
      phone: input.customerPhone,
      city: customerCity,
    }).returning();
    customerId = newCustomer.id;
  }

  const [order] = await client.insert(ordersTable).values({
    storeId: page.storeId,
    landingPageId: page.id,
    productImageUrl,
    customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerCity,
    customerAddress: input.customerAddress ?? null,
    deliveryZoneId: deliveryZone.id,
    deliveryWilayaCode: deliveryZone.wilayaCode,
    deliveryWilayaName: sourceWilaya.name,
    deliveryCommuneName: commune.name,
    deliveryDairaName: commune.dairaName,
    deliveryMethod: effectiveDeliveryMethod,
    deliveryFee: String(deliveryFee),
    returnFee: String(returnFee),
    selectedSize: input.selectedSize,
    selectedColor: input.selectedColor,
    quantity,
    unitPrice: String(unitPrice),
    totalPrice: String(productTotal),
    notes: input.notes ?? null,
    status: "NEW",
  }).returning();

  await logAudit({
    storeId: page.storeId,
    orderId: order.id,
    action: "ORDER_CREATED",
    toStatus: "NEW",
    note: options.auditNote,
  }, client);

  return {
    ok: true,
    order,
    deliveryFee,
    returnFee,
    unitPrice,
    payableTotal: productTotal + deliveryFee,
    customerId,
  };
}
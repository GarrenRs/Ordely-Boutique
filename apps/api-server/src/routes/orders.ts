import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { and, auditLogsTable, customersTable, db, deliveryZonesTable, eq, landingPagesTable, ne, ordersTable, sql, storesTable } from "@workspace/db";
import {
  ListOrdersParams,
  CreateOrderParams,
  CreateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  UpdateOrderBody,
  GetOrdersSummaryParams,
} from "@workspace/api-zod";
import { isValidTransition } from "../lib/transitions.js";
import { logAudit } from "../lib/audit.js";
import { computeStoreLifecycle } from "../lib/storeLifecycle.js";

export const ordersRouter = Router({ mergeParams: true });

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function firstProductImage(page: { productImages?: unknown; imageUrl?: string | null } | null | undefined): string | null {
  if (!page) return null;
  return asStringArray(page.productImages)[0] ?? page.imageUrl ?? null;
}

function formatOrder(
  o: Record<string, unknown>,
  landingPageName?: string | null,
  landingPageImage?: string | null,
  transportMode?: string | null,
) {
  return {
    ...o,
    unitPrice: Number(o.unitPrice),
    totalPrice: Number(o.totalPrice),
    customerAddress: o.customerAddress ?? null,
    deliveryZoneId: o.deliveryZoneId ?? null,
    deliveryWilayaCode: o.deliveryWilayaCode ?? null,
    deliveryWilayaName: o.deliveryWilayaName ?? null,
    deliveryCommuneName: o.deliveryCommuneName ?? null,
    deliveryDairaName: o.deliveryDairaName ?? null,
    deliveryMethod: o.deliveryMethod ?? null,
    transportMode: transportMode ?? "DELIVERY_COMPANY",
    deliveryFee: Number(o.deliveryFee ?? 0),
    returnFee: Number(o.returnFee ?? 0),
    payableTotal: Number(o.totalPrice ?? 0) + Number(o.deliveryFee ?? 0),
    selectedSize: o.selectedSize ?? null,
    selectedColor: o.selectedColor ?? null,
    customerId: o.customerId ?? null,
    notes: o.notes ?? null,
    confirmedAt: o.confirmedAt ?? null,
    shippedAt: o.shippedAt ?? null,
    deliveredAt: o.deliveredAt ?? null,
    returnedAt: o.returnedAt ?? null,
    returnReason: o.returnReason ?? null,
    landingPageName: landingPageName ?? null,
    productImageUrl: o.productImageUrl ?? landingPageImage ?? null,
  };
}

function validateVariantSelection(
  options: string[],
  selected: string | null | undefined,
  label: string,
): string | null {
  if (!options.length) return null;
  if (!selected) return `${label} is required for this product`;
  if (!options.includes(selected)) return `${label} is not available for this product`;
  return null;
}

ordersRouter.get("/summary", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = GetOrdersSummaryParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
  });
  if (!params.success) { res.status(400).json({ error: "Invalid storeId" }); return; }

  const rows = await db
    .select({
      status: ordersTable.status,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`sum(total_price)::float`,
      deliveryRevenue: sql<number>`coalesce(sum(delivery_fee)::float, 0)`,
      returnLoss: sql<number>`coalesce(sum(return_fee)::float, 0)`,
    })
    .from(ordersTable)
    .where(eq(ordersTable.storeId, params.data.storeId))
    .groupBy(ordersTable.status);

  const summary = { total: 0, new: 0, pendingConfirmation: 0, confirmed: 0, shipped: 0, delivered: 0, returned: 0, cancelled: 0, rejected: 0, totalRevenue: 0, deliveryRevenue: 0, returnLoss: 0, netRevenue: 0 };
  for (const row of rows) {
    summary.total += row.count;
    if (row.status === "NEW") summary.new = row.count;
    if (row.status === "PENDING_CONFIRMATION") summary.pendingConfirmation = row.count;
    if (row.status === "CONFIRMED") summary.confirmed = row.count;
    if (row.status === "SHIPPED") summary.shipped = row.count;
    if (row.status === "DELIVERED") {
      summary.delivered = row.count;
      summary.totalRevenue += Number(row.revenue) || 0;
      summary.deliveryRevenue += Number(row.deliveryRevenue) || 0;
    }
    if (row.status === "RETURNED") {
      summary.returned = row.count;
      summary.returnLoss += Number(row.returnLoss) || 0;
    }
    if (row.status === "CANCELLED") summary.cancelled = row.count;
    if (row.status === "REJECTED") summary.rejected = row.count;
  }
  summary.netRevenue = summary.totalRevenue + summary.deliveryRevenue - summary.returnLoss;
  res.json(summary);
});

ordersRouter.get("/", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = ListOrdersParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
  });
  if (!params.success) { res.status(400).json({ error: "Invalid storeId" }); return; }

  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const orders = await db
    .select({
      order: ordersTable,
      landingPageName: landingPagesTable.productName,
      landingPageImageUrl: landingPagesTable.imageUrl,
      landingPageProductImages: landingPagesTable.productImages,
      transportMode: landingPagesTable.transportMode,
    })
    .from(ordersTable)
    .leftJoin(landingPagesTable, eq(ordersTable.landingPageId, landingPagesTable.id))
    .where(eq(ordersTable.storeId, params.data.storeId))
    .orderBy(sql`${ordersTable.createdAt} DESC`);

  let filtered = orders;
  if (status && ["NEW","PENDING_CONFIRMATION","CONFIRMED","SHIPPED","DELIVERED","RETURNED","CANCELLED","REJECTED"].includes(status)) {
    filtered = filtered.filter(r => r.order.status === status);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(r =>
      r.order.customerName.toLowerCase().includes(q) ||
      r.order.customerPhone.toLowerCase().includes(q)
    );
  }

  res.json({
    orders: filtered.map(r => formatOrder(
      r.order as unknown as Record<string, unknown>,
      r.landingPageName,
      firstProductImage({ imageUrl: r.landingPageImageUrl, productImages: r.landingPageProductImages }),
      r.transportMode,
    )),
    total: filtered.length,
    page: 1,
    limit: filtered.length,
  });
});

ordersRouter.post("/", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = CreateOrderParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
  });
  const body = CreateOrderBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, params.data.storeId));
  const lifecycle = store ? computeStoreLifecycle(store) : null;
  if (lifecycle && lifecycle.status === "EXPIRED") {
    res.status(422).json({ error: "اشتراك المتجر منتهي" });
    return;
  }
  if (lifecycle && lifecycle.status === "SUSPENDED") {
    res.status(422).json({ error: "المتجر موقوف حالياً ولا يقبل طلبات جديدة" });
    return;
  }

  const [page] = await db
    .select()
    .from(landingPagesTable)
    .where(and(eq(landingPagesTable.id, body.data.landingPageId), eq(landingPagesTable.storeId, params.data.storeId)));
  if (!page) { res.status(404).json({ error: "Landing page not found" }); return; }

  const sizeError = validateVariantSelection(asStringArray(page.availableSizes), body.data.selectedSize, "selectedSize");
  const colorError = validateVariantSelection(asStringArray(page.availableColors), body.data.selectedColor, "selectedColor");
  if (sizeError || colorError) {
    res.status(422).json({ error: sizeError ?? colorError });
    return;
  }

  const unitPrice = Number(page.price);
  const totalPrice = unitPrice * (body.data.quantity ?? 1);
  const productImageUrl = firstProductImage(page);
  const requestedDelivery = body.data as typeof body.data & {
    deliveryZoneId?: number;
    deliveryMethod?: "HOME" | "OFFICE";
  };
  const effectiveDeliveryMethod = page.transportMode === "SHED_MED" ? "OFFICE" : requestedDelivery.deliveryMethod;
  let deliverySnapshot = {
    deliveryZoneId: null as number | null,
    deliveryWilayaCode: null as string | null,
    deliveryWilayaName: null as string | null,
    deliveryMethod: null as "HOME" | "OFFICE" | null,
    deliveryFee: 0,
    returnFee: 0,
  };

  if (requestedDelivery.deliveryZoneId && effectiveDeliveryMethod) {
    const [deliveryZone] = await db
      .select()
      .from(deliveryZonesTable)
      .where(and(
        eq(deliveryZonesTable.id, requestedDelivery.deliveryZoneId),
        eq(deliveryZonesTable.storeId, params.data.storeId),
        eq(deliveryZonesTable.isActive, true),
      ));

    if (!deliveryZone) {
      res.status(422).json({ error: "Delivery zone is not available" });
      return;
    }

    if (deliveryZone.officeFee === null || (effectiveDeliveryMethod === "HOME" && deliveryZone.homeFee === null)) {
      res.status(422).json({ error: "Delivery method is not available for this zone" });
      return;
    }

    const baseDeliveryFee = Number(deliveryZone.officeFee);
    const deliveryFee = effectiveDeliveryMethod === "HOME"
      ? baseDeliveryFee + Number(deliveryZone.homeFee)
      : baseDeliveryFee;

    deliverySnapshot = {
      deliveryZoneId: deliveryZone.id,
      deliveryWilayaCode: deliveryZone.wilayaCode,
      deliveryWilayaName: deliveryZone.wilayaName,
      deliveryMethod: effectiveDeliveryMethod,
      deliveryFee,
      returnFee: Number(deliveryZone.returnFee),
    };
  }

  let customerId: number | null = null;
  const [existingCustomer] = await db.select().from(customersTable)
    .where(and(eq(customersTable.storeId, params.data.storeId), eq(customersTable.phone, body.data.customerPhone)));

  if (existingCustomer) {
    customerId = existingCustomer.id;
    await db.update(customersTable)
      .set({ name: body.data.customerName, city: body.data.customerCity })
      .where(and(eq(customersTable.id, existingCustomer.id), eq(customersTable.storeId, params.data.storeId)));
  } else {
    const [newCustomer] = await db.insert(customersTable).values({
      storeId: params.data.storeId,
      name: body.data.customerName,
      phone: body.data.customerPhone,
      city: body.data.customerCity,
    }).returning();
    customerId = newCustomer.id;
  }

  const [order] = await db.insert(ordersTable).values({
    storeId: params.data.storeId,
    landingPageId: body.data.landingPageId,
    productImageUrl,
    customerId,
    customerName: body.data.customerName,
    customerPhone: body.data.customerPhone,
    customerCity: deliverySnapshot.deliveryWilayaName ?? body.data.customerCity,
    customerAddress: body.data.customerAddress,
    deliveryZoneId: deliverySnapshot.deliveryZoneId,
    deliveryWilayaCode: deliverySnapshot.deliveryWilayaCode,
    deliveryWilayaName: deliverySnapshot.deliveryWilayaName,
    deliveryMethod: deliverySnapshot.deliveryMethod,
    deliveryFee: String(deliverySnapshot.deliveryFee),
    returnFee: String(deliverySnapshot.returnFee),
    selectedSize: body.data.selectedSize,
    selectedColor: body.data.selectedColor,
    quantity: body.data.quantity ?? 1,
    unitPrice: String(unitPrice),
    totalPrice: String(totalPrice),
    notes: body.data.notes,
    status: "NEW",
  }).returning();

  await logAudit({ storeId: params.data.storeId, orderId: order.id, action: "ORDER_CREATED", toStatus: "NEW" });
  res.status(201).json(formatOrder(order as unknown as Record<string, unknown>, page.productName, productImageUrl, page.transportMode));
});

ordersRouter.get("/:orderId/audit", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const storeId = Number((req.params as { storeId?: string }).storeId);
  const orderId = Number(req.params.orderId);
  if (!storeId || !orderId) { res.status(400).json({ error: "Invalid params" }); return; }

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.orderId, orderId), eq(auditLogsTable.storeId, storeId)))
    .orderBy(auditLogsTable.createdAt);

  res.json(logs);
});

ordersRouter.get("/:orderId", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = GetOrderParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
    orderId: Number(req.params.orderId),
  });
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }

  const [row] = await db
    .select({
      order: ordersTable,
      landingPageName: landingPagesTable.productName,
      landingPageImageUrl: landingPagesTable.imageUrl,
      landingPageProductImages: landingPagesTable.productImages,
      transportMode: landingPagesTable.transportMode,
    })
    .from(ordersTable)
    .leftJoin(landingPagesTable, eq(ordersTable.landingPageId, landingPagesTable.id))
    .where(and(eq(ordersTable.id, params.data.orderId), eq(ordersTable.storeId, params.data.storeId)));

  if (!row) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(formatOrder(
    row.order as unknown as Record<string, unknown>,
    row.landingPageName,
    firstProductImage({ imageUrl: row.landingPageImageUrl, productImages: row.landingPageProductImages }),
    row.transportMode,
  ));
});

ordersRouter.patch("/:orderId", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = UpdateOrderParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
    orderId: Number(req.params.orderId),
  });
  const body = UpdateOrderBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [existing] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.orderId), eq(ordersTable.storeId, params.data.storeId)));
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }

  if (body.data.customerPhone && existing.customerId && body.data.customerPhone !== existing.customerPhone) {
    const [duplicateCustomer] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(and(
        eq(customersTable.storeId, params.data.storeId),
        eq(customersTable.phone, body.data.customerPhone),
        ne(customersTable.id, existing.customerId),
      ));
    if (duplicateCustomer) {
      res.status(409).json({ error: "Customer phone already belongs to another customer" });
      return;
    }
  }

  if (body.data.status && body.data.status !== existing.status) {
    if (!isValidTransition(existing.status, body.data.status)) {
      res.status(422).json({ error: `انتقال غير مسموح من ${existing.status} إلى ${body.data.status}` });
      return;
    }
  }

  let returnReason: string | null = null;
  if (body.data.status === "RETURNED") {
    returnReason = body.data.returnReason?.trim() || null;
    if (!returnReason) {
      res.status(422).json({ error: "سبب الإرجاع مطلوب" });
      return;
    }
  }

  const updateData: Record<string, unknown> = { ...body.data };
  if (body.data.status === "CONFIRMED") updateData.confirmedAt = new Date();
  if (body.data.status === "SHIPPED") updateData.shippedAt = new Date();
  if (body.data.status === "DELIVERED") updateData.deliveredAt = new Date();
  if (body.data.status === "RETURNED") {
    updateData.returnedAt = new Date();
    updateData.returnReason = returnReason;
  }

  const [order] = await db.update(ordersTable)
    .set(updateData)
    .where(and(eq(ordersTable.id, params.data.orderId), eq(ordersTable.storeId, params.data.storeId)))
    .returning();

  if (order.customerId && (body.data.customerPhone || body.data.customerCity)) {
    const customerUpdate: Record<string, unknown> = {};
    if (body.data.customerPhone) customerUpdate.phone = body.data.customerPhone;
    if (body.data.customerCity) customerUpdate.city = body.data.customerCity;
    await db.update(customersTable)
      .set(customerUpdate)
      .where(and(eq(customersTable.id, order.customerId), eq(customersTable.storeId, params.data.storeId)));
  }

  if (body.data.status && body.data.status !== existing.status) {
    await logAudit({
      storeId: params.data.storeId,
      orderId: order.id,
      action: "STATUS_CHANGED",
      fromStatus: existing.status,
      toStatus: body.data.status,
      note: body.data.status === "RETURNED" ? returnReason ?? undefined : (body.data.notes ?? undefined),
    });
  }

  const [page] = await db.select().from(landingPagesTable).where(eq(landingPagesTable.id, order.landingPageId));
  res.json(formatOrder(order as unknown as Record<string, unknown>, page?.productName ?? null, firstProductImage(page), page?.transportMode ?? null));
});

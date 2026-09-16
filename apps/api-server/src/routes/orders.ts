import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { and, auditLogsTable, customersTable, db, eq, landingPagesTable, ne, ordersTable, sql } from "@workspace/db";
import {
  ListOrdersParams,
  GetOrderParams,
  UpdateOrderParams,
  UpdateOrderBody,
  GetOrdersSummaryParams,
} from "@workspace/api-zod";
import { isValidTransition } from "../lib/transitions.js";
import { logAudit } from "../lib/audit.js";
import { firstProductImage, formatOrder } from "../lib/order-format.js";
import { executeManualOrder } from "../lib/manual-order.js";

export const ordersRouter = Router({ mergeParams: true });

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
  const storeId = Number((req.params as { storeId?: string }).storeId);
  const outcome = await executeManualOrder(storeId, req.body);
  res.status(outcome.status).json(outcome.body);
});

ordersRouter.post("/manual", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const storeId = Number((req.params as { storeId?: string }).storeId);
  const outcome = await executeManualOrder(storeId, req.body);
  res.status(outcome.status).json(outcome.body);
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

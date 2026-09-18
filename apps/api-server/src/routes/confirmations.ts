import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { and, db, eq, landingPagesTable, ordersTable, sql } from "@workspace/db";
import {
  ListConfirmationsParams,
  ConfirmOrderParams,
  ConfirmOrderBody,
  RejectOrderParams,
  RejectOrderBody,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit.js";
import { firstProductImage, formatOrder } from "../lib/order-format.js";

export const confirmationsRouter = Router({ mergeParams: true });
export const confirmationActionsRouter = Router({ mergeParams: true });

confirmationsRouter.get("/", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = ListConfirmationsParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
  });
  if (!params.success) { res.status(400).json({ error: "Invalid storeId" }); return; }

  const rows = await db
    .select({
      order: ordersTable,
      landingPageName: landingPagesTable.productName,
      landingPageImageUrl: landingPagesTable.imageUrl,
      landingPageProductImages: landingPagesTable.productImages,
      transportMode: landingPagesTable.transportMode,
    })
    .from(ordersTable)
    .leftJoin(landingPagesTable, eq(ordersTable.landingPageId, landingPagesTable.id))
    .where(and(eq(ordersTable.storeId, params.data.storeId), eq(ordersTable.status, "PENDING_CONFIRMATION")))
    .orderBy(sql`${ordersTable.createdAt} ASC`);

  res.json(rows.map(r => formatOrder(
    r.order as unknown as Record<string, unknown>,
    r.landingPageName,
    firstProductImage({ imageUrl: r.landingPageImageUrl, productImages: r.landingPageProductImages }),
    r.transportMode,
  )));
});

confirmationActionsRouter.post("/:orderId/confirm", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = ConfirmOrderParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
    orderId: Number(req.params.orderId),
  });
  const body = ConfirmOrderBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [existing] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.orderId), eq(ordersTable.storeId, params.data.storeId)));
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }
  if (existing.status !== "PENDING_CONFIRMATION") {
    res.status(422).json({ error: "يجب أن يكون الطلب في حالة بانتظار التأكيد" });
    return;
  }

  const [order] = await db.update(ordersTable)
    .set({ status: "CONFIRMED", confirmedAt: new Date(), notes: body.data.notes })
    .where(and(eq(ordersTable.id, params.data.orderId), eq(ordersTable.storeId, params.data.storeId)))
    .returning();

  await logAudit({
    storeId: params.data.storeId,
    orderId: order.id,
    action: "ORDER_CONFIRMED",
    fromStatus: "PENDING_CONFIRMATION",
    toStatus: "CONFIRMED",
    note: body.data.notes ?? undefined,
  });

  const [page] = await db.select().from(landingPagesTable).where(eq(landingPagesTable.id, order.landingPageId));
  res.json(formatOrder(order as unknown as Record<string, unknown>, page?.productName ?? null, firstProductImage(page), page?.transportMode ?? null));
});

confirmationActionsRouter.post("/:orderId/reject", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = RejectOrderParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
    orderId: Number(req.params.orderId),
  });
  const body = RejectOrderBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [existing] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.orderId), eq(ordersTable.storeId, params.data.storeId)));
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }
  if (existing.status !== "PENDING_CONFIRMATION") {
    res.status(422).json({ error: "يجب أن يكون الطلب في حالة بانتظار التأكيد" });
    return;
  }

  const [order] = await db.update(ordersTable)
    .set({ status: "REJECTED", notes: body.data.notes })
    .where(and(eq(ordersTable.id, params.data.orderId), eq(ordersTable.storeId, params.data.storeId)))
    .returning();

  await logAudit({
    storeId: params.data.storeId,
    orderId: order.id,
    action: "ORDER_REJECTED",
    fromStatus: "PENDING_CONFIRMATION",
    toStatus: "REJECTED",
    note: body.data.notes ?? undefined,
  });

  const [page] = await db.select().from(landingPagesTable).where(eq(landingPagesTable.id, order.landingPageId));
  res.json(formatOrder(order as unknown as Record<string, unknown>, page?.productName ?? null, firstProductImage(page), page?.transportMode ?? null));
});

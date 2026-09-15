import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { and, customersTable, db, eq, landingPagesTable, ordersTable, sql } from "@workspace/db";
import {
  ListCustomersParams,
  GetCustomerParams,
  UpdateCustomerParams,
  UpdateCustomerBody,
} from "@workspace/api-zod";

export const customersRouter = Router({ mergeParams: true });

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function firstProductImage(page: { productImages?: unknown; imageUrl?: string | null } | null | undefined): string | null {
  if (!page) return null;
  return asStringArray(page.productImages)[0] ?? page.imageUrl ?? null;
}

customersRouter.get("/", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = ListCustomersParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid storeId" });
    return;
  }

  const search = req.query.search as string | undefined;

  const rows = await db
    .select({
      customer: customersTable,
      ordersCount: sql<number>`count(${ordersTable.id})::int`,
      totalSpent: sql<number>`coalesce(sum(${ordersTable.totalPrice})::float, 0)`,
    })
    .from(customersTable)
    .leftJoin(ordersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(customersTable.storeId, params.data.storeId))
    .groupBy(customersTable.id)
    .orderBy(sql`count(${ordersTable.id}) DESC`);

  let result = rows;
  if (search) {
    const q = search.toLowerCase();
    result = rows.filter(r =>
      r.customer.name.toLowerCase().includes(q) ||
      r.customer.phone.toLowerCase().includes(q) ||
      r.customer.city.toLowerCase().includes(q)
    );
  }

  res.json(result.map(r => ({
    ...r.customer,
    notes: r.customer.notes ?? null,
    ordersCount: r.ordersCount,
    totalSpent: r.totalSpent,
  })));
});

customersRouter.get("/:customerId", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = GetCustomerParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
    customerId: Number(req.params.customerId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [row] = await db
    .select({
      customer: customersTable,
      ordersCount: sql<number>`count(${ordersTable.id})::int`,
      totalSpent: sql<number>`coalesce(sum(${ordersTable.totalPrice})::float, 0)`,
    })
    .from(customersTable)
    .leftJoin(ordersTable, eq(ordersTable.customerId, customersTable.id))
    .where(and(eq(customersTable.id, params.data.customerId), eq(customersTable.storeId, params.data.storeId)))
    .groupBy(customersTable.id);

  if (!row) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const orders = await db
    .select({
      order: ordersTable,
      landingPageName: landingPagesTable.productName,
      landingPageImageUrl: landingPagesTable.imageUrl,
      landingPageProductImages: landingPagesTable.productImages,
    })
    .from(ordersTable)
    .leftJoin(landingPagesTable, eq(ordersTable.landingPageId, landingPagesTable.id))
    .where(and(eq(ordersTable.customerId, params.data.customerId), eq(ordersTable.storeId, params.data.storeId)))
    .orderBy(sql`${ordersTable.createdAt} DESC`);

  res.json({
    ...row.customer,
    notes: row.customer.notes ?? null,
    ordersCount: row.ordersCount,
    totalSpent: row.totalSpent,
    orders: orders.map(r => ({
      ...r.order,
      unitPrice: Number(r.order.unitPrice),
      totalPrice: Number(r.order.totalPrice),
      deliveryZoneId: r.order.deliveryZoneId ?? null,
      deliveryWilayaCode: r.order.deliveryWilayaCode ?? null,
      deliveryWilayaName: r.order.deliveryWilayaName ?? null,
      deliveryCommuneName: r.order.deliveryCommuneName ?? null,
      deliveryDairaName: r.order.deliveryDairaName ?? null,
      deliveryMethod: r.order.deliveryMethod ?? null,
      deliveryFee: Number(r.order.deliveryFee ?? 0),
      returnFee: Number(r.order.returnFee ?? 0),
      payableTotal: Number(r.order.totalPrice ?? 0) + Number(r.order.deliveryFee ?? 0),
      customerAddress: r.order.customerAddress ?? null,
      customerId: r.order.customerId ?? null,
      notes: r.order.notes ?? null,
      confirmedAt: r.order.confirmedAt ?? null,
      shippedAt: r.order.shippedAt ?? null,
      deliveredAt: r.order.deliveredAt ?? null,
      returnedAt: r.order.returnedAt ?? null,
      landingPageName: r.landingPageName ?? null,
      productImageUrl: r.order.productImageUrl ?? firstProductImage({ imageUrl: r.landingPageImageUrl, productImages: r.landingPageProductImages }),
    })),
  });
});

customersRouter.patch("/:customerId", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = UpdateCustomerParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
    customerId: Number(req.params.customerId),
  });
  const body = UpdateCustomerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [customer] = await db.update(customersTable)
    .set(body.data)
    .where(and(eq(customersTable.id, params.data.customerId), eq(customersTable.storeId, params.data.storeId)))
    .returning();

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const [{ ordersCount, totalSpent }] = await db
    .select({
      ordersCount: sql<number>`count(*)::int`,
      totalSpent: sql<number>`coalesce(sum(total_price)::float, 0)`,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.customerId, customer.id), eq(ordersTable.storeId, params.data.storeId)));

  res.json({ ...customer, notes: customer.notes ?? null, ordersCount, totalSpent });
});

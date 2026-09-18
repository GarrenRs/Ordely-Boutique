import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { and, db, eq, gte, lt, ordersTable, sql } from "@workspace/db";
import {
  GetDailyReportParams,
  GetWeeklyReportParams,
} from "@workspace/api-zod";

export const reportsRouter = Router({ mergeParams: true });

async function buildDailyReport(storeId: number, dateStr: string) {
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const report = {
    date: dateStr,
    totalOrders: 0,
    newOrders: 0,
    pendingConfirmation: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    returned: 0,
    cancelled: 0,
    rejected: 0,
    revenue: 0,
    deliveryRevenue: 0,
    returnLoss: 0,
    netRevenue: 0,
  };

  type EventDateColumn =
    | typeof ordersTable.createdAt
    | typeof ordersTable.confirmedAt
    | typeof ordersTable.shippedAt
    | typeof ordersTable.deliveredAt
    | typeof ordersTable.returnedAt;

  type OrderStatus = typeof ordersTable.$inferSelect.status;

  async function eventRows(status: OrderStatus, column: EventDateColumn) {
    const [row] = await db
      .select({
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${ordersTable.totalPrice})::float, 0)`,
        deliveryRevenue: sql<number>`coalesce(sum(${ordersTable.deliveryFee})::float, 0)`,
        returnLoss: sql<number>`coalesce(sum(${ordersTable.returnFee})::float, 0)`,
      })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.storeId, storeId),
        eq(ordersTable.status, status),
        gte(column, dayStart),
        lt(column, dayEnd),
      ));
    return row;
  }

  const [createdRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(and(eq(ordersTable.storeId, storeId), gte(ordersTable.createdAt, dayStart), lt(ordersTable.createdAt, dayEnd)));
  report.totalOrders = createdRow.count;

  const newRows = await eventRows("NEW", ordersTable.createdAt);
  report.newOrders = newRows.count;
  const pendingRows = await eventRows("PENDING_CONFIRMATION", ordersTable.createdAt);
  report.pendingConfirmation = pendingRows.count;
  const confirmedRows = await eventRows("CONFIRMED", ordersTable.confirmedAt);
  report.confirmed = confirmedRows.count;
  const shippedRows = await eventRows("SHIPPED", ordersTable.shippedAt);
  report.shipped = shippedRows.count;
  const deliveredRows = await eventRows("DELIVERED", ordersTable.deliveredAt);
  report.delivered = deliveredRows.count;
  report.revenue = Number(deliveredRows.revenue) || 0;
  report.deliveryRevenue = Number(deliveredRows.deliveryRevenue) || 0;
  const returnedRows = await eventRows("RETURNED", ordersTable.returnedAt);
  report.returned = returnedRows.count;
  report.returnLoss = Number(returnedRows.returnLoss) || 0;
  const cancelledRows = await eventRows("CANCELLED", ordersTable.createdAt);
  report.cancelled = cancelledRows.count;
  const rejectedRows = await eventRows("REJECTED", ordersTable.createdAt);
  report.rejected = rejectedRows.count;

  report.netRevenue = report.revenue + report.deliveryRevenue - report.returnLoss;

  return report;
}

reportsRouter.get("/daily", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = GetDailyReportParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid storeId" });
    return;
  }
  const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
  const report = await buildDailyReport(params.data.storeId, dateStr);
  res.json(report);
});

reportsRouter.get("/weekly", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = GetWeeklyReportParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid storeId" });
    return;
  }

  const reports = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    reports.push(await buildDailyReport(params.data.storeId, dateStr));
  }

  res.json(reports);
});

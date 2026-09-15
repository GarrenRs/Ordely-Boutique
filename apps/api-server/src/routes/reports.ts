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

  const rows = await db
    .select({
      status: ordersTable.status,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(total_price)::float, 0)`,
      deliveryRevenue: sql<number>`coalesce(sum(delivery_fee)::float, 0)`,
      returnLoss: sql<number>`coalesce(sum(return_fee)::float, 0)`,
    })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.storeId, storeId),
      gte(ordersTable.createdAt, dayStart),
      lt(ordersTable.createdAt, dayEnd)
    ))
    .groupBy(ordersTable.status);

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

  for (const row of rows) {
    report.totalOrders += row.count;
    if (row.status === "NEW") report.newOrders = row.count;
    if (row.status === "PENDING_CONFIRMATION") report.pendingConfirmation = row.count;
    if (row.status === "CONFIRMED") report.confirmed = row.count;
    if (row.status === "SHIPPED") report.shipped = row.count;
    if (row.status === "DELIVERED") {
      report.delivered = row.count;
      report.revenue += Number(row.revenue) || 0;
      report.deliveryRevenue += Number(row.deliveryRevenue) || 0;
    }
    if (row.status === "RETURNED") {
      report.returned = row.count;
      report.returnLoss += Number(row.returnLoss) || 0;
    }
    if (row.status === "CANCELLED") report.cancelled = row.count;
    if (row.status === "REJECTED") report.rejected = row.count;
  }

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

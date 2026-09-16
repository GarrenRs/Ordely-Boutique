import { db, auditLogsTable } from "@workspace/db";
import type { ReadinessDb } from "./readiness.js";

export async function logAudit(
  params: {
    storeId: number;
    orderId: number;
    action: string;
    fromStatus?: string;
    toStatus?: string;
    note?: string;
  },
  client: ReadinessDb = db,
): Promise<void> {
  await client.insert(auditLogsTable).values(params).catch(() => {});
}

import { db, auditLogsTable } from "@workspace/db";

export async function logAudit(params: {
  storeId: number;
  orderId: number;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  note?: string;
}): Promise<void> {
  await db.insert(auditLogsTable).values(params).catch(() => {});
}

import { appSchema } from "./app-schema";
import { storesTable } from "./stores";
import { ordersTable } from "./orders";
import { serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const auditLogsTable = appSchema.table("audit_logs", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("audit_logs_store_order_idx").on(table.storeId, table.orderId)
]);

export type AuditLog = typeof auditLogsTable.$inferSelect;
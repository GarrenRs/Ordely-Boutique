import { z } from "zod/v4";
import { appSchema } from "./app-schema";
import { storesTable } from "./stores";
import { serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const merchantLeadStatusEnum = appSchema.enum("merchant_lead_status", [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "REJECTED",
  "CONVERTED"
]);

export const merchantLeadsTable = appSchema.table("merchant_leads", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  storeName: text("store_name").notNull(),
  storeSlug: text("store_slug"),
  businessType: text("business_type").notNull(),
  wilaya: text("wilaya").notNull(),
  sellingStatus: text("selling_status").notNull(),
  notes: text("notes"),
  convertedStoreId: integer("converted_store_id").references(() => storesTable.id),
  status: merchantLeadStatusEnum("status").notNull().default("NEW"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => [
  index("merchant_leads_status_idx").on(table.status),
  index("merchant_leads_created_at_idx").on(table.createdAt)
]);

export const insertMerchantLeadSchema = createInsertSchema(merchantLeadsTable).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true
});
export type InsertMerchantLead = z.infer<typeof insertMerchantLeadSchema>;
export type MerchantLead = typeof merchantLeadsTable.$inferSelect;
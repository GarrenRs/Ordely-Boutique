import { z } from "zod/v4";
import { appSchema } from "./app-schema";
import { storesTable } from "./stores";
import { serial, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const customersTable = appSchema.table("customers", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  city: text("city").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => [
  index("customers_store_id_idx").on(table.storeId),
  uniqueIndex("customers_store_phone_unique").on(table.storeId, table.phone)
]);

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;

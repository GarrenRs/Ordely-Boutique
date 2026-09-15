import { z } from "zod/v4";
import { appSchema } from "./app-schema";
import { storesTable } from "./stores";
import { serial, text, boolean, integer, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const deliveryMethodEnum = appSchema.enum("delivery_method", [
  "HOME",
  "OFFICE"
]);

export const deliveryZonesTable = appSchema.table("delivery_zones", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  wilayaCode: text("wilaya_code").notNull(),
  wilayaName: text("wilaya_name").notNull(),
  homeFee: numeric("home_fee", { precision: 10, scale: 2 }),
  officeFee: numeric("office_fee", { precision: 10, scale: 2 }),
  returnFee: numeric("return_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => [
  index("delivery_zones_store_id_idx").on(table.storeId),
  uniqueIndex("delivery_zones_store_wilaya_unique").on(table.storeId, table.wilayaCode)
]);

export const insertDeliveryZoneSchema = createInsertSchema(deliveryZonesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeliveryZone = z.infer<typeof insertDeliveryZoneSchema>;
export type DeliveryZone = typeof deliveryZonesTable.$inferSelect;

export const deliveryCommuneSettingsTable = appSchema.table("delivery_commune_settings", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  wilayaCode: text("wilaya_code").notNull(),
  communeName: text("commune_name").notNull(),
  dairaName: text("daira_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => [
  index("delivery_communes_store_wilaya_idx").on(table.storeId, table.wilayaCode),
  uniqueIndex("delivery_communes_store_wilaya_name_unique").on(table.storeId, table.wilayaCode, table.communeName)
]);

export type DeliveryCommuneSetting = typeof deliveryCommuneSettingsTable.$inferSelect;
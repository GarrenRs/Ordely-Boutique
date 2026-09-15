import { z } from "zod/v4";
import { appSchema } from "./app-schema";
import { storesTable } from "./stores";
import { landingPagesTable } from "./landing-pages";
import { customersTable } from "./customers";
import { deliveryZonesTable, deliveryMethodEnum } from "./delivery-zones";
import { serial, text, boolean, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const orderStatusEnum = appSchema.enum("order_status", [
  "NEW",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
  "REJECTED"
]);

export const ordersTable = appSchema.table("orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  landingPageId: integer("landing_page_id").notNull().references(() => landingPagesTable.id),
  productImageUrl: text("product_image_url"),
  customerId: integer("customer_id").references(() => customersTable.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerCity: text("customer_city").notNull(),
  customerAddress: text("customer_address"),
  deliveryZoneId: integer("delivery_zone_id").references(() => deliveryZonesTable.id),
  deliveryWilayaCode: text("delivery_wilaya_code"),
  deliveryWilayaName: text("delivery_wilaya_name"),
  deliveryCommuneName: text("delivery_commune_name"),
  deliveryDairaName: text("delivery_daira_name"),
  deliveryMethod: deliveryMethodEnum("delivery_method"),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  returnFee: numeric("return_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  selectedSize: text("selected_size"),
  selectedColor: text("selected_color"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  status: orderStatusEnum("status").notNull().default("NEW"),
  notes: text("notes"),
  returnReason: text("return_reason"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => [
  index("orders_store_id_idx").on(table.storeId),
  index("orders_store_status_idx").on(table.storeId, table.status),
  index("orders_landing_page_id_idx").on(table.landingPageId),
  index("orders_customer_id_idx").on(table.customerId),
  index("orders_delivery_zone_id_idx").on(table.deliveryZoneId)
]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
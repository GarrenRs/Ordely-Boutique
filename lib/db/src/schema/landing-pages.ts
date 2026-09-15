import { z } from "zod/v4";
import { appSchema } from "./app-schema";
import { storesTable } from "./stores";
import { productCategoriesTable } from "./product-categories";
import { serial, text, boolean, integer, numeric, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export const landingPagesTable = appSchema.table("landing_pages", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  categoryId: integer("category_id").references(() => productCategoriesTable.id),
  productName: text("product_name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url"),
  productImages: jsonb("product_images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  availableSizes: jsonb("available_sizes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  availableColors: jsonb("available_colors").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  galleryDisplay: text("gallery_display").notNull().default("carousel"),
  themeColor: text("theme_color").notNull().default("#f59e0b"),
  template: text("template").notNull().default("classic"),
  slug: text("slug").notNull(),
  transportMode: text("transport_mode").notNull().default("DELIVERY_COMPANY"),
  deliveryInfo: text("delivery_info"),
  whatsappNumber: text("whatsapp_number"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => [
  index("landing_pages_store_id_idx").on(table.storeId),
  index("landing_pages_store_category_idx").on(table.storeId, table.categoryId),
  uniqueIndex("landing_pages_store_slug_unique").on(table.storeId, table.slug)
]);

export const insertLandingPageSchema = createInsertSchema(landingPagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLandingPage = z.infer<typeof insertLandingPageSchema>;
export type LandingPage = typeof landingPagesTable.$inferSelect;
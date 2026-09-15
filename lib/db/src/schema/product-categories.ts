import { z } from "zod/v4";
import { appSchema } from "./app-schema";
import { storesTable } from "./stores";
import { serial, text, boolean, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export const productCategoriesTable = appSchema.table("product_categories", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => [
  index("product_categories_store_id_idx").on(table.storeId),
  uniqueIndex("product_categories_store_slug_unique").on(table.storeId, table.slug),
  uniqueIndex("product_categories_store_default_unique").on(table.storeId).where(sql`${table.isDefault} = true`)
]);

export const insertProductCategorySchema = createInsertSchema(productCategoriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;
export type ProductCategory = typeof productCategoriesTable.$inferSelect;

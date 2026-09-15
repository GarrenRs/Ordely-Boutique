import { z } from "zod/v4";
import { appSchema } from "./app-schema";
import { serial, text, boolean, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const storesTable = appSchema.table("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  ownerName: text("owner_name").notNull(),
  phone: text("phone").notNull(),
  city: text("city").notNull(),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  subscriptionPlanDays: integer("subscription_plan_days"),
  subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => [
  uniqueIndex("stores_slug_unique").on(table.slug)
]);

export const insertStoreSchema = createInsertSchema(storesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;

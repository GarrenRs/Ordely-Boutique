import { appSchema } from "./app-schema";
import { serial, text, timestamp } from "drizzle-orm/pg-core";

export const providerUsersTable = appSchema.table("provider_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export type ProviderUser = typeof providerUsersTable.$inferSelect;
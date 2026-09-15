import { defineConfig } from "drizzle-kit";
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/*.ts",
  dialect: "postgresql",
  schemaFilter: ["order_os"],
  tablesFilter: [
    "stores",
    "users",
    "provider_users",
    "customers",
    "product_categories",
    "delivery_zones",
    "delivery_commune_settings",
    "landing_pages",
    "orders",
    "audit_logs",
    "merchant_leads",
  ],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});

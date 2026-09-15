import { createTenant } from "./tenant.mjs";

const result = await createTenant({
  email: process.env.DEV_ADMIN_EMAIL ?? "admin@store.com",
  password: process.env.DEV_ADMIN_PASSWORD ?? "admin123",
  storeSlug: process.env.DEV_STORE_SLUG ?? "demo-store",
  storeName: process.env.DEV_STORE_NAME ?? "Demo Store",
  ownerName: process.env.DEV_STORE_OWNER_NAME ?? "Admin",
  phone: process.env.DEV_STORE_PHONE ?? "0500000000",
  city: process.env.DEV_STORE_CITY ?? "Alger",
  demoSlug: process.env.DEV_DEMO_SLUG ?? "demo-product",
  demoProductName: process.env.DEV_DEMO_PRODUCT_NAME ?? "Demo Product",
  demoPrice: process.env.DEV_DEMO_PRICE ?? "149.00",
  demoDescription:
    process.env.DEV_DEMO_DESCRIPTION ??
    "Demo order page for local dashboard verification.",
  demoDeliveryInfo:
    process.env.DEV_DEMO_DELIVERY_INFO ??
    "Delivery inside Algeria.",
});

console.log(`Seeded tenant store_id=${result.storeId}`);
console.log(`Public store slug=${result.storeSlug}`);
console.log(`Login email=${result.email}`);
console.log("Login password is the configured DEV_ADMIN_PASSWORD value.");

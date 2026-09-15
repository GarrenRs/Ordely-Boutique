import { createTenant } from "./tenant.mjs";

const result = await createTenant({
  email: process.env.TENANT_EMAIL,
  password: process.env.TENANT_PASSWORD,
  storeSlug: process.env.TENANT_STORE_SLUG,
  storeName: process.env.TENANT_STORE_NAME,
  ownerName: process.env.TENANT_OWNER_NAME,
  phone: process.env.TENANT_PHONE,
  city: process.env.TENANT_CITY,
  demoSlug: process.env.TENANT_DEMO_SLUG,
  demoProductName: process.env.TENANT_DEMO_PRODUCT_NAME,
  demoPrice: process.env.TENANT_DEMO_PRICE,
  demoDescription: process.env.TENANT_DEMO_DESCRIPTION,
  demoDeliveryInfo: process.env.TENANT_DEMO_DELIVERY_INFO,
});

console.log(`Tenant ready: store_id=${result.storeId}`);
console.log(`Public store slug=${result.storeSlug}`);
console.log(`Login email=${result.email}`);
console.log(`Store name=${result.storeName}`);

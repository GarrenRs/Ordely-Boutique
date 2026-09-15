import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { and, customersTable, db, deliveryCommuneSettingsTable, deliveryZonesTable, eq, landingPagesTable, ordersTable, productCategoriesTable, sql, storesTable } from "@workspace/db";
import { z } from "zod";
import { publicOrderLimiter } from "../middleware/rateLimiter.js";
import { logAudit } from "../lib/audit.js";
import { findCommuneInWilaya, findWilayaByCode } from "../lib/algeria-locations.js";

export const publicRouter = Router();

const effectiveActiveStoreSql = sql`${storesTable.isActive} = true and (${storesTable.subscriptionExpiresAt} is null or ${storesTable.subscriptionExpiresAt} > now())`;

const PublicOrderSchema = z.object({
  customerName: z.string().min(2).max(100),
  customerPhone: z.string().min(9).max(20),
  customerCity: z.string().min(2).max(100).optional(),
  customerAddress: z.string().max(500).optional(),
  deliveryZoneId: z.number().int().positive(),
  deliveryCommuneName: z.string().min(1).max(100),
  deliveryMethod: z.enum(["HOME", "OFFICE"]),
  selectedSize: z.string().max(50).optional(),
  selectedColor: z.string().max(50).optional(),
  quantity: z.number().int().min(1).max(10).default(1),
  notes: z.string().max(1000).optional(),
});

type LandingPageRow = typeof landingPagesTable.$inferSelect;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function firstProductImage(page: { productImages?: unknown; imageUrl?: string | null }): string | null {
  return asStringArray(page.productImages)[0] ?? page.imageUrl ?? null;
}

function validateVariantSelection(
  options: string[],
  selected: string | null | undefined,
  label: string,
): string | null {
  if (!options.length) return null;
  if (!selected) return `${label} is required for this product`;
  if (!options.includes(selected)) return `${label} is not available for this product`;
  return null;
}

async function findActiveStore(storeSlug: string) {
  const normalized = String(storeSlug ?? "").trim().toLowerCase();
  if (!normalized) return null;
  const numericStoreId = /^\d+$/.test(normalized) ? Number(normalized) : null;
  const [store] = await db
    .select()
    .from(storesTable)
    .where(and(
      numericStoreId ? eq(storesTable.id, numericStoreId) : eq(storesTable.slug, normalized),
      effectiveActiveStoreSql,
    ));
  return store ?? null;
}

async function findActiveProduct(storeId: number, productSlug: string) {
  const slug = String(productSlug ?? "").trim();
  if (!slug) return null;
  const [page] = await db
    .select()
    .from(landingPagesTable)
    .where(and(
      eq(landingPagesTable.storeId, storeId),
      eq(landingPagesTable.slug, slug),
      eq(landingPagesTable.isActive, true),
    ));
  return page ?? null;
}

async function findActiveLegacyProducts(productSlug: string) {
  const slug = String(productSlug ?? "").trim();
  if (!slug) return [];
  const rows = await db
    .select({ page: landingPagesTable })
    .from(landingPagesTable)
    .innerJoin(storesTable, eq(storesTable.id, landingPagesTable.storeId))
    .where(and(
      eq(landingPagesTable.slug, slug),
      eq(landingPagesTable.isActive, true),
      effectiveActiveStoreSql,
    ))
    .limit(2);

  return rows.map((row) => row.page);
}

function formatPublicDeliveryZone(zone: typeof deliveryZonesTable.$inferSelect, disabledCommuneNames: Set<string>) {
  const sourceWilaya = findWilayaByCode(zone.wilayaCode);
  return {
    id: zone.id,
    wilayaCode: zone.wilayaCode,
    wilayaName: sourceWilaya?.name ?? zone.wilayaName,
    homeFee: zone.homeFee === null ? null : Number(zone.homeFee),
    officeFee: zone.officeFee === null ? null : Number(zone.officeFee),
    returnFee: Number(zone.returnFee),
    communes: (sourceWilaya?.communes ?? []).filter((commune) => !disabledCommuneNames.has(`${zone.wilayaCode}:${commune.name}`)),
  };
}

async function deliveryZonesForStore(storeId: number) {
  const [deliveryZones, communeSettings] = await Promise.all([
    db
      .select()
      .from(deliveryZonesTable)
      .where(and(eq(deliveryZonesTable.storeId, storeId), eq(deliveryZonesTable.isActive, true)))
      .orderBy(deliveryZonesTable.wilayaCode),
    db
      .select()
      .from(deliveryCommuneSettingsTable)
      .where(eq(deliveryCommuneSettingsTable.storeId, storeId)),
  ]);

  const disabledCommuneNames = new Set(
    communeSettings
      .filter((setting) => !setting.isActive)
      .map((setting) => `${setting.wilayaCode}:${setting.communeName}`),
  );

  return deliveryZones
    .filter((zone) => zone.officeFee !== null)
    .map((zone) => formatPublicDeliveryZone(zone, disabledCommuneNames))
    .filter((zone) => zone.communes.length > 0);
}

async function landingPagePayload(page: LandingPageRow) {
  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, page.storeId));
  const relatedPages = await db
    .select()
    .from(landingPagesTable)
    .where(and(eq(landingPagesTable.storeId, page.storeId), eq(landingPagesTable.isActive, true)))
    .orderBy(landingPagesTable.id);
  const relatedProducts = relatedPages
    .filter((item) => item.id !== page.id)
    .sort((first, second) => {
      const firstSameCategory = first.categoryId !== null && first.categoryId === page.categoryId ? 0 : 1;
      const secondSameCategory = second.categoryId !== null && second.categoryId === page.categoryId ? 0 : 1;
      return firstSameCategory - secondSameCategory;
    })
    .slice(0, 6);

  return {
    id: page.id,
    categoryId: page.categoryId ?? null,
    productName: page.productName,
    price: Number(page.price),
    description: page.description,
    imageUrl: page.imageUrl ?? null,
    productImages: asStringArray(page.productImages),
    availableSizes: asStringArray(page.availableSizes),
    availableColors: asStringArray(page.availableColors),
    galleryDisplay: page.galleryDisplay,
    themeColor: page.themeColor,
    transportMode: page.transportMode ?? "DELIVERY_COMPANY",
    deliveryInfo: page.deliveryInfo ?? null,
    whatsappNumber: page.whatsappNumber ?? null,
    deliveryZones: await deliveryZonesForStore(page.storeId),
    storeId: page.storeId,
    store: store
      ? {
          slug: store.slug,
          name: store.name,
        }
      : null,
    relatedProducts: relatedProducts.map((product) => ({
      id: product.id,
      categoryId: product.categoryId ?? null,
      productName: product.productName,
      price: Number(product.price),
      description: product.description,
      slug: product.slug,
      imageUrl: product.imageUrl ?? null,
      productImages: asStringArray(product.productImages),
    })),
  };
}

async function createPublicOrder(page: LandingPageRow, reqBody: unknown) {
  const parsed = PublicOrderSchema.safeParse(reqBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "بيانات غير صحيحة", details: parsed.error.issues } } as const;
  }

  const { customerName, customerPhone, customerAddress, deliveryZoneId, deliveryCommuneName, deliveryMethod, selectedSize, selectedColor, quantity, notes } = parsed.data;
  const transportMode = page.transportMode ?? "DELIVERY_COMPANY";
  const effectiveDeliveryMethod = transportMode === "SHED_MED" ? "OFFICE" : deliveryMethod;
  const sizeError = validateVariantSelection(asStringArray(page.availableSizes), selectedSize, "selectedSize");
  const colorError = validateVariantSelection(asStringArray(page.availableColors), selectedColor, "selectedColor");
  if (sizeError || colorError) {
    return { status: 422, body: { error: sizeError ?? colorError } } as const;
  }

  const [deliveryZone] = await db
    .select()
    .from(deliveryZonesTable)
    .where(and(
      eq(deliveryZonesTable.id, deliveryZoneId),
      eq(deliveryZonesTable.storeId, page.storeId),
      eq(deliveryZonesTable.isActive, true),
    ));

  if (!deliveryZone) {
    return { status: 422, body: { error: "الولاية غير متاحة للتوصيل حاليا" } } as const;
  }

  if (deliveryZone.officeFee === null || (effectiveDeliveryMethod === "HOME" && deliveryZone.homeFee === null)) {
    return { status: 422, body: { error: "طريقة التوصيل غير متاحة لهذه الولاية" } } as const;
  }

  const sourceWilaya = findWilayaByCode(deliveryZone.wilayaCode);
  const commune = findCommuneInWilaya(deliveryZone.wilayaCode, deliveryCommuneName);
  if (!sourceWilaya || !commune) {
    return { status: 422, body: { error: "البلدية لا تتبع الولاية المختارة" } } as const;
  }

  const [communeSetting] = await db
    .select()
    .from(deliveryCommuneSettingsTable)
    .where(and(
      eq(deliveryCommuneSettingsTable.storeId, page.storeId),
      eq(deliveryCommuneSettingsTable.wilayaCode, deliveryZone.wilayaCode),
      eq(deliveryCommuneSettingsTable.communeName, commune.name),
    ));
  if (communeSetting && !communeSetting.isActive) {
    return { status: 422, body: { error: "البلدية غير متاحة للتوصيل حاليا" } } as const;
  }

  const unitPrice = Number(page.price);
  const productTotal = unitPrice * quantity;
  const baseDeliveryFee = Number(deliveryZone.officeFee);
  const deliveryFee = effectiveDeliveryMethod === "HOME"
    ? baseDeliveryFee + Number(deliveryZone.homeFee)
    : baseDeliveryFee;
  const returnFee = Number(deliveryZone.returnFee);
  const productImageUrl = firstProductImage(page);
  const customerCity = sourceWilaya.name;

  let customerId: number | null = null;
  const [existing] = await db
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.storeId, page.storeId), eq(customersTable.phone, customerPhone)));

  if (existing) {
    customerId = existing.id;
    await db.update(customersTable)
      .set({ name: customerName, city: customerCity })
      .where(and(eq(customersTable.id, existing.id), eq(customersTable.storeId, page.storeId)));
  } else {
    const [newCust] = await db.insert(customersTable).values({
      storeId: page.storeId,
      name: customerName,
      phone: customerPhone,
      city: customerCity,
    }).returning();
    customerId = newCust.id;
  }

  const [order] = await db.insert(ordersTable).values({
    storeId: page.storeId,
    landingPageId: page.id,
    productImageUrl,
    customerId,
    customerName,
    customerPhone,
    customerCity,
    customerAddress,
    deliveryZoneId: deliveryZone.id,
    deliveryWilayaCode: deliveryZone.wilayaCode,
    deliveryWilayaName: sourceWilaya.name,
    deliveryCommuneName: commune.name,
    deliveryDairaName: commune.dairaName,
    deliveryMethod: effectiveDeliveryMethod,
    deliveryFee: String(deliveryFee),
    returnFee: String(returnFee),
    selectedSize,
    selectedColor,
    quantity,
    unitPrice: String(unitPrice),
    totalPrice: String(productTotal),
    notes,
    status: "NEW",
  }).returning();

  await logAudit({
    storeId: page.storeId,
    orderId: order.id,
    action: "ORDER_CREATED",
    toStatus: "NEW",
    note: `طلب جديد من ${customerName} عبر صفحة ${page.productName}`,
  });

  return {
    status: 201,
    body: {
      id: order.id,
      productName: page.productName,
      totalPrice: productTotal,
      deliveryFee,
      payableTotal: productTotal + deliveryFee,
      status: order.status,
    },
  } as const;
}

publicRouter.get("/s/:storeSlug", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const store = await findActiveStore(firstParam(req.params.storeSlug));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const categories = await db
    .select()
    .from(productCategoriesTable)
    .where(and(eq(productCategoriesTable.storeId, store.id), eq(productCategoriesTable.isActive, true)))
    .orderBy(productCategoriesTable.sortOrder, productCategoriesTable.id);

  const products = await db
    .select()
    .from(landingPagesTable)
    .where(and(eq(landingPagesTable.storeId, store.id), eq(landingPagesTable.isActive, true)))
    .orderBy(landingPagesTable.id);

  res.json({
    store: {
      id: store.id,
      slug: store.slug,
      name: store.name,
      ownerName: store.ownerName,
      phone: store.phone,
      city: store.city,
      logoUrl: store.logoUrl ?? null,
    },
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      isDefault: category.isDefault,
    })),
    products: products.map((product) => ({
      id: product.id,
      categoryId: product.categoryId ?? null,
      productName: product.productName,
      price: Number(product.price),
      description: product.description,
      slug: product.slug,
      imageUrl: product.imageUrl ?? null,
      productImages: asStringArray(product.productImages),
      availableSizes: asStringArray(product.availableSizes),
      availableColors: asStringArray(product.availableColors),
      themeColor: product.themeColor,
    })),
  });
});

publicRouter.get("/s/:storeSlug/p/:productSlug", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const store = await findActiveStore(firstParam(req.params.storeSlug));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  const page = await findActiveProduct(store.id, firstParam(req.params.productSlug));
  if (!page) {
    res.status(404).json({ error: "المنتج غير متاح" });
    return;
  }
  res.json(await landingPagePayload(page));
});

publicRouter.post("/s/:storeSlug/p/:productSlug/order", publicOrderLimiter, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const store = await findActiveStore(firstParam(req.params.storeSlug));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  const page = await findActiveProduct(store.id, firstParam(req.params.productSlug));
  if (!page) {
    res.status(404).json({ error: "المنتج غير متاح" });
    return;
  }
  const result = await createPublicOrder(page, req.body);
  res.status(result.status).json(result.body);
});

publicRouter.get("/p/:slug", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
  const pages = await findActiveLegacyProducts(slug);

  if (pages.length === 0) {
    res.status(404).json({ error: "الصفحة غير موجودة" });
    return;
  }
  if (pages.length > 1) {
    res.status(409).json({ error: "رابط المنتج يحتاج رابط المتجر" });
    return;
  }
  res.json(await landingPagePayload(pages[0]));
});

publicRouter.post("/p/:slug/order", publicOrderLimiter, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
  const pages = await findActiveLegacyProducts(slug);

  if (pages.length === 0) {
    res.status(404).json({ error: "المنتج غير متاح" });
    return;
  }
  if (pages.length > 1) {
    res.status(409).json({ error: "رابط المنتج يحتاج رابط المتجر" });
    return;
  }
  const result = await createPublicOrder(pages[0], req.body);
  res.status(result.status).json(result.body);
});

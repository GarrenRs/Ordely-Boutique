import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { and, db, deliveryZonesTable, eq, landingPagesTable, ordersTable, productCategoriesTable, storesTable } from "@workspace/db";
import { z } from "zod";
import { publicOrderLimiter, trackOrderLimiter } from "../middleware/rateLimiter.js";
import { createOrderCore } from "../lib/order-creation.js";
import { asStringArray } from "../lib/order-format.js";
import { findWilayaByCode } from "../lib/algeria-locations.js";
import {
  effectiveActiveStoreSql,
  productDataComplete,
  storeHasUsableDeliveryZone,
  usableDeliveryZonesForStore,
} from "../lib/readiness.js";

export const publicRouter = Router();

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

const TrackOrderStatusSchema = z.object({
  orderId: z.number().int().positive(),
  phone: z.string().trim().min(1).max(50),
});

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

async function findPubliclyLiveProduct(storeId: number, productSlug: string) {
  const slug = String(productSlug ?? "").trim();
  if (!slug) return null;
  if (!(await storeHasUsableDeliveryZone(storeId))) return null;
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

  const readyPages: LandingPageRow[] = [];
  for (const row of rows) {
    if (await storeHasUsableDeliveryZone(row.page.storeId)) readyPages.push(row.page);
  }
  return readyPages;
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
    deliveryZones: (await usableDeliveryZonesForStore(page.storeId)).map((zone) => formatPublicDeliveryZone(zone, new Set<string>())),
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

  const result = await createOrderCore(page, parsed.data, {
    requireAddressForHome: false,
    auditNote: `طلب جديد من ${parsed.data.customerName} عبر صفحة ${page.productName}`,
  });
  if (!result.ok) {
    return { status: result.status, body: result.body } as const;
  }

  return {
    status: 201,
    body: {
      id: result.order.id,
      productName: page.productName,
      totalPrice: Number(result.order.totalPrice),
      deliveryFee: result.deliveryFee,
      payableTotal: result.payableTotal,
      status: result.order.status,
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

  const storeReady = await storeHasUsableDeliveryZone(store.id);

  const products = (await db
    .select()
    .from(landingPagesTable)
    .where(and(eq(landingPagesTable.storeId, store.id), eq(landingPagesTable.isActive, true)))
    .orderBy(landingPagesTable.id))
    .filter((product) => storeReady && productDataComplete(product));

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
  const page = await findPubliclyLiveProduct(store.id, firstParam(req.params.productSlug));
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
  const page = await findPubliclyLiveProduct(store.id, firstParam(req.params.productSlug));
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

publicRouter.post("/orders/status", trackOrderLimiter, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const parsed = TrackOrderStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة", details: parsed.error.issues });
    return;
  }

  const [order] = await db
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      updatedAt: ordersTable.updatedAt,
      returnedAt: ordersTable.returnedAt,
      deliveredAt: ordersTable.deliveredAt,
    })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.id, parsed.data.orderId),
      eq(ordersTable.customerPhone, parsed.data.phone),
    ))
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  res.set("Cache-Control", "no-store");
  res.json({
    orderId: order.id,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    returnedAt: order.returnedAt,
    deliveredAt: order.deliveredAt,
  });
});

import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { and, db, eq, landingPagesTable, ne, ordersTable, productCategoriesTable, sql, storesTable } from "@workspace/db";
import {
  ListLandingPagesParams,
  CreateLandingPageParams,
  CreateLandingPageBody,
  GetLandingPageParams,
  UpdateLandingPageParams,
  UpdateLandingPageBody,
  DeleteLandingPageParams,
} from "@workspace/api-zod";
import { ensureDefaultCategory } from "../lib/ensureDefaultCategory.js";
import { productReadinessReasonWithContext, usableDeliveryZonesForStore } from "../lib/readiness.js";

export const landingPagesRouter = Router({ mergeParams: true });

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function resolveCategoryId(storeId: number, categoryId: number | null | undefined): Promise<number | null> {
  if (categoryId === null || categoryId === undefined) {
    return ensureDefaultCategory(storeId);
  }
  if (categoryId) {
    const [category] = await db
      .select({ id: productCategoriesTable.id })
      .from(productCategoriesTable)
      .where(and(eq(productCategoriesTable.id, categoryId), eq(productCategoriesTable.storeId, storeId)));
    if (category) return category.id;
  }
  return null;
}

function formatLandingPage(page: Record<string, unknown>, ordersCount = 0) {
  return {
    ...page,
    categoryId: page.categoryId ?? null,
    price: Number(page.price),
    imageUrl: page.imageUrl ?? null,
    productImages: asStringArray(page.productImages),
    availableSizes: asStringArray(page.availableSizes),
    availableColors: asStringArray(page.availableColors),
    deliveryInfo: page.deliveryInfo ?? null,
    whatsappNumber: page.whatsappNumber ?? null,
    ordersCount,
  };
}

type LandingPageRow = typeof landingPagesTable.$inferSelect;
type StoreRow = typeof storesTable.$inferSelect;

async function loadStoreReadiness(storeId: number) {
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  const usableZoneCount = (await usableDeliveryZonesForStore(storeId)).length;
  return { store: store ?? null, usableZoneCount };
}

async function withReadiness(
  base: ReturnType<typeof formatLandingPage>,
  page: LandingPageRow,
  store: StoreRow | null,
  usableZoneCount: number,
) {
  const reason = store ? await productReadinessReasonWithContext(store, usableZoneCount, page) : "store_inactive";
  return {
    ...base,
    publiclyLive: reason === null,
    readinessReason: reason,
  };
}

landingPagesRouter.get("/", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = ListLandingPagesParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid storeId" });
    return;
  }

  const pages = await db.select().from(landingPagesTable)
    .where(eq(landingPagesTable.storeId, params.data.storeId))
    .orderBy(landingPagesTable.id);

  const counts = await db
    .select({ landingPageId: ordersTable.landingPageId, count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(eq(ordersTable.storeId, params.data.storeId))
    .groupBy(ordersTable.landingPageId);

  const countMap = Object.fromEntries(counts.map(c => [c.landingPageId, c.count]));

  const { store, usableZoneCount } = await loadStoreReadiness(params.data.storeId);

  res.json(await Promise.all(
    pages.map(p => withReadiness(formatLandingPage(p as unknown as Record<string, unknown>, countMap[p.id] ?? 0), p, store, usableZoneCount)),
  ));
});

landingPagesRouter.post("/", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = CreateLandingPageParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
  });
  const body = CreateLandingPageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [existingSlug] = await db
    .select({ id: landingPagesTable.id })
    .from(landingPagesTable)
    .where(and(eq(landingPagesTable.storeId, params.data.storeId), eq(landingPagesTable.slug, body.data.slug)));
  if (existingSlug) {
    res.status(409).json({ error: "رابط الصفحة مستخدم لمنتج آخر داخل هذا المتجر" });
    return;
  }

  const categoryId = await resolveCategoryId(params.data.storeId, body.data.categoryId);
  if (!categoryId) {
    res.status(422).json({ error: "Category does not belong to this store" });
    return;
  }
  const [page] = await db.insert(landingPagesTable)
    .values({ ...body.data, categoryId, storeId: params.data.storeId, price: String(body.data.price) })
    .returning();
  res.status(201).json(formatLandingPage(page as unknown as Record<string, unknown>));
});

landingPagesRouter.get("/:pageId", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = GetLandingPageParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
    pageId: Number(req.params.pageId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const [page] = await db.select().from(landingPagesTable)
    .where(and(eq(landingPagesTable.id, params.data.pageId), eq(landingPagesTable.storeId, params.data.storeId)));
  if (!page) {
    res.status(404).json({ error: "Landing page not found" });
    return;
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(eq(ordersTable.landingPageId, page.id));

  const { store, usableZoneCount } = await loadStoreReadiness(page.storeId);

  res.json(await withReadiness(formatLandingPage(page as unknown as Record<string, unknown>, count ?? 0), page, store, usableZoneCount));
});

landingPagesRouter.patch("/:pageId", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = UpdateLandingPageParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
    pageId: Number(req.params.pageId),
  });
  const body = UpdateLandingPageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  if (body.data.slug) {
    const [existingSlug] = await db
      .select({ id: landingPagesTable.id })
      .from(landingPagesTable)
      .where(and(
        eq(landingPagesTable.storeId, params.data.storeId),
        eq(landingPagesTable.slug, body.data.slug),
        ne(landingPagesTable.id, params.data.pageId),
      ));
    if (existingSlug) {
      res.status(409).json({ error: "رابط الصفحة مستخدم لمنتج آخر داخل هذا المتجر" });
      return;
    }
  }

  const updateData: Record<string, unknown> = { ...body.data };
  if (body.data.price !== undefined) updateData.price = String(body.data.price);
  if ("categoryId" in body.data) {
    const categoryId = await resolveCategoryId(params.data.storeId, body.data.categoryId);
    if (!categoryId) {
      res.status(422).json({ error: "Category does not belong to this store" });
      return;
    }
    updateData.categoryId = categoryId;
  }
  const [page] = await db.update(landingPagesTable)
    .set(updateData)
    .where(and(eq(landingPagesTable.id, params.data.pageId), eq(landingPagesTable.storeId, params.data.storeId)))
    .returning();
  if (!page) {
    res.status(404).json({ error: "Landing page not found" });
    return;
  }
  res.json(formatLandingPage(page as unknown as Record<string, unknown>));
});

landingPagesRouter.delete("/:pageId", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = DeleteLandingPageParams.safeParse({
    storeId: Number((req.params as { storeId?: string }).storeId),
    pageId: Number(req.params.pageId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(and(eq(ordersTable.landingPageId, params.data.pageId), eq(ordersTable.storeId, params.data.storeId)));
  if (count > 0) {
    res.status(409).json({ error: "لا يمكن حذف صفحة عليها طلبات. أوقف الصفحة بدل حذفها." });
    return;
  }

  await db.delete(landingPagesTable)
    .where(and(eq(landingPagesTable.id, params.data.pageId), eq(landingPagesTable.storeId, params.data.storeId)));
  res.status(204).send();
});

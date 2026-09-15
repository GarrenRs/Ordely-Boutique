import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { db, eq, storesTable } from "@workspace/db";
import {
  UpdateStoreBody,
  UpdateStoreParams,
  GetStoreParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { storeDeliveryReady } from "../lib/readiness.js";
import { computeStoreLifecycle } from "../lib/storeLifecycle.js";

export const storesRouter = Router();

async function formatStore(store: typeof storesTable.$inferSelect) {
  const lifecycle = computeStoreLifecycle(store);
  return {
    ...store,
    logoUrl: store.logoUrl ?? null,
    deliveryReady: await storeDeliveryReady(store.id),
    storeStatus: lifecycle.status,
    daysLeft: lifecycle.daysLeft,
  };
}

storesRouter.get("/", requireAuth, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, req.session.storeId!));
  res.json(store ? [await formatStore(store)] : []);
});

storesRouter.get("/:storeId", requireAuth, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = GetStoreParams.safeParse({ storeId: Number(req.params.storeId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid storeId" });
    return;
  }
  if (params.data.storeId !== req.session.storeId) {
    res.status(403).json({ error: "ممنوع" });
    return;
  }
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, params.data.storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  res.json(await formatStore(store));
});

storesRouter.patch("/:storeId", requireAuth, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const params = UpdateStoreParams.safeParse({ storeId: Number(req.params.storeId) });
  const body = UpdateStoreBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (params.data.storeId !== req.session.storeId) {
    res.status(403).json({ error: "ممنوع" });
    return;
  }
  const [store] = await db
    .update(storesTable)
    .set(body.data)
    .where(eq(storesTable.id, params.data.storeId))
    .returning();
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  req.session.storeName = store.name;
  res.json(await formatStore(store));
});

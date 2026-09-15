import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { db, eq, storesTable } from "@workspace/db";
import {
  UpdateStoreBody,
  UpdateStoreParams,
  GetStoreParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/requireAuth.js";

export const storesRouter = Router();

storesRouter.get("/", requireAuth, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, req.session.storeId!));
  res.json(store ? [{ ...store, logoUrl: store.logoUrl ?? null }] : []);
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
  res.json({ ...store, logoUrl: store.logoUrl ?? null });
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
  res.json({ ...store, logoUrl: store.logoUrl ?? null });
});

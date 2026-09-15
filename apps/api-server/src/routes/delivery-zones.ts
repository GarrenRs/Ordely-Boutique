import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { and, db, deliveryCommuneSettingsTable, deliveryZonesTable, eq, inArray } from "@workspace/db";
import { z } from "zod";
import { ALGERIA_WILAYAS, findWilayaByCode } from "../lib/algeria-locations.js";

export const deliveryZonesRouter = Router({ mergeParams: true });

const UpdateDeliveryZoneSchema = z.object({
  isActive: z.boolean().optional(),
  homeFee: z.number().min(0).nullable().optional(),
  officeFee: z.number().min(0).nullable().optional(),
  returnFee: z.number().min(0).optional(),
});

const UpdateDeliveryCommunesSchema = z.object({
  communes: z.array(z.object({
    name: z.string().min(1),
    isActive: z.boolean(),
  })).min(1),
});

type ZoneRow = typeof deliveryZonesTable.$inferSelect;

function formatZoneFromSource(source: (typeof ALGERIA_WILAYAS)[number], row?: ZoneRow) {
  return {
    id: row?.id ?? null,
    wilayaCode: source.code,
    wilayaName: source.name,
    homeFee: row?.homeFee === null || row?.homeFee === undefined ? null : Number(row.homeFee),
    officeFee: row?.officeFee === null || row?.officeFee === undefined ? null : Number(row.officeFee),
    returnFee: row?.returnFee === undefined ? 0 : Number(row.returnFee),
    isActive: row?.isActive ?? false,
  };
}

function formatZone(row: ZoneRow) {
  const source = findWilayaByCode(row.wilayaCode);
  return formatZoneFromSource(source ?? { code: row.wilayaCode, name: row.wilayaName, communes: [] }, row);
}

async function communeSettingsMap(storeId: number, wilayaCode: string) {
  const rows = await db
    .select()
    .from(deliveryCommuneSettingsTable)
    .where(and(
      eq(deliveryCommuneSettingsTable.storeId, storeId),
      eq(deliveryCommuneSettingsTable.wilayaCode, wilayaCode),
    ));
  return new Map(rows.map((row) => [row.communeName, row]));
}

deliveryZonesRouter.get("/", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const storeId = Number((req.params as { storeId?: string }).storeId);
  if (!storeId) {
    res.status(400).json({ error: "Invalid storeId" });
    return;
  }

  const rows = await db
    .select()
    .from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.storeId, storeId));
  const rowByWilaya = new Map(rows.map((row) => [row.wilayaCode, row]));

  res.json(ALGERIA_WILAYAS.map((wilaya) => formatZoneFromSource(wilaya, rowByWilaya.get(wilaya.code))));
});

deliveryZonesRouter.get("/:wilayaCode/communes", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const storeId = Number((req.params as { storeId?: string }).storeId);
  const wilayaCode = String(req.params.wilayaCode ?? "").padStart(2, "0");
  const source = findWilayaByCode(wilayaCode);
  if (!storeId || !source) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const settings = await communeSettingsMap(storeId, wilayaCode);
  res.json(source.communes.map((commune) => ({
    id: commune.id,
    name: commune.name,
    dairaName: commune.dairaName,
    isActive: settings.get(commune.name)?.isActive ?? true,
  })));
});

deliveryZonesRouter.patch("/:wilayaCode/communes", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const storeId = Number((req.params as { storeId?: string }).storeId);
  const wilayaCode = String(req.params.wilayaCode ?? "").padStart(2, "0");
  const source = findWilayaByCode(wilayaCode);
  const body = UpdateDeliveryCommunesSchema.safeParse(req.body);
  if (!storeId || !source || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const sourceByName = new Map(source.communes.map((commune) => [commune.name, commune]));
  const invalid = body.data.communes.find((commune) => !sourceByName.has(commune.name));
  if (invalid) {
    res.status(422).json({ error: "البلدية لا تتبع الولاية المحددة" });
    return;
  }

  await Promise.all(body.data.communes.map((commune) => {
    const sourceCommune = sourceByName.get(commune.name)!;
    return db
      .insert(deliveryCommuneSettingsTable)
      .values({
        storeId,
        wilayaCode,
        communeName: sourceCommune.name,
        dairaName: sourceCommune.dairaName,
        isActive: commune.isActive,
      })
      .onConflictDoUpdate({
        target: [
          deliveryCommuneSettingsTable.storeId,
          deliveryCommuneSettingsTable.wilayaCode,
          deliveryCommuneSettingsTable.communeName,
        ],
        set: {
          dairaName: sourceCommune.dairaName,
          isActive: commune.isActive,
          updatedAt: new Date(),
        },
      });
  }));

  const changedNames = body.data.communes.map((commune) => commune.name);
  const rows = await db
    .select()
    .from(deliveryCommuneSettingsTable)
    .where(and(
      eq(deliveryCommuneSettingsTable.storeId, storeId),
      eq(deliveryCommuneSettingsTable.wilayaCode, wilayaCode),
      inArray(deliveryCommuneSettingsTable.communeName, changedNames),
    ));
  const settings = new Map(rows.map((row) => [row.communeName, row]));

  res.json(body.data.communes.map((commune) => {
    const sourceCommune = sourceByName.get(commune.name)!;
    return {
      id: sourceCommune.id,
      name: sourceCommune.name,
      dairaName: sourceCommune.dairaName,
      isActive: settings.get(sourceCommune.name)?.isActive ?? true,
    };
  }));
});

deliveryZonesRouter.patch("/:wilayaCode", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const storeId = Number((req.params as { storeId?: string }).storeId);
  const wilayaCode = String(req.params.wilayaCode ?? "").padStart(2, "0");
  const source = findWilayaByCode(wilayaCode);
  const body = UpdateDeliveryZoneSchema.safeParse(req.body);
  if (!storeId || !source || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [existing] = await db
    .select()
    .from(deliveryZonesTable)
    .where(and(eq(deliveryZonesTable.storeId, storeId), eq(deliveryZonesTable.wilayaCode, wilayaCode)));

  const mergedOfficeFee = "officeFee" in body.data
    ? body.data.officeFee
    : existing?.officeFee === null || existing?.officeFee === undefined
      ? null
      : Number(existing.officeFee);
  const mergedIsActive = body.data.isActive ?? existing?.isActive ?? false;

  if (mergedIsActive && mergedOfficeFee === null) {
    res.status(422).json({ error: "يجب ضبط سعر الولاية الأساسي قبل تفعيل الولاية" });
    return;
  }

  const values = {
    storeId,
    wilayaCode: source.code,
    wilayaName: source.name,
    homeFee: "homeFee" in body.data
      ? body.data.homeFee === null ? null : String(body.data.homeFee)
      : existing?.homeFee ?? null,
    officeFee: "officeFee" in body.data
      ? body.data.officeFee === null ? null : String(body.data.officeFee)
      : existing?.officeFee ?? null,
    returnFee: "returnFee" in body.data ? String(body.data.returnFee) : existing?.returnFee ?? "0",
    isActive: mergedIsActive,
  };

  if (existing) {
    const [zone] = await db
      .update(deliveryZonesTable)
      .set(values)
      .where(and(eq(deliveryZonesTable.storeId, storeId), eq(deliveryZonesTable.wilayaCode, wilayaCode)))
      .returning();
    res.json(formatZone(zone));
    return;
  }

  const [zone] = await db
    .insert(deliveryZonesTable)
    .values(values)
    .returning();
  res.status(201).json(formatZone(zone));
});

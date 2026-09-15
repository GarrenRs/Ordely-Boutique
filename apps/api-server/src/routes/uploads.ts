import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { logger } from "../lib/logger.js";

export const uploadsRouter = Router({ mergeParams: true });

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const ImageUploadSchema = z.object({
  fileName: z.string().min(1).max(180),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(1),
});

type StorageFetchResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

function getSupabaseStorageConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!url || !serviceRoleKey || !bucket) return null;

  return {
    url,
    serviceRoleKey,
    bucket,
    publicBaseUrl: (process.env.SUPABASE_STORAGE_PUBLIC_URL ?? `${url}/storage/v1/object/public/${bucket}`).replace(/\/+$/, ""),
  };
}

function decodeBase64Image(data: string): Buffer | null {
  const base64 = data.includes(",") ? data.split(",").at(-1) : data;
  if (!base64) return null;
  return Buffer.from(base64, "base64");
}

function createStoredImagePath(
  storeId: number,
  fileName: string,
  contentType: keyof typeof ALLOWED_TYPES,
  fallbackName: string,
  folder?: string,
) {
  const ext = ALLOWED_TYPES[contentType];
  const safeBase = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || fallbackName;
  const storedFileName = `${Date.now()}-${randomUUID()}-${safeBase}.${ext}`;
  const objectPath = folder
    ? `stores/${storeId}/${folder}/${storedFileName}`
    : `stores/${storeId}/${storedFileName}`;

  return { storedFileName, objectPath };
}

async function sendImageUploadResponse({
  res,
  buffer,
  contentType,
  objectPath,
  logMessage,
}: {
  res: AppResponse;
  buffer: Buffer;
  contentType: keyof typeof ALLOWED_TYPES;
  objectPath: string;
  logMessage: string;
}) {
  const storageConfig = getSupabaseStorageConfig();
  if (storageConfig) {
    try {
      const url = await uploadToSupabaseStorage(buffer, contentType, objectPath);
      res.status(201).json({ url });
    } catch (error) {
      logger.error({ err: error }, logMessage);
      res.status(502).json({ error: "تعذر رفع الصورة إلى التخزين" });
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    res.status(503).json({ error: "Image storage is not configured for production" });
    return;
  }

  const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
  const filePath = path.join(uploadRoot, ...objectPath.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  res.status(201).json({
    url: `/uploads/${objectPath}`,
  });
}

async function uploadToSupabaseStorage(
  buffer: Buffer,
  contentType: keyof typeof ALLOWED_TYPES,
  objectPath: string,
): Promise<string> {
  const config = getSupabaseStorageConfig();
  if (!config) {
    throw new Error("Supabase storage is not configured");
  }

  const response = await fetch(`${config.url}/storage/v1/object/${config.bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Cache-Control": "31536000",
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: new Uint8Array(buffer),
  }) as StorageFetchResponse;

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase storage upload failed: ${response.status} ${text}`);
  }

  return `${config.publicBaseUrl}/${objectPath}`;
}

uploadsRouter.post("/product-image", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const storeId = Number((req.params as { storeId?: string }).storeId);
  const parsed = ImageUploadSchema.safeParse(req.body);
  if (!storeId || !parsed.success) {
    res.status(400).json({ error: "Invalid image upload" });
    return;
  }

  const buffer = decodeBase64Image(parsed.data.data);
  if (!buffer || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: "Image size must be 5MB or less" });
    return;
  }

  const { objectPath } = createStoredImagePath(
    storeId,
    parsed.data.fileName,
    parsed.data.contentType,
    "product",
  );
  const fileName = path.basename(objectPath);

  const storageConfig = getSupabaseStorageConfig();
  if (storageConfig) {
    try {
      const url = await uploadToSupabaseStorage(buffer, parsed.data.contentType, objectPath);
      res.status(201).json({ url });
    } catch (error) {
      logger.error({ err: error }, "Product image storage upload failed");
      res.status(502).json({ error: "تعذر رفع الصورة إلى التخزين" });
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    res.status(503).json({ error: "Image storage is not configured for production" });
    return;
  }

  const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
  const storeDir = path.join(uploadRoot, "stores", String(storeId));
  await mkdir(storeDir, { recursive: true });
  const filePath = path.join(storeDir, fileName);
  await writeFile(filePath, buffer);
  res.status(201).json({
    url: `/uploads/stores/${storeId}/${fileName}`,
  });
});

uploadsRouter.post("/store-logo", async (req: AppRequest, res: AppResponse): Promise<void> => {
  const storeId = Number((req.params as { storeId?: string }).storeId);
  const parsed = ImageUploadSchema.safeParse(req.body);
  if (!storeId || !parsed.success) {
    res.status(400).json({ error: "Invalid image upload" });
    return;
  }

  const buffer = decodeBase64Image(parsed.data.data);
  if (!buffer || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: "Image size must be 5MB or less" });
    return;
  }

  const { objectPath } = createStoredImagePath(
    storeId,
    parsed.data.fileName,
    parsed.data.contentType,
    "store-logo",
    "logo",
  );

  await sendImageUploadResponse({
    res,
    buffer,
    contentType: parsed.data.contentType,
    objectPath,
    logMessage: "Store logo storage upload failed",
  });
});

import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import bcrypt from "bcryptjs";
import {
  and,
  count,
  db,
  desc,
  eq,
  gte,
  inArray,
  merchantLeadsTable,
  ordersTable,
  providerUsersTable,
  sql,
  storesTable,
  usersTable,
} from "@workspace/db";
import { requireProviderAuth } from "../middleware/requireAuth.js";
import { leadLimiter, loginLimiter } from "../middleware/rateLimiter.js";
import { hashMerchantPassword } from "../lib/password.js";
import { reseedShowcaseStore } from "../lib/showcaseSeed.js";
import { computeStoreLifecycle, computeRenewalExpiry, providerSubscriptionStatus } from "../lib/storeLifecycle.js";
import { effectiveActiveStoreSql } from "../lib/readiness.js";
import { z } from "zod";

export const providerRouter = Router();

const StoreSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const MerchantLeadSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(30),
  email: z.string().trim().email().max(160),
  storeName: z.string().trim().min(2).max(120),
  storeSlug: StoreSlugSchema.optional(),
  businessType: z.string().trim().min(2).max(120),
  wilaya: z.string().trim().min(1).max(120),
  sellingStatus: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(1000).optional(),
});

const MerchantLeadStatusSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "REJECTED", "CONVERTED"]),
});

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

function envProviderConfigured() {
  return Boolean(process.env.PROVIDER_EMAIL && (process.env.PROVIDER_PASSWORD_HASH || process.env.PROVIDER_PASSWORD));
}

async function verifyEnvProvider(email: string, password: string) {
  if (!envProviderConfigured()) return null;

  const providerEmail = normalizeEmail(process.env.PROVIDER_EMAIL);
  const providerName = String(process.env.PROVIDER_NAME ?? "Provider Admin").trim() || "Provider Admin";
  const providerId = Number(process.env.PROVIDER_ID ?? 1);
  if (email !== providerEmail) return false;

  const passwordHash = process.env.PROVIDER_PASSWORD_HASH;
  const valid = passwordHash
    ? await bcrypt.compare(password, passwordHash)
    : password === process.env.PROVIDER_PASSWORD;
  if (!valid) return false;

  return {
    id: Number.isFinite(providerId) && providerId > 0 ? providerId : 1,
    email: providerEmail,
    name: providerName,
  };
}

function slugBase(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function randomPassword() {
  return `merchant-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 8)}`;
}

const TRIAL_DAYS = 14;
const SUBSCRIPTION_PLAN_DAYS = [30, 180, 365] as const;

function addSubscriptionDays(days: number) {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + days);
  return expiresAt;
}

function parseSubscriptionDays(value: unknown) {
  const days = Number(value);
  return SUBSCRIPTION_PLAN_DAYS.includes(days as (typeof SUBSCRIPTION_PLAN_DAYS)[number]) ? days : null;
}

async function uniqueStoreSlug(preferred: string, fallback: string) {
  const base = slugBase(preferred) || slugBase(fallback) || "store";
  for (let index = 0; index < 100; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const [existing] = await db.select({ id: storesTable.id }).from(storesTable).where(eq(storesTable.slug, slug));
    if (!existing) return slug;
  }
  return `${base}-${Date.now()}`;
}

function formatStore(row: {
  store: typeof storesTable.$inferSelect;
  merchantEmail: string | null;
  ordersCount: number;
}) {
  const lifecycle = computeStoreLifecycle(row.store);
  return {
    id: row.store.id,
    name: row.store.name,
    slug: row.store.slug,
    ownerName: row.store.ownerName,
    phone: row.store.phone,
    city: row.store.city,
    logoUrl: row.store.logoUrl ?? null,
    isActive: row.store.isActive,
    subscriptionPlanDays: row.store.subscriptionPlanDays,
    subscriptionExpiresAt: row.store.subscriptionExpiresAt,
    subscriptionStatus: providerSubscriptionStatus(lifecycle),
    merchantEmail: row.merchantEmail,
    ordersCount: Number(row.ordersCount ?? 0),
    createdAt: row.store.createdAt,
  };
}

function formatMerchantLead(lead: typeof merchantLeadsTable.$inferSelect) {
  return {
    id: lead.id,
    fullName: lead.fullName,
    phone: lead.phone,
    email: lead.email,
    storeName: lead.storeName,
    storeSlug: lead.storeSlug ?? null,
    businessType: lead.businessType,
    wilaya: lead.wilaya,
    sellingStatus: lead.sellingStatus,
    notes: lead.notes ?? null,
    convertedStoreId: lead.convertedStoreId ?? null,
    status: lead.status,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

providerRouter.post("/auth/login", loginLimiter, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? "");
  if (!email || !password) {
    res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
    return;
  }

  const envProvider = await verifyEnvProvider(email, password);
  if (envProvider === false) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }
  if (envProvider) {
    req.session.providerUserId = envProvider.id;
    req.session.providerEmail = envProvider.email;
    req.session.providerName = envProvider.name;
    res.json({ user: envProvider });
    return;
  }

  const [provider] = await db
    .select()
    .from(providerUsersTable)
    .where(eq(providerUsersTable.email, email));
  if (!provider || !(await bcrypt.compare(password, provider.passwordHash))) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }

  req.session.providerUserId = provider.id;
  req.session.providerEmail = provider.email;
  req.session.providerName = provider.name;
  res.json({ user: { id: provider.id, email: provider.email, name: provider.name } });
});

providerRouter.post("/auth/logout", (req: AppRequest, res: AppResponse): void => {
  delete req.session.providerUserId;
  delete req.session.providerEmail;
  delete req.session.providerName;
  res.json({ ok: true });
});

providerRouter.get("/auth/me", (req: AppRequest, res: AppResponse): void => {
  res.set("Cache-Control", "no-store");
  if (!req.session?.providerUserId) {
    res.json({ user: null });
    return;
  }
  res.json({
    user: {
      id: req.session.providerUserId,
      email: req.session.providerEmail,
      name: req.session.providerName,
    },
  });
});

providerRouter.post("/leads", leadLimiter, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const parsed = MerchantLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات الطلب غير صحيحة", details: parsed.error.issues });
    return;
  }

  const activeStatuses = ["NEW", "CONTACTED", "QUALIFIED"] as const;
  const [byEmail] = await db
    .select({ id: merchantLeadsTable.id })
    .from(merchantLeadsTable)
    .where(and(
      eq(merchantLeadsTable.email, normalizeEmail(parsed.data.email)),
      inArray(merchantLeadsTable.status, activeStatuses),
    ))
    .limit(1);
  const [byPhone] = await db
    .select({ id: merchantLeadsTable.id })
    .from(merchantLeadsTable)
    .where(and(
      eq(merchantLeadsTable.phone, parsed.data.phone),
      inArray(merchantLeadsTable.status, activeStatuses),
    ))
    .limit(1);
  if (byEmail || byPhone) {
    res.status(409).json({ error: "تم استلام طلبك مسبقاً، سيتواصل معك فريقنا قريباً" });
    return;
  }

  const [lead] = await db.insert(merchantLeadsTable).values({
    ...parsed.data,
    notes: parsed.data.notes || null,
  }).returning();

  res.status(201).json({ lead: formatMerchantLead(lead) });
});

providerRouter.get("/leads", requireProviderAuth, async (_req: AppRequest, res: AppResponse): Promise<void> => {
  const leads = await db
    .select()
    .from(merchantLeadsTable)
    .orderBy(desc(merchantLeadsTable.createdAt));

  res.json(leads.map(formatMerchantLead));
});

providerRouter.patch("/leads/:leadId", requireProviderAuth, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const leadId = Number(req.params.leadId);
  const parsed = MerchantLeadStatusSchema.safeParse(req.body);
  if (!leadId || !parsed.success) {
    res.status(400).json({ error: "بيانات تحديث الطلب غير صحيحة" });
    return;
  }

  const [lead] = await db
    .update(merchantLeadsTable)
    .set({ status: parsed.data.status })
    .where(eq(merchantLeadsTable.id, leadId))
    .returning();

  if (!lead) {
    res.status(404).json({ error: "طلب التاجر غير موجود" });
    return;
  }

  res.json(formatMerchantLead(lead));
});

providerRouter.post("/leads/:leadId/convert", requireProviderAuth, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const leadId = Number(req.params.leadId);
  if (!leadId) {
    res.status(400).json({ error: "معرّف الطلب غير صحيح" });
    return;
  }

  const [lead] = await db.select().from(merchantLeadsTable).where(eq(merchantLeadsTable.id, leadId));
  if (!lead) {
    res.status(404).json({ error: "طلب التاجر غير موجود" });
    return;
  }
  if (lead.convertedStoreId || lead.status === "CONVERTED") {
    res.status(409).json({ error: "تم تحويل هذا الطلب إلى متجر من قبل" });
    return;
  }

  const merchantEmail = normalizeEmail(lead.email);
  const storeName = String(lead.storeName ?? "").trim();
  if (!merchantEmail || !storeName) {
    res.status(400).json({ error: "البريد الإلكتروني واسم المتجر مطلوبان قبل إنشاء المتجر" });
    return;
  }

  const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, merchantEmail));
  if (existingUser) {
    res.status(409).json({ error: "بريد التاجر مستخدم من قبل" });
    return;
  }

  const password = randomPassword();
  const slug = await uniqueStoreSlug(lead.storeSlug ?? storeName, merchantEmail);
  const passwordHash = await hashMerchantPassword(password);

  try {
    const result = await db.transaction(async (tx) => {
      const [store] = await tx.insert(storesTable).values({
        name: storeName,
        slug,
        ownerName: lead.fullName,
        phone: lead.phone,
        city: lead.wilaya,
        isActive: true,
        subscriptionPlanDays: TRIAL_DAYS,
        subscriptionExpiresAt: addSubscriptionDays(TRIAL_DAYS),
      }).returning();

      await tx.insert(usersTable).values({
        storeId: store.id,
        email: merchantEmail,
        passwordHash,
      });

      const [updatedLead] = await tx
        .update(merchantLeadsTable)
        .set({
          status: "CONVERTED",
          convertedStoreId: store.id,
        })
        .where(eq(merchantLeadsTable.id, lead.id))
        .returning();

      return { store, lead: updatedLead };
    });

    res.status(201).json({
      store: formatStore({ store: result.store, merchantEmail, ordersCount: 0 }),
      lead: formatMerchantLead(result.lead),
      merchantPassword: password,
    });
  } catch (error) {
    res.status(409).json({ error: "تعذر إنشاء المتجر. تحقق من البريد أو بيانات الطلب." });
  }
});

providerRouter.get("/summary", requireProviderAuth, async (_req: AppRequest, res: AppResponse): Promise<void> => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [[storesTotal], [storesActive], [todayOrders], [todayConfirmed], [todayReturned]] = await Promise.all([
    db.select({ value: count() }).from(storesTable),
    db.select({ value: count() }).from(storesTable).where(effectiveActiveStoreSql),
    db.select({ value: count() }).from(ordersTable).where(gte(ordersTable.createdAt, today)),
    db.select({ value: count() }).from(ordersTable).where(and(gte(ordersTable.createdAt, today), eq(ordersTable.status, "CONFIRMED"))),
    db.select({ value: count() }).from(ordersTable).where(and(gte(ordersTable.createdAt, today), eq(ordersTable.status, "RETURNED"))),
  ]);

  res.json({
    storesTotal: storesTotal?.value ?? 0,
    storesActive: storesActive?.value ?? 0,
    storesInactive: (storesTotal?.value ?? 0) - (storesActive?.value ?? 0),
    todayOrders: todayOrders?.value ?? 0,
    todayConfirmed: todayConfirmed?.value ?? 0,
    todayReturned: todayReturned?.value ?? 0,
  });
});

providerRouter.post("/showcase/reseed", requireProviderAuth, async (_req: AppRequest, res: AppResponse): Promise<void> => {
  const result = await reseedShowcaseStore();
  res.json(result);
});

providerRouter.get("/stores", requireProviderAuth, async (_req: AppRequest, res: AppResponse): Promise<void> => {
  const rows = await db
    .select({
      store: storesTable,
      merchantEmail: usersTable.email,
      ordersCount: sql<number>`count(${ordersTable.id})::int`,
    })
    .from(storesTable)
    .leftJoin(usersTable, eq(usersTable.storeId, storesTable.id))
    .leftJoin(ordersTable, eq(ordersTable.storeId, storesTable.id))
    .groupBy(storesTable.id, usersTable.email)
    .orderBy(desc(storesTable.createdAt));

  res.json(rows.map(formatStore));
});

providerRouter.post("/stores", requireProviderAuth, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const storeName = String(req.body?.storeName ?? "").trim();
  const ownerName = String(req.body?.ownerName ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const city = String(req.body?.city ?? "").trim();
  const merchantEmail = normalizeEmail(req.body?.merchantEmail);
  const requestedPassword = String(req.body?.merchantPassword ?? "").trim();
  const requestedSlug = String(req.body?.storeSlug ?? "").trim();

  if (!storeName || !ownerName || !phone || !city || !merchantEmail) {
    res.status(400).json({ error: "بيانات المتجر والتاجر مطلوبة" });
    return;
  }

  const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, merchantEmail));
  if (existingUser) {
    res.status(409).json({ error: "بريد التاجر مستخدم من قبل" });
    return;
  }

  const parsedSlug = requestedSlug ? StoreSlugSchema.safeParse(requestedSlug) : null;
  if (parsedSlug && !parsedSlug.success) {
    res.status(400).json({ error: "رابط المتجر يقبل أحرفًا إنجليزية صغيرة وأرقامًا وشرطات فقط" });
    return;
  }

  const password = requestedPassword.length >= 8 ? requestedPassword : randomPassword();
  const slug = await uniqueStoreSlug(parsedSlug?.data ?? storeName, merchantEmail);
  const passwordHash = await hashMerchantPassword(password);

  const [store] = await db.insert(storesTable).values({
    name: storeName,
    slug,
    ownerName,
    phone,
    city,
    isActive: true,
    subscriptionPlanDays: TRIAL_DAYS,
    subscriptionExpiresAt: addSubscriptionDays(TRIAL_DAYS),
  }).returning();

  await db.insert(usersTable).values({
    storeId: store.id,
    email: merchantEmail,
    passwordHash,
  });

  res.status(201).json({
    store: formatStore({ store, merchantEmail, ordersCount: 0 }),
    merchantPassword: password,
  });
});

providerRouter.patch("/stores/:storeId", requireProviderAuth, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const storeId = Number(req.params.storeId);
  if (!storeId) {
    res.status(400).json({ error: "معرّف المتجر غير صحيح" });
    return;
  }

  const [existingStore] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!existingStore) {
    res.status(404).json({ error: "المتجر غير موجود" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  for (const key of ["name", "ownerName", "phone", "city", "isActive"] as const) {
    if (key in req.body) updateData[key] = req.body[key];
  }
  if ("subscriptionDays" in req.body) {
    const subscriptionDays = parseSubscriptionDays(req.body.subscriptionDays);
    if (!subscriptionDays) {
      res.status(400).json({ error: "مدة الاشتراك غير صحيحة" });
      return;
    }
    updateData.subscriptionPlanDays = subscriptionDays;
    updateData.subscriptionExpiresAt = computeRenewalExpiry(existingStore, subscriptionDays);
    updateData.isActive = true;
  }
  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للتحديث" });
    return;
  }

  const [store] = await db.update(storesTable).set(updateData).where(eq(storesTable.id, storeId)).returning();
  if (!store) {
    res.status(404).json({ error: "المتجر غير موجود" });
    return;
  }

  const [merchant] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.storeId, store.id));
  const [{ ordersCount }] = await db.select({ ordersCount: count() }).from(ordersTable).where(eq(ordersTable.storeId, store.id));
  res.json(formatStore({ store, merchantEmail: merchant?.email ?? null, ordersCount }));
});

providerRouter.post("/stores/:storeId/reset-password", requireProviderAuth, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const storeId = Number(req.params.storeId);
  const password = String(req.body?.password ?? "").trim() || randomPassword();
  if (!storeId || password.length < 8) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" });
    return;
  }

  const [merchant] = await db.select().from(usersTable).where(eq(usersTable.storeId, storeId));
  if (!merchant) {
    res.status(404).json({ error: "حساب التاجر غير موجود" });
    return;
  }

  const passwordHash = await hashMerchantPassword(password);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, merchant.id));
  res.json({ merchantEmail: merchant.email, merchantPassword: password });
});

import { Router } from "express";
import type { AppRequest, AppResponse } from "../types/http.js";
import bcrypt from "bcryptjs";
import { db, eq, storesTable, usersTable } from "@workspace/db";
import { loginLimiter } from "../middleware/rateLimiter.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { hashMerchantPassword } from "../lib/password.js";
import { computeStoreLifecycle } from "../lib/storeLifecycle.js";

export const authRouter = Router();

authRouter.post("/login", loginLimiter, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
  if (!user) {
    res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    return;
  }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, user.storeId));
  if (!store) {
    res.status(403).json({ error: "المتجر غير موجود" });
    return;
  }

  if (!store.isActive) {
    res.status(403).json({ error: "المتجر موقوف مؤقتاً. تواصل معنا." });
    return;
  }

  req.session.userId = user.id;
  req.session.storeId = user.storeId;
  req.session.email = user.email;
  req.session.storeName = store.name;

  res.json({
    user: {
      id: user.id,
      email: user.email,
      storeId: user.storeId,
      storeName: store.name,
    },
  });
});

authRouter.post("/logout", (req: AppRequest, res: AppResponse): void => {
  req.session.destroy(() => {
    res.clearCookie("order_os.sid");
    res.json({ ok: true });
  });
});

authRouter.get("/me", async (req: AppRequest, res: AppResponse): Promise<void> => {
  res.set("Cache-Control", "no-store");
  if (!req.session?.userId) {
    res.json({ user: null });
    return;
  }
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, req.session.storeId!));
  const lifecycle = store ? computeStoreLifecycle(store) : null;
  res.json({
    user: {
      id: req.session.userId,
      email: req.session.email,
      storeId: req.session.storeId,
      storeName: req.session.storeName,
    },
    store: lifecycle
      ? {
          storeStatus: lifecycle.status,
          isActive: lifecycle.isActive,
          subscriptionExpiresAt: lifecycle.subscriptionExpiresAt,
          daysLeft: lifecycle.daysLeft,
        }
      : null,
  });
});

authRouter.patch("/password", requireAuth, async (req: AppRequest, res: AppResponse): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "يجب أن تكون كلمة المرور الجديدة 6 أحرف على الأقل" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
    return;
  }

  const hash = await hashMerchantPassword(newPassword);
  await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

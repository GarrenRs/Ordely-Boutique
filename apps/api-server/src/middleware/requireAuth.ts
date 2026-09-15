import type { AppNextFunction, AppRequest, AppResponse } from "../types/http.js";

export function requireAuth(req: AppRequest, res: AppResponse, next: AppNextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  next();
}

export function requireStoreAccess(req: AppRequest, res: AppResponse, next: AppNextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  const urlStoreId = Number(req.params.storeId);
  if (urlStoreId && urlStoreId !== req.session.storeId) {
    res.status(403).json({ error: "ممنوع" });
    return;
  }
  next();
}

export function requireProviderAuth(req: AppRequest, res: AppResponse, next: AppNextFunction): void {
  if (!req.session?.providerUserId) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  next();
}

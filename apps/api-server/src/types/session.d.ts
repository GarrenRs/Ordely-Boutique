import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    storeId?: number;
    email?: string;
    storeName?: string;
    providerUserId?: number;
    providerEmail?: string;
    providerName?: string;
  }
}

import type { storesTable } from "@workspace/db";

export const DAY_MS = 86_400_000;
export const EXPIRING_SOON_DAYS = 7;

export type StoreLifecycleStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "SUSPENDED";
export type ProviderSubscriptionStatus = "active" | "expiringSoon" | "expired" | "suspended" | "noSubscription";

type StoreRow = typeof storesTable.$inferSelect;
type StoreColumnsForLifecycle = Pick<StoreRow, "isActive" | "subscriptionExpiresAt">;
type ExpiryLike = Date | string | null;

export interface StoreLifecycle {
  status: StoreLifecycleStatus;
  daysLeft: number | null;
  subscriptionExpiresAt: Date | null;
  isActive: boolean;
  acceptsNewOrders: boolean;
}

function toDate(value: ExpiryLike): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value);
}

export function daysUntil(expiresAt: Date): number {
  return Math.ceil((expiresAt.getTime() - Date.now()) / DAY_MS);
}

export function computeStoreLifecycle(store: StoreColumnsForLifecycle): StoreLifecycle {
  const expiry = toDate(store.subscriptionExpiresAt);
  const isActive = store.isActive;

  if (!isActive) {
    return {
      status: "SUSPENDED",
      daysLeft: expiry !== null ? daysUntil(expiry) : null,
      subscriptionExpiresAt: expiry,
      isActive: false,
      acceptsNewOrders: false,
    };
  }

  if (expiry === null) {
    return {
      status: "ACTIVE",
      daysLeft: null,
      subscriptionExpiresAt: null,
      isActive: true,
      acceptsNewOrders: true,
    };
  }

  const daysLeft = daysUntil(expiry);
  if (expiry.getTime() <= Date.now()) {
    return {
      status: "EXPIRED",
      daysLeft,
      subscriptionExpiresAt: expiry,
      isActive: true,
      acceptsNewOrders: false,
    };
  }
  if (daysLeft <= EXPIRING_SOON_DAYS) {
    return {
      status: "EXPIRING_SOON",
      daysLeft,
      subscriptionExpiresAt: expiry,
      isActive: true,
      acceptsNewOrders: true,
    };
  }
  return {
    status: "ACTIVE",
    daysLeft,
    subscriptionExpiresAt: expiry,
    isActive: true,
    acceptsNewOrders: true,
  };
}

export function storeAcceptsNewOrders(store: StoreColumnsForLifecycle): boolean {
  return computeStoreLifecycle(store).acceptsNewOrders;
}

export function providerSubscriptionStatus(lifecycle: StoreLifecycle): ProviderSubscriptionStatus {
  if (lifecycle.status === "SUSPENDED") return "suspended";
  if (lifecycle.subscriptionExpiresAt === null) return "noSubscription";
  if (lifecycle.status === "EXPIRED") return "expired";
  if (lifecycle.status === "EXPIRING_SOON") return "expiringSoon";
  return "active";
}

export function addDaysFrom(relativeTo: ExpiryLike, days: number): Date {
  const base = toDate(relativeTo) ?? new Date();
  const result = new Date(base.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function computeRenewalExpiry(store: StoreColumnsForLifecycle, days: number): Date {
  const lifecycle = computeStoreLifecycle(store);
  if (lifecycle.status === "ACTIVE" || lifecycle.status === "EXPIRING_SOON") {
    return addDaysFrom(store.subscriptionExpiresAt, days);
  }
  return addDaysFrom(null, days);
}
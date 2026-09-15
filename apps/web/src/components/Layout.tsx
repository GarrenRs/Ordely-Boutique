import { useEffect, useState, type ElementType } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  MessageCircle,
  LayoutDashboard,
  ShoppingBag,
  FileText,
  Users,
  BarChart3,
  Truck,
  LogOut,
  Package,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getGetStoreQueryKey, getListOrdersQueryKey, useGetStore, useListOrders } from "@workspace/api-client-react";
import { useAuth, useStoreId } from "@/context/AuthContext";
import { formatCurrency } from "@/lib/currency";
import brandIcon from "@/assets/brand/icon.png";

type StoreWithSubscription = {
  subscriptionExpiresAt?: string | null;
  subscriptionPlanDays?: number | null;
  isActive?: boolean;
  storeStatus?: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "SUSPENDED";
  daysLeft?: number | null;
};

type MerchantSubscriptionInfo = {
  label: string;
  detail: string;
  expiresAtLabel: string;
  planLabel: string;
  tone: string;
  daysLeft: number | null;
  status: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "SUSPENDED";
};

const SUBSCRIPTION_WHATSAPP_URL = "https://wa.me/213549990984";
const SUBSCRIPTION_PHONE = "+213777826223";
const SUBSCRIPTION_PLANS: Array<{
  label: string;
  days: string;
  price: number;
  originalPrice?: number;
  saving?: string;
}> = [
  { label: "شهر", days: "30 يوم", price: 2500 },
  { label: "ستة أشهر", days: "180 يوم", price: 10500, originalPrice: 15000, saving: "توفير 30%" },
  { label: "سنة كاملة", days: "365 يوم", price: 21000, originalPrice: 30000, saving: "توفير 30%" },
];

const nav = [
  { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/orders", label: "الطلبات", icon: ShoppingBag },
  { href: "/landing-pages", label: "صفحات المنتجات", icon: FileText },
  { href: "/customers", label: "العملاء", icon: Users },
  { href: "/reports", label: "التقارير", icon: BarChart3 },
  { href: "/delivery", label: "نظام التوصيل", icon: Truck },
];

const ACTIVE_ORDER_STATUSES = ["NEW", "PENDING_CONFIRMATION", "CONFIRMED", "SHIPPED"] as const;

const ORDER_NOTIFICATION_CONFIG: Record<
  string,
  {
    title: string;
    tone: string;
    icon: ElementType;
    navTone: string;
  }
> = {
  NEW: {
    title: "طلب جديد",
    tone: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/60",
    icon: Package,
    navTone: "bg-blue-500 text-white",
  },
  PENDING_CONFIRMATION: {
    title: "بانتظار التأكيد",
    tone: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/60",
    icon: Clock,
    navTone: "bg-amber-500 text-slate-950",
  },
  CONFIRMED: {
    title: "مؤكد",
    tone: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/60",
    icon: CheckCircle2,
    navTone: "bg-emerald-500 text-white",
  },
  SHIPPED: {
    title: "تم الشحن",
    tone: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800/60",
    icon: Truck,
    navTone: "bg-violet-500 text-white",
  },
};

function isActiveOrderStatus(status: string) {
  return ACTIVE_ORDER_STATUSES.includes(status as (typeof ACTIVE_ORDER_STATUSES)[number]);
}

function formatNotificationTime(value: string) {
  return new Date(value).toLocaleString("ar-DZ-u-nu-latn", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readDismissedNewOrderIds(key: string) {
  if (typeof window === "undefined") return new Set<number>();
  try {
    const value = window.localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === "number") : []);
  } catch {
    return new Set<number>();
  }
}

function writeDismissedNewOrderIds(key: string, values: Set<number>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify([...values]));
}

function subscriptionPlanLabel(days?: number | null) {
  if (days === 14) return "الخطة المجانية";
  if (days === 30 || days === 180 || days === 365) return "خطة مدفوعة";
  return "الخطة غير محددة";
}

function merchantSubscriptionInfo(store?: StoreWithSubscription | null): MerchantSubscriptionInfo {
  if (!store?.subscriptionExpiresAt) {
    return {
      label: "مدة التشغيل غير محددة",
      detail: "تواصل معنا لضبط مدة الاشتراك",
      expiresAtLabel: "-",
      planLabel: subscriptionPlanLabel(store?.subscriptionPlanDays),
      tone: "bg-sidebar-accent text-sidebar-foreground/80 border-sidebar-border",
      daysLeft: null as number | null,
      status: store?.isActive === false ? "SUSPENDED" : "ACTIVE",
    };
  }

  const expiresAt = new Date(store.subscriptionExpiresAt);
  const expiresAtLabel = expiresAt.toLocaleDateString("ar-DZ-u-nu-latn", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const daysLeft = store.daysLeft ?? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
  const serverStatus = store.storeStatus;

  if (serverStatus === "SUSPENDED") {
    return {
      label: "المتجر موقوف مؤقتاً",
      detail: "تواصل معنا لإعادة التفعيل",
      expiresAtLabel,
      planLabel: subscriptionPlanLabel(store.subscriptionPlanDays),
      tone: "bg-slate-500/15 text-slate-200 border-slate-400/30",
      daysLeft,
      status: "SUSPENDED",
    };
  }

  if (serverStatus === "EXPIRED" || (serverStatus === undefined && daysLeft <= 0)) {
    return {
      label: "انتهى اشتراك المتجر",
      detail: `انتهى في ${expiresAtLabel}`,
      expiresAtLabel,
      planLabel: subscriptionPlanLabel(store.subscriptionPlanDays),
      tone: "bg-rose-500/12 text-rose-200 border-rose-400/30",
      daysLeft,
      status: "EXPIRED",
    };
  }

  if (serverStatus === "EXPIRING_SOON" || (serverStatus === undefined && daysLeft <= 7)) {
    return {
      label: `متبقي ${daysLeft} يوم`,
      detail: `ينتهي في ${expiresAtLabel}`,
      expiresAtLabel,
      planLabel: subscriptionPlanLabel(store.subscriptionPlanDays),
      tone: "bg-amber-500/15 text-amber-100 border-amber-400/40",
      daysLeft,
      status: "EXPIRING_SOON",
    };
  }

  return {
    label: `متبقي ${daysLeft} يوم`,
    detail: `ينتهي في ${expiresAtLabel}`,
    expiresAtLabel,
    planLabel: subscriptionPlanLabel(store.subscriptionPlanDays),
    tone: "bg-emerald-500/12 text-emerald-100 border-emerald-400/30",
    daysLeft,
    status: "ACTIVE",
  };
}

function formatPlanPrice(value: number) {
  return `${value.toLocaleString("ar-DZ-u-nu-latn")} دج`;
}

type SubscriptionBannerProps = {
  subscription: MerchantSubscriptionInfo;
  onRenew: () => void;
};

function SubscriptionBanner({ subscription, onRenew }: SubscriptionBannerProps) {
  if (subscription.status === "EXPIRED") {
    return (
      <div className="flex flex-col gap-3 border-b border-rose-300/30 bg-rose-600/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6" data-testid="subscription-expired-banner">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-rose-600/20 text-rose-600 dark:text-rose-300">
            <CalendarClock className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">انتهى اشتراك المتجر</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              انتهت مدة الاشتراك في {subscription.expiresAtLabel}، المتجر العام متوقف ولا يقبل طلبات جديدة. يمكنك متابعة إدارة الطلبات الحالية والعملاء والمنتجات.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRenew}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-rose-600 px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-rose-700"
        >
          <CalendarClock className="h-3.5 w-3.5" />
          تجديد الاشتراك
        </button>
      </div>
    );
  }

  if (subscription.status === "EXPIRING_SOON") {
    return (
      <div className="flex flex-col gap-3 border-b border-amber-300/30 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6" data-testid="subscription-expiring-banner">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-300">
            <CalendarClock className="h-4.5 w-4.5" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            تبقي {subscription.daysLeft} يوم على انتهاء الاشتراك — جدّد الآن لتجنب توقف المتجر.
          </p>
        </div>
        <button
          type="button"
          onClick={onRenew}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-amber-600 px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-amber-700"
        >
          <CalendarClock className="h-3.5 w-3.5" />
          تجديد الاشتراك
        </button>
      </div>
    );
  }

  return null;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const storeId = useStoreId();
  const dismissedNewOrdersKey = `ordely:dismissed-new-orders:${storeId}`;
  const [mobileNavCollapsed, setMobileNavCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [dismissedNewOrderIds, setDismissedNewOrderIds] = useState<Set<number>>(() =>
    readDismissedNewOrderIds(dismissedNewOrdersKey),
  );

  const { data: ordersData } = useListOrders(storeId, {
    query: { queryKey: getListOrdersQueryKey(storeId) },
  });
  const { data: storeData } = useGetStore(storeId, {
    query: { queryKey: getGetStoreQueryKey(storeId), enabled: Boolean(storeId) },
  });

  const orders = ordersData?.orders ?? [];
  const subscription = merchantSubscriptionInfo(storeData as StoreWithSubscription | undefined);
  const subscriptionWhatsAppUrl = `${SUBSCRIPTION_WHATSAPP_URL}?text=${encodeURIComponent(
    `السلام عليكم، أريد الاستفسار أو تجديد اشتراك متجر ${user?.storeName ?? ""}`,
  )}`;
  const activeOrders = orders
    .filter((order) => isActiveOrderStatus(order.status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const activeOrdersCount = activeOrders.length;
  const priorityStatus =
    ACTIVE_ORDER_STATUSES.find((status) => activeOrders.some((order) => order.status === status)) ?? "NEW";
  const ordersBadgeTone = ORDER_NOTIFICATION_CONFIG[priorityStatus]?.navTone ?? "bg-primary text-primary-foreground";
  const activeOrdersCountLabel = activeOrdersCount > 99 ? "99+" : String(activeOrdersCount);
  const newOrderNotifications = orders
    .filter((order) => order.status === "NEW" && !dismissedNewOrderIds.has(order.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const newOrderNotificationsCount = newOrderNotifications.length;
  const newOrderNotificationsCountLabel = newOrderNotificationsCount > 99 ? "99+" : String(newOrderNotificationsCount);
  const newOrderBadgeTone = ORDER_NOTIFICATION_CONFIG.NEW.navTone;

  useEffect(() => {
    setDismissedNewOrderIds(readDismissedNewOrderIds(dismissedNewOrdersKey));
  }, [dismissedNewOrdersKey]);

  const dismissNewOrderNotification = (orderId: number) => {
    setDismissedNewOrderIds((current) => {
      if (current.has(orderId)) return current;
      const next = new Set(current);
      next.add(orderId);
      writeDismissedNewOrderIds(dismissedNewOrdersKey, next);
      return next;
    });
  };

  useEffect(() => {
    const match = location.match(/^\/orders\/(\d+)$/);
    if (!match) return;
    const orderId = Number(match[1]);
    if (newOrderNotifications.some((order) => order.id === orderId)) {
      dismissNewOrderNotification(orderId);
    }
  }, [location, newOrderNotifications]);

  const openOrderNotification = (orderId: number) => {
    dismissNewOrderNotification(orderId);
    setNotificationsOpen(false);
    setLocation(`/orders/${orderId}`);
  };

  return (
    <div className="dashboard-shell flex h-screen overflow-hidden bg-background" dir="rtl">
      <aside
        className="dashboard-sidebar w-60 flex-shrink-0 bg-sidebar flex flex-col border-l border-sidebar-border"
        data-mobile-collapsed={mobileNavCollapsed ? "true" : "false"}
      >
        <div className="dashboard-sidebar-brand flex flex-col items-center gap-2.5 px-5 py-5 text-center border-b border-sidebar-border">
          <div className="dashboard-mobile-actions" aria-label="إجراءات الحساب">
            <button
              type="button"
              data-testid="mobile-nav-notifications"
              onClick={() => setNotificationsOpen(true)}
              className="dashboard-mobile-action dashboard-notification-trigger"
              aria-label="الإشعارات"
            >
              <Bell className="h-4 w-4" />
              {newOrderNotificationsCount > 0 && (
                <span className={cn("dashboard-notification-count", newOrderBadgeTone)}>{newOrderNotificationsCountLabel}</span>
              )}
            </button>
            <Link
              href="/settings"
              data-testid="mobile-nav-settings"
              className={cn(
                "dashboard-mobile-action",
                location.startsWith("/settings") && "dashboard-mobile-action-active"
              )}
              aria-label="الإعدادات"
            >
              <Settings className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={logout}
              className="dashboard-mobile-action"
              aria-label="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <div
            className={cn(
              "dashboard-sidebar-brand-icon flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black shadow-[0_0_18px_rgba(245,158,11,0.12)]",
              mobileNavCollapsed && "dashboard-sidebar-brand-icon-hidden"
            )}
          >
            <img src={brandIcon} alt="Ordely" className="h-10 w-10 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground leading-tight truncate">
              {user?.storeName ?? "نظام الطلبات"}
            </p>
            <p className="text-xs text-sidebar-foreground/50 leading-tight">Conversational OS</p>
          </div>
        </div>

        <nav className="dashboard-sidebar-nav flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                data-testid={`nav-${href.replace("/", "") || "dashboard"}`}
                className={cn(
                  "dashboard-nav-link flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
                aria-label={label}
              >
                <span className="dashboard-nav-icon-wrap">
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {href === "/orders" && activeOrdersCount > 0 && (
                    <span className={cn("dashboard-orders-nav-badge", ordersBadgeTone)}>{activeOrdersCountLabel}</span>
                  )}
                </span>
                <span className="dashboard-nav-label">{label}</span>
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          className="dashboard-mobile-toggle"
          onClick={() => setMobileNavCollapsed((value) => !value)}
          aria-label={mobileNavCollapsed ? "إظهار القائمة" : "إخفاء القائمة"}
        >
          {!mobileNavCollapsed && <ChevronUp className="dashboard-mobile-toggle-arrow" />}
          <span className="dashboard-mobile-toggle-icon">
            <img src={brandIcon} alt="" aria-hidden="true" />
          </span>
          {mobileNavCollapsed && <ChevronDown className="dashboard-mobile-toggle-arrow" />}
        </button>

        <div className="dashboard-sidebar-footer px-3 py-4 border-t border-sidebar-border">
          <div className="dashboard-sidebar-account">
            <div className="dashboard-sidebar-account-icon">
              <UserRound className="h-4 w-4" />
            </div>
            <div className="min-w-0 text-right">
              <p className="dashboard-sidebar-account-label">مساحة المتجر</p>
              <p className="dashboard-sidebar-account-name">{user?.storeName ?? "نظام الطلبات"}</p>
              <div className="dashboard-sidebar-account-meta" aria-label="معلومات عامة عن المتجر">
                <span className="dashboard-sidebar-account-chip">تاجر</span>
                <span className="dashboard-sidebar-account-chip">{storeData?.isActive === false ? "متوقف" : "نشط"}</span>
              </div>
            </div>
          </div>
          <div className={cn("mb-2 flex items-center gap-2 rounded-md border px-2 py-2 text-xs font-semibold", subscription.tone)}>
            <button
              type="button"
              onClick={() => setSubscriptionOpen(true)}
              className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md border border-current/20 bg-black/10 transition-colors hover:bg-black/20"
              aria-label="معاينة الاشتراك"
            >
              <CalendarClock className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSubscriptionOpen(true)}
              className="min-w-0 flex-1 text-right"
            >
              <span className="block truncate">{subscription.label}</span>
              <span className="mt-0.5 block truncate text-[10px] font-medium opacity-80">{subscription.planLabel}</span>
            </button>
          </div>
          <div className="dashboard-sidebar-footer-actions" aria-label="إجراءات الحساب">
            <button
              type="button"
              data-testid="nav-notifications"
              onClick={() => setNotificationsOpen(true)}
              className="dashboard-sidebar-footer-icon dashboard-notification-trigger"
              aria-label="الإشعارات"
              title="الإشعارات"
            >
              <Bell className="h-4 w-4" />
              {newOrderNotificationsCount > 0 && (
                <span className={cn("dashboard-notification-count", newOrderBadgeTone)}>{newOrderNotificationsCountLabel}</span>
              )}
            </button>
            <Link
              href="/settings"
              data-testid="nav-settings"
              className={cn(
                "dashboard-sidebar-footer-icon",
                location.startsWith("/settings") && "dashboard-sidebar-footer-icon-active"
              )}
              aria-label="الإعدادات"
              title="الإعدادات"
            >
              <Settings className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={logout}
              className="dashboard-sidebar-footer-icon dashboard-sidebar-footer-icon-danger"
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="dashboard-main flex-1 overflow-y-auto">
        <SubscriptionBanner subscription={subscription} onRenew={() => setSubscriptionOpen(true)} />
        {children}
      </main>

      {subscriptionOpen && (
        <div
          className="dashboard-modal-backdrop fixed inset-0 z-[72] flex items-center justify-center p-4"
          onClick={() => setSubscriptionOpen(false)}
        >
          <section
            className="dashboard-modal-panel w-full max-w-2xl rounded-lg border border-card-border bg-card shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-card-border px-5 py-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">اشتراك المتجر</p>
                <h2 id="subscription-title" className="mt-1 text-lg font-bold text-foreground">معاينة الاشتراك الحالي</h2>
                <p className="mt-1 text-sm text-muted-foreground">{subscription.detail}</p>
              </div>
              <button
                type="button"
                onClick={() => setSubscriptionOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="إغلاق نافذة الاشتراك"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-background/70 p-4">
                  <p className="text-xs font-semibold text-muted-foreground">الحالة الحالية</p>
                  <p className="mt-2 text-base font-bold text-foreground">{subscription.label}</p>
                  <p className="mt-1 text-xs font-semibold text-primary">{subscription.planLabel}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-4">
                  <p className="text-xs font-semibold text-muted-foreground">تاريخ الانتهاء</p>
                  <p className="mt-2 text-base font-bold text-foreground">{subscription.expiresAtLabel}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-4">
                  <p className="text-xs font-semibold text-muted-foreground">تشغيل المتجر العام</p>
                  <p className="mt-2 text-base font-bold text-foreground">
                    {(storeData as StoreWithSubscription | undefined)?.isActive ? "مفعّل" : "متوقف"}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <p className="mb-3 text-sm font-bold text-foreground">خطط التجديد اليدوي</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {SUBSCRIPTION_PLANS.map((plan) => (
                    <article
                      key={plan.label}
                      className="rounded-lg border border-card-border bg-background/80 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold text-foreground">{plan.label}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">{plan.days}</p>
                        </div>
                        {plan.saving && (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                            {plan.saving}
                          </span>
                        )}
                      </div>
                      <div className="mt-4">
                        <p className="text-2xl font-black text-foreground">{formatPlanPrice(plan.price)}</p>
                        {plan.originalPrice && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            السعر الأصلي <span className="line-through">{formatPlanPrice(plan.originalPrice)}</span>
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-primary/20 bg-primary/10 p-4">
                <p className="text-sm font-bold text-foreground">للتجديد أو الاستفسار</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  اختر الخطة المناسبة ثم تواصل معنا لتأكيد التجديد يدويًا.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <a
                    href={subscriptionWhatsAppUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#20bd5a]"
                  >
                    <MessageCircle className="h-4 w-4" />
                    تواصل عبر واتساب
                  </a>
                  <a
                    href={`tel:${SUBSCRIPTION_PHONE}`}
                    className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-bold text-foreground hover:bg-accent"
                    dir="ltr"
                  >
                    {SUBSCRIPTION_PHONE}
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {notificationsOpen && (
        <div
          className="dashboard-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={() => setNotificationsOpen(false)}
        >
          <section
            className="dashboard-modal-panel dashboard-notifications-panel w-full max-w-md rounded-lg border border-card-border bg-card shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notifications-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-card-border px-4 py-4">
              <div>
                <h2 id="notifications-title" className="text-base font-bold text-foreground">الإشعارات النشطة</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {newOrderNotificationsCount > 0 ? `${newOrderNotificationsCount} طلب جديد لم يفتح بعد` : "لا توجد طلبات جديدة غير مفتوحة الآن"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent"
                aria-label="إغلاق الإشعارات"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-3">
              {newOrderNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-10 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Bell className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">كل شيء هادئ الآن</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    تظهر هنا الطلبات الجديدة القادمة من صفحات المنتجات قبل فتحها.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {newOrderNotifications.map((order) => {
                    const config = ORDER_NOTIFICATION_CONFIG[order.status] ?? ORDER_NOTIFICATION_CONFIG.NEW;
                    const Icon = config.icon;
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => openOrderNotification(order.id)}
                        className="w-full rounded-lg border border-card-border bg-card px-3 py-3 text-right transition-colors hover:border-primary/40 hover:bg-accent/40"
                      >
                        <div className="flex items-start gap-3">
                          <span className={cn("grid h-10 w-10 flex-shrink-0 place-items-center rounded-md border", config.tone)}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="font-bold text-foreground">{config.title}</span>
                              <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-bold", config.tone)}>
                                #{order.id}
                              </span>
                            </span>
                            <span className="mt-1 block truncate text-sm text-foreground">
                              {order.customerName} · {order.landingPageName ?? "طلب"}
                            </span>
                            <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{formatCurrency(order.totalPrice)}</span>
                              <span>{formatNotificationTime(order.createdAt)}</span>
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

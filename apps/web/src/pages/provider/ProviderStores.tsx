import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Edit3, ExternalLink, Eye, EyeOff, Plus, Power, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProviderStore {
  id: number;
  name: string;
  slug: string;
  ownerName: string;
  phone: string;
  city: string;
  isActive: boolean;
  subscriptionPlanDays: number | null;
  subscriptionExpiresAt: string | null;
  merchantEmail: string | null;
  ordersCount: number;
  createdAt: string;
}

interface CreateStoreResponse {
  store: ProviderStore;
  merchantPassword: string;
}

const inputCls = "w-full h-9 bg-background border border-input rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right";
const headCell = "border border-border px-3 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap";
const bodyCell = "border border-border px-3 py-3.5 align-middle";
const storeLinkButton =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/15";
const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function publicStorePath(slug: string) {
  return `/s/${slug}`;
}

function normalizeStoreSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/g, "")
    .slice(0, 48);
}

const SUBSCRIPTION_PLANS = [
  { days: 30, label: "شهر", caption: "30 يوم" },
  { days: 180, label: "ستة أشهر", caption: "180 يوم" },
  { days: 365, label: "سنة كاملة", caption: "365 يوم" },
] as const;

function subscriptionPlanLabel(days: number | null) {
  if (days === 14) return "تجربة مجانية";
  if (days === 30 || days === 180 || days === 365) return "خطة مدفوعة";
  return "غير محدد";
}

function subscriptionInfo(store: ProviderStore) {
  if (!store.subscriptionExpiresAt) {
    return {
      label: "غير محدد",
      detail: "اضبط مدة التشغيل",
      planLabel: subscriptionPlanLabel(store.subscriptionPlanDays),
      tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
      expired: false,
      daysLeft: null as number | null,
    };
  }

  const expiresAt = new Date(store.subscriptionExpiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft <= 0) {
    return {
      label: "منتهي",
      detail: "المتجر العام متوقف",
      planLabel: subscriptionPlanLabel(store.subscriptionPlanDays),
      tone: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
      expired: true,
      daysLeft,
    };
  }

  if (daysLeft <= 7) {
    return {
      label: `${daysLeft} يوم`,
      detail: "قريب الانتهاء",
      planLabel: subscriptionPlanLabel(store.subscriptionPlanDays),
      tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
      expired: false,
      daysLeft,
    };
  }

  return {
    label: `${daysLeft} يوم`,
    detail: `ينتهي ${expiresAt.toLocaleDateString("ar-DZ-u-nu-latn")}`,
    planLabel: subscriptionPlanLabel(store.subscriptionPlanDays),
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    expired: false,
    daysLeft,
  };
}

export default function ProviderStores() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingStore, setEditingStore] = useState<ProviderStore | null>(null);
  const [createdPassword, setCreatedPassword] = useState("");
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [form, setForm] = useState({
    storeName: "",
    storeSlug: "",
    ownerName: "",
    phone: "",
    city: "الجزائر",
    merchantEmail: "",
    merchantPassword: "",
  });

  const queryKey = ["provider-stores"];
  const { data: stores = [], isLoading } = useQuery<ProviderStore[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch("/api/provider/stores", { credentials: "include" });
      if (!res.ok) throw new Error("تعذر تحميل المتاجر");
      return res.json();
    },
  });

  const createStore = useMutation({
    mutationFn: async () => {
      if (!form.storeSlug || form.storeSlug.length < 3 || !STORE_SLUG_PATTERN.test(form.storeSlug)) {
        throw new Error("رابط المتجر يقبل أحرفًا إنجليزية صغيرة وأرقامًا وشرطات فقط");
      }

      const res = await fetch("/api/provider/stores", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "تعذر إنشاء المتجر");
      }
      return res.json() as Promise<CreateStoreResponse>;
    },
    onSuccess: (data) => {
      qc.setQueryData<ProviderStore[]>(queryKey, (current = []) => [data.store, ...current]);
      setCreatedPassword(data.merchantPassword);
      setVisiblePassword(false);
      setForm({ storeName: "", storeSlug: "", ownerName: "", phone: "", city: "الجزائر", merchantEmail: "", merchantPassword: "" });
      toast({ title: "تم إنشاء المتجر" });
    },
    onError: (error) => {
      toast({ title: error instanceof Error ? error.message : "تعذر إنشاء المتجر", variant: "destructive" });
    },
  });

  const updateStore = useMutation({
    mutationFn: async ({ store, data }: { store: ProviderStore; data: { isActive?: boolean; subscriptionDays?: number } }) => {
      const res = await fetch(`/api/provider/stores/${store.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("تعذر تحديث المتجر");
      return res.json() as Promise<ProviderStore>;
    },
    onSuccess: (store) => {
      qc.setQueryData<ProviderStore[]>(queryKey, (current = []) =>
        current.map((item) => (item.id === store.id ? store : item)),
      );
      setEditingStore((current) => (current?.id === store.id ? store : current));
      toast({ title: "تم تحديث حالة المتجر" });
    },
    onError: (error) => {
      toast({ title: error instanceof Error ? error.message : "تعذر تحديث المتجر", variant: "destructive" });
    },
  });

  const resetPassword = useMutation({
    mutationFn: async (store: ProviderStore) => {
      const res = await fetch(`/api/provider/stores/${store.id}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("تعذر تغيير كلمة المرور");
      return res.json() as Promise<{ merchantEmail: string; merchantPassword: string }>;
    },
    onSuccess: (data) => {
      setCreatedPassword(data.merchantPassword);
      setVisiblePassword(false);
      toast({ title: `تم توليد كلمة مرور جديدة لـ ${data.merchantEmail}` });
    },
    onError: (error) => {
      toast({ title: error instanceof Error ? error.message : "تعذر تغيير كلمة المرور", variant: "destructive" });
    },
  });

  const visibleStores = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((store) =>
      store.name.toLowerCase().includes(q) ||
      store.ownerName.toLowerCase().includes(q) ||
      store.slug.toLowerCase().includes(q) ||
      (store.merchantEmail ?? "").toLowerCase().includes(q),
    );
  }, [search, stores]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">المتاجر</h1>
          <p className="text-sm text-muted-foreground mt-1">إنشاء وتتبع المتاجر والتجار فقط.</p>
        </div>
        <button
          onClick={() => setShowCreate((value) => !value)}
          className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          متجر جديد
        </button>
      </div>

      {createdPassword && (
        <div className="mb-5 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-300 mb-2">كلمة مرور التاجر الجاهزة للتسليم</p>
          <div className="flex items-center gap-2">
            <input
              value={visiblePassword ? createdPassword : "••••••••••••"}
              readOnly
              dir="ltr"
              className="flex-1 h-9 bg-background border border-input rounded-md px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => setVisiblePassword((value) => !value)}
              className="w-9 h-9 rounded-md border border-border flex items-center justify-center"
              aria-label={visiblePassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            >
              {visiblePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="bg-card border border-card-border rounded-lg p-5 mb-5">
          <div className="grid md:grid-cols-3 gap-3">
            <input className={inputCls} placeholder="اسم المتجر" value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} />
            <div>
              <input
                className={`${inputCls} text-left`}
                placeholder="رابط المتجر: miral-decorations"
                value={form.storeSlug}
                onChange={(event) => setForm({ ...form, storeSlug: normalizeStoreSlug(event.target.value) })}
                dir="ltr"
                maxLength={48}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">أحرف صغيرة وأرقام وشرطة فقط. سيظهر كـ /s/{form.storeSlug || "store-name"}</p>
            </div>
            <input className={inputCls} placeholder="اسم التاجر" value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} />
            <input className={inputCls} placeholder="الهاتف" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} dir="ltr" />
            <input className={inputCls} placeholder="الولاية / المدينة" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            <input className={inputCls} placeholder="بريد التاجر" value={form.merchantEmail} onChange={(event) => setForm({ ...form, merchantEmail: event.target.value })} dir="ltr" />
            <input className={inputCls} placeholder="كلمة مرور اختيارية" value={form.merchantPassword} onChange={(event) => setForm({ ...form, merchantPassword: event.target.value })} dir="ltr" />
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={() => createStore.mutate()}
              disabled={createStore.isPending}
              className="h-9 px-5 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {createStore.isPending ? "جاري الإنشاء..." : "إنشاء المتجر"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border border-card-border rounded-lg p-4 mb-5">
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full h-10 bg-background border border-input rounded-md pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
            placeholder="ابحث عن متجر أو تاجر"
          />
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, index) => <div key={index} className="h-14 bg-muted animate-pulse rounded-md" />)}
          </div>
        ) : visibleStores.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">لا توجد متاجر مطابقة.</div>
        ) : (
          <>
          <div className="hidden md:block">
            <table className="w-full table-fixed border-collapse border border-border text-sm">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[7%]" />
                <col className="w-[9%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className={headCell}>المتجر</th>
                  <th className={headCell}>التاجر</th>
                  <th className={headCell}>الحساب</th>
                  <th className={headCell}>طلبات</th>
                  <th className={headCell}>الحالة</th>
                  <th className={headCell}>الاشتراك</th>
                  <th className={headCell}>الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleStores.map((store) => {
                  const subscription = subscriptionInfo(store);
                  return (
                  <tr key={store.id} className="hover:bg-accent/40 transition-colors">
                    <td className={bodyCell}>
                      <p className="text-sm font-bold text-foreground truncate">{store.name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <a
                          href={publicStorePath(store.slug)}
                          target="_blank"
                          rel="noreferrer"
                          className={storeLinkButton}
                          aria-label={`فتح متجر ${store.name}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          فتح المتجر
                        </a>
                        <span className="text-[11px] text-muted-foreground truncate" dir="ltr">
                          /s/{store.slug}
                        </span>
                      </div>
                    </td>
                    <td className={bodyCell}>
                      <p className="text-sm font-semibold text-foreground truncate">{store.ownerName}</p>
                      <p className="text-xs text-muted-foreground truncate">{store.city} · {store.phone}</p>
                    </td>
                    <td className={`${bodyCell} text-muted-foreground`}>
                      <div className="truncate" dir="ltr">{store.merchantEmail ?? "-"}</div>
                    </td>
                    <td className={`${bodyCell} text-center text-sm font-semibold tabular-nums whitespace-nowrap`}>{store.ordersCount}</td>
                    <td className={bodyCell}>
                      <span className={`inline-flex h-7 px-3 rounded-full text-xs font-semibold items-center justify-center whitespace-nowrap ${store.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {store.isActive ? "نشط" : "متوقف"}
                      </span>
                    </td>
                    <td className={bodyCell}>
                      <span className={`inline-flex h-7 px-3 rounded-full text-xs font-semibold items-center justify-center whitespace-nowrap ${subscription.tone}`}>
                        {subscription.label}
                      </span>
                      <p className="mt-1 text-[11px] text-muted-foreground truncate">{subscription.planLabel} · {subscription.detail}</p>
                    </td>
                    <td className={bodyCell}>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          onClick={() => setEditingStore(store)}
                          className="h-8 w-8 rounded-md border border-border inline-flex items-center justify-center hover:bg-accent"
                          aria-label="تعديل المتجر"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => updateStore.mutate({ store, data: { isActive: !store.isActive } })}
                          disabled={updateStore.isPending}
                          className="h-8 min-w-[68px] px-3 rounded-md border border-border text-xs font-semibold hover:bg-accent disabled:opacity-50 whitespace-nowrap"
                        >
                          {store.isActive ? "إيقاف" : "تفعيل"}
                        </button>
                        <button
                          onClick={() => resetPassword.mutate(store)}
                          disabled={resetPassword.isPending}
                          className="h-8 min-w-[98px] px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
                        >
                          كلمة مرور
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 md:hidden">
            {visibleStores.map((store) => {
              const subscription = subscriptionInfo(store);
              return (
              <article key={store.id} className="rounded-lg border border-card-border bg-background/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{store.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <a
                        href={publicStorePath(store.slug)}
                        target="_blank"
                        rel="noreferrer"
                        className={storeLinkButton}
                        aria-label={`فتح متجر ${store.name}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        فتح المتجر
                      </a>
                      <span className="text-[11px] text-muted-foreground truncate" dir="ltr">
                        /s/{store.slug}
                      </span>
                    </div>
                  </div>
                  <span className={`inline-flex h-7 shrink-0 px-3 rounded-full text-xs font-semibold items-center justify-center whitespace-nowrap ${store.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                    {store.isActive ? "نشط" : "متوقف"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md bg-card/80 border border-border p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground">التاجر</p>
                    <p className="mt-1 font-semibold text-foreground truncate">{store.ownerName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">{store.city} · {store.phone}</p>
                  </div>
                  <div className="rounded-md bg-card/80 border border-border p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground">طلبات</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{store.ordersCount}</p>
                  </div>
                  <div className="col-span-2 rounded-md bg-card/80 border border-border p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground">الحساب</p>
                    <p className="mt-1 text-sm text-foreground truncate" dir="ltr">{store.merchantEmail ?? "-"}</p>
                  </div>
                  <div className="col-span-2 rounded-md bg-card/80 border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold text-muted-foreground">الاشتراك</p>
                      <span className={`inline-flex h-7 px-3 rounded-full text-xs font-semibold items-center justify-center whitespace-nowrap ${subscription.tone}`}>
                        {subscription.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{subscription.detail}</p>
                    <p className="mt-0.5 text-xs font-semibold text-primary">{subscription.planLabel}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setEditingStore(store)}
                    className="h-9 rounded-md border border-border text-xs font-semibold hover:bg-accent inline-flex items-center justify-center gap-1"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    تعديل
                  </button>
                  <button
                    onClick={() => updateStore.mutate({ store, data: { isActive: !store.isActive } })}
                    disabled={updateStore.isPending}
                    className="h-9 rounded-md border border-border text-xs font-semibold hover:bg-accent disabled:opacity-50"
                  >
                    {store.isActive ? "إيقاف" : "تفعيل"}
                  </button>
                  <button
                    onClick={() => resetPassword.mutate(store)}
                    disabled={resetPassword.isPending}
                    className="h-9 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
                  >
                    كلمة مرور
                  </button>
                </div>
              </article>
              );
            })}
          </div>
          </>
        )}
      </div>

      {editingStore && (
        <div
          className="dashboard-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4"
          onClick={() => setEditingStore(null)}
        >
          <section
            className="dashboard-modal-panel w-full max-w-lg rounded-lg border border-card-border bg-card shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-subscription-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-card-border px-5 py-4">
              <p className="text-xs font-semibold text-muted-foreground">إدارة المتجر</p>
              <h2 id="store-subscription-title" className="mt-1 text-lg font-bold text-foreground">{editingStore.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{editingStore.ownerName} · {editingStore.phone}</p>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Power className="h-3.5 w-3.5" />
                    الحالة
                  </div>
                  <p className="mt-2 text-sm font-bold text-foreground">{editingStore.isActive ? "نشط" : "متوقف"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    الاشتراك
                  </div>
                  <p className="mt-2 text-sm font-bold text-foreground">{subscriptionInfo(editingStore).label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{subscriptionInfo(editingStore).detail}</p>
                  <p className="mt-0.5 text-xs font-semibold text-primary">{subscriptionInfo(editingStore).planLabel}</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-bold text-foreground">تحديد مدة التشغيل</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {SUBSCRIPTION_PLANS.map((plan) => (
                    <button
                      key={plan.days}
                      type="button"
                      onClick={() => updateStore.mutate({ store: editingStore, data: { subscriptionDays: plan.days } })}
                      disabled={updateStore.isPending}
                      className="rounded-lg border border-border bg-background px-3 py-3 text-center transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50"
                    >
                      <span className="block text-sm font-bold text-foreground">{plan.label}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{plan.caption}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={() => setEditingStore(null)}
                  className="h-10 rounded-md border border-border px-4 text-sm font-semibold hover:bg-accent"
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  onClick={() => updateStore.mutate({ store: editingStore, data: { isActive: !editingStore.isActive } })}
                  disabled={updateStore.isPending}
                  className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {editingStore.isActive ? "إيقاف المتجر العام" : "تفعيل المتجر العام"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

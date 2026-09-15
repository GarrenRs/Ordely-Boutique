import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, Package, RefreshCcw, RotateCcw, Store, XCircle } from "lucide-react";

interface ProviderSummary {
  storesTotal: number;
  storesActive: number;
  storesInactive: number;
  todayOrders: number;
  todayConfirmed: number;
  todayReturned: number;
}

interface ShowcaseSeedResult {
  publicPath: string;
  products: number;
  categories: number;
  activeDeliveryZones: number;
  deliveryZones: number;
  orders: number;
  reseededAt: string;
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function ProviderDashboard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<ProviderSummary>({
    queryKey: ["provider-summary"],
    queryFn: async () => {
      const res = await fetch("/api/provider/summary", { credentials: "include" });
      if (!res.ok) throw new Error("تعذر تحميل الملخص");
      return res.json();
    },
  });

  const reseedShowcase = useMutation<ShowcaseSeedResult>({
    mutationFn: async () => {
      const res = await fetch("/api/provider/showcase/reseed", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "تعذر إعادة زراعة متجر العرض");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-summary"] });
    },
  });

  const today = new Date().toLocaleDateString("ar-DZ-u-nu-latn", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">نظرة عامة</h1>
        <p className="text-sm text-muted-foreground mt-1">{today}</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="bg-card border border-card-border rounded-lg p-5 h-20 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="إجمالي المتاجر" value={data.storesTotal} icon={Store} color="bg-primary/10 text-primary" />
          <StatCard label="متاجر نشطة" value={data.storesActive} icon={CheckCircle2} color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" />
          <StatCard label="متاجر متوقفة" value={data.storesInactive} icon={XCircle} color="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" />
          <StatCard label="طلبات اليوم" value={data.todayOrders} icon={Package} color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
          <StatCard label="مؤكدة اليوم" value={data.todayConfirmed} icon={CheckCircle2} color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
          <StatCard label="مسترجعة اليوم" value={data.todayReturned} icon={RotateCcw} color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
        </div>
      ) : null}

      <section className="mt-6 rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <RefreshCcw className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">أداة متجر العرض التجريبي</h2>
                <p className="mt-1 text-xs text-muted-foreground">إعادة بناء بيانات متجر المعاينة فقط بدون لمس المتاجر الحقيقية.</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-[11px] font-semibold text-muted-foreground">المتجر العام</p>
                <p className="mt-1 truncate text-sm font-bold text-foreground">/s/ordely-showcase</p>
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-[11px] font-semibold text-muted-foreground">المنتجات</p>
                <p className="mt-1 text-sm font-bold text-foreground tabular-nums">{reseedShowcase.data?.products ?? 8}</p>
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-[11px] font-semibold text-muted-foreground">الولايات المفعلة</p>
                <p className="mt-1 text-sm font-bold text-foreground tabular-nums">
                  {reseedShowcase.data ? `${reseedShowcase.data.activeDeliveryZones}/${reseedShowcase.data.deliveryZones}` : "26/58"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-[11px] font-semibold text-muted-foreground">الطلبات</p>
                <p className="mt-1 text-sm font-bold text-foreground tabular-nums">{reseedShowcase.data?.orders ?? 20}</p>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-6 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>هذه الأداة مخصصة للعرض واللقطات فقط. لا تحتوي على جدولة آلية ولا تقبل اختيار متجر آخر.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm("سيتم حذف وإعادة بناء بيانات متجر العرض فقط. هل تريد المتابعة؟");
                if (confirmed) reseedShowcase.mutate();
              }}
              disabled={reseedShowcase.isPending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${reseedShowcase.isPending ? "animate-spin" : ""}`} />
              {reseedShowcase.isPending ? "جاري إعادة الزراعة" : "إعادة زراعة المتجر"}
            </button>
            <a
              href="/s/ordely-showcase"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-bold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              <ExternalLink className="h-4 w-4" />
              فتح المتجر
            </a>
          </div>
        </div>

        {reseedShowcase.isError ? (
          <p className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
            {reseedShowcase.error.message}
          </p>
        ) : null}
        {reseedShowcase.isSuccess ? (
          <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            تمت إعادة زراعة متجر العرض بنجاح.
          </p>
        ) : null}
      </section>
    </div>
  );
}

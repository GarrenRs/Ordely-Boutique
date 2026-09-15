import { useStoreId } from "@/context/AuthContext";
import {
  getGetDailyReportQueryKey,
  getGetOrdersSummaryQueryKey,
  useGetDailyReport,
  useGetOrdersSummary,
} from "@workspace/api-client-react";
import { ShoppingBag, CheckCircle2, Truck, XCircle, Clock, Package } from "lucide-react";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/currency";


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

export default function Dashboard() {
  const STORE_ID = useStoreId();
  const { data: summary, isLoading: summaryLoading } = useGetOrdersSummary(STORE_ID, {
    query: { queryKey: getGetOrdersSummaryQueryKey(STORE_ID) },
  });
  const { data: report, isLoading: reportLoading } = useGetDailyReport(STORE_ID, {
    query: { queryKey: getGetDailyReportQueryKey(STORE_ID) },
  });

  const today = new Date().toLocaleDateString("ar-SA-u-nu-latn", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">لوحة التحكم</h1>
        <p className="text-sm text-muted-foreground mt-1">{today}</p>
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">اجمالي الطلبات</h2>
        {summaryLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-lg p-5 h-20 animate-pulse" />
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <StatCard label="اجمالي الطلبات" value={summary.total} icon={ShoppingBag} color="bg-primary/10 text-primary" />
            <StatCard label="طلبات جديدة" value={summary.new} icon={Package} color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
            <StatCard label="بانتظار التأكيد" value={summary.pendingConfirmation} icon={Clock} color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
            <StatCard label="مؤكدة" value={summary.confirmed} icon={CheckCircle2} color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" />
            <StatCard label="تم الشحن" value={summary.shipped} icon={Truck} color="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" />
            <StatCard label="تم التسليم" value={summary.delivered} icon={CheckCircle2} color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
            <StatCard label="مسترجعة" value={summary.returned} icon={Truck} color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
            <StatCard label="ملغية" value={summary.cancelled} icon={XCircle} color="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" />
            <StatCard label="مرفوضة" value={summary.rejected} icon={XCircle} color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" />
          </div>
        ) : null}
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border border-card-border rounded-lg p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">الايرادات (مسلمة)</p>
          {summaryLoading ? (
            <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          ) : (
            <p className="text-3xl font-bold text-foreground tabular-nums">
              {formatCurrency(summary?.totalRevenue ?? 0)}
            </p>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">تقرير اليوم</p>
            <Link href="/reports" className="text-xs text-primary hover:underline">عرض التفاصيل</Link>
          </div>
          {reportLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-4 bg-muted animate-pulse rounded" />)}
            </div>
          ) : report ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">اجمالي الطلبات</span>
                <span className="font-semibold tabular-nums">{report.totalOrders}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">مؤكدة</span>
                <span className="font-semibold tabular-nums text-emerald-600">{report.confirmed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">مسترجعة / ملغية / مرفوضة</span>
                <span className="font-semibold tabular-nums text-red-500">{report.returned + report.cancelled + report.rejected}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="text-muted-foreground">الايراد</span>
                <span className="font-bold tabular-nums">{formatCurrency(report.revenue)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">اجراءات سريعة</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Link
            href="/orders/confirmations"
            data-testid="quick-confirmations"
            className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-4 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors block"
          >
            <Clock className="w-5 h-5 text-amber-600 mb-2" />
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">التأكيدات المعلقة</p>
            <p className="text-xs text-amber-600/70 mt-0.5">{summary?.pendingConfirmation ?? 0} طلب</p>
          </Link>
          <Link
            href="/orders"
            data-testid="quick-orders"
            className="bg-card border border-card-border rounded-lg p-4 hover:bg-accent transition-colors block"
          >
            <ShoppingBag className="w-5 h-5 text-primary mb-2" />
            <p className="text-sm font-semibold text-foreground">عرض الطلبات</p>
            <p className="text-xs text-muted-foreground mt-0.5">ادارة كل الطلبات</p>
          </Link>
          <Link
            href="/landing-pages/new"
            data-testid="quick-new-page"
            className="bg-card border border-card-border rounded-lg p-4 hover:bg-accent transition-colors block"
          >
            <Package className="w-5 h-5 text-primary mb-2" />
            <p className="text-sm font-semibold text-foreground">صفحة منتج جديدة</p>
            <p className="text-xs text-muted-foreground mt-0.5">انشاء صفحة طلب</p>
          </Link>
        </div>
      </section>
    </div>
  );
}

import { useStoreId } from "@/context/AuthContext";
import {
  getGetDailyReportQueryKey,
  getGetWeeklyReportQueryKey,
  useGetDailyReport,
  useGetWeeklyReport,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/currency";


function StatRow({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass ?? ""}`}>{value}</span>
    </div>
  );
}

export default function Reports() {
  const STORE_ID = useStoreId();
  const { data: daily, isLoading: dailyLoading } = useGetDailyReport(STORE_ID, {
    query: { queryKey: getGetDailyReportQueryKey(STORE_ID) },
  });
  const { data: weekly, isLoading: weeklyLoading } = useGetWeeklyReport(STORE_ID, {
    query: { queryKey: getGetWeeklyReportQueryKey(STORE_ID) },
  });

  const chartData = (weekly ?? []).map(d => ({
    date: new Date(d.date).toLocaleDateString("ar-SA", { weekday: "short", day: "numeric" }),
    طلبات: d.totalOrders ?? 0,
    ايراد: d.revenue,
  }));

  const today = new Date().toLocaleDateString("ar-SA-u-nu-latn", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">التقارير</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Daily Report */}
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">تقرير اليوم</h2>
          {dailyLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-muted animate-pulse rounded" />)}
            </div>
          ) : daily ? (
            <>
              <StatRow label="اجمالي الطلبات" value={daily.totalOrders} />
              <StatRow label="طلبات جديدة" value={daily.newOrders} valueClass="text-blue-600" />
              <StatRow label="بانتظار التأكيد" value={daily.pendingConfirmation ?? 0} valueClass="text-amber-600" />
              <StatRow label="مؤكدة" value={daily.confirmed} valueClass="text-emerald-600" />
              <StatRow label="تم الشحن" value={daily.shipped} valueClass="text-violet-600" />
              <StatRow label="تم التسليم" value={daily.delivered} valueClass="text-green-600" />
              <StatRow label="مسترجعة" value={daily.returned} valueClass="text-orange-600" />
              <StatRow label="ملغية" value={daily.cancelled} valueClass="text-gray-500" />
              <StatRow label="مرفوضة" value={daily.rejected} valueClass="text-red-500" />
              <div className="mt-3 pt-3 border-t border-border flex justify-between">
                <span className="text-sm font-semibold text-foreground">الايراد</span>
                <span className="text-sm font-bold text-primary tabular-nums">{formatCurrency(daily.revenue)}</span>
              </div>
              <div className="py-2.5 border-b border-border flex justify-between">
                <span className="text-sm text-muted-foreground">تحصيل التوصيل</span>
                <span className="text-sm font-semibold text-primary tabular-nums">{formatCurrency(daily.deliveryRevenue ?? 0)}</span>
              </div>
              <div className="py-2.5 border-b border-border flex justify-between">
                <span className="text-sm text-muted-foreground">خسائر الاسترجاع</span>
                <span className="text-sm font-semibold text-red-500 tabular-nums">{formatCurrency(daily.returnLoss ?? 0)}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-border flex justify-between">
                <span className="text-sm font-semibold text-foreground">الصافي التشغيلي</span>
                <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(daily.netRevenue ?? daily.revenue)}</span>
              </div>
            </>
          ) : null}
        </div>

        {/* 7-day summary */}
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">اخر 7 ايام</h2>
          {weeklyLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-muted animate-pulse rounded" />)}
            </div>
          ) : weekly && weekly.length > 0 ? (
            <>
              <StatRow
                label="اجمالي الطلبات"
                value={weekly.reduce((s, d) => s + (d.totalOrders ?? 0), 0)}
              />
              <StatRow
                label="مؤكدة"
                value={weekly.reduce((s, d) => s + d.confirmed, 0)}
                valueClass="text-emerald-600"
              />
              <StatRow
                label="مسلمة"
                value={weekly.reduce((s, d) => s + d.delivered, 0)}
                valueClass="text-green-600"
              />
              <StatRow
                label="مسترجعة"
                value={weekly.reduce((s, d) => s + d.returned, 0)}
                valueClass="text-orange-600"
              />
              <StatRow
                label="ملغية + مرفوضة"
                value={weekly.reduce((s, d) => s + d.cancelled + d.rejected, 0)}
                valueClass="text-red-500"
              />
              <div className="mt-3 pt-3 border-t border-border flex justify-between">
                <span className="text-sm font-semibold text-foreground">اجمالي الايراد</span>
                <span className="text-sm font-bold text-primary tabular-nums">
                  {formatCurrency(weekly.reduce((s, d) => s + d.revenue, 0))}
                </span>
              </div>
              <div className="py-2.5 border-b border-border flex justify-between">
                <span className="text-sm text-muted-foreground">خسائر الاسترجاع</span>
                <span className="text-sm font-semibold text-red-500 tabular-nums">
                  {formatCurrency(weekly.reduce((s, d) => s + (d.returnLoss ?? 0), 0))}
                </span>
              </div>
              <div className="mt-3 pt-3 border-t border-border flex justify-between">
                <span className="text-sm font-semibold text-foreground">الصافي التشغيلي</span>
                <span className="text-sm font-bold text-foreground tabular-nums">
                  {formatCurrency(weekly.reduce((s, d) => s + (d.netRevenue ?? d.revenue), 0))}
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد بيانات</p>
          )}
        </div>
      </div>

      {/* Weekly Chart */}
      <div className="bg-card border border-card-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-5">حجم الطلبات - اخر 7 ايام</h2>
        {weeklyLoading ? (
          <div className="h-48 bg-muted animate-pulse rounded" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "hsl(var(--foreground))",
                }}
              />
              <Bar dataKey="طلبات" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

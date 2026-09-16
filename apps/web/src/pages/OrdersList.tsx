import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Calendar, Plus, Search } from "lucide-react";
import { getListOrdersQueryKey, useListOrders } from "@workspace/api-client-react";
import { useStoreId } from "@/context/AuthContext";
import StatusBadge from "@/components/StatusBadge";
import ProductImageThumb from "@/components/ProductImageThumb";
import { formatCurrency } from "@/lib/currency";
import OrdersConfirmationsPanel from "@/pages/OrdersConfirmationsPanel";

const STATUS_OPTIONS = [
  { value: "", label: "الكل" },
  { value: "NEW", label: "جديد" },
  { value: "PENDING_CONFIRMATION", label: "بانتظار التأكيد" },
  { value: "CONFIRMED", label: "مؤكد" },
  { value: "SHIPPED", label: "تم الشحن" },
  { value: "DELIVERED", label: "تم التسليم" },
  { value: "RETURNED", label: "مسترجع" },
  { value: "CANCELLED", label: "ملغي" },
  { value: "REJECTED", label: "مرفوض" },
];

const DATE_OPTIONS = [
  { value: "", label: "كل الأوقات" },
  { value: "today", label: "اليوم" },
  { value: "yesterday", label: "أمس" },
  { value: "week", label: "آخر 7 أيام" },
];

const headCell = "border border-border px-3 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap";
const bodyCell = "border border-border px-3 py-3 align-middle";

function matchesDate(createdAt: string, filter: string) {
  if (!filter) return true;
  const d = new Date(createdAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  if (filter === "today") return d >= today;
  if (filter === "yesterday") return d >= yesterday && d < today;
  if (filter === "week") return d >= weekAgo;
  return true;
}

export default function OrdersList({ initialView = "orders" }: { initialView?: "orders" | "confirmations" }) {
  const storeId = useStoreId();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<"orders" | "confirmations">(initialView);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useListOrders(storeId, {
    query: { queryKey: getListOrdersQueryKey(storeId) },
  });

  const orders = data?.orders ?? [];
  const filtered = orders.filter((order) => {
    const q = search.trim().toLowerCase();
    const matchStatus = !statusFilter || order.status === statusFilter;
    const matchSearch = !q || order.customerName.toLowerCase().includes(q) || order.customerPhone.includes(q);
    return matchStatus && matchSearch && matchesDate(order.createdAt, dateFilter);
  });

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">الطلبات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length !== (data?.total ?? 0)
              ? `${filtered.length} من ${data?.total ?? 0} طلب`
              : `${data?.total ?? 0} طلب`}
          </p>
        </div>
        <Link
          href="/orders/new"
          data-testid="btn-new-order"
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          طلب جديد
        </Link>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg border border-card-border bg-card p-1.5">
        <button
          type="button"
          onClick={() => setView("orders")}
          className={`h-9 rounded-md text-sm font-semibold transition-colors ${
            view === "orders"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          كل الطلبات
        </button>
        <button
          type="button"
          onClick={() => setView("confirmations")}
          className={`h-9 rounded-md text-sm font-semibold transition-colors ${
            view === "confirmations"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          بانتظار التأكيد
        </button>
      </div>

      {view === "confirmations" ? (
        <OrdersConfirmationsPanel />
      ) : (
        <>
      <div className="space-y-3 mb-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              data-testid="input-search"
              type="search"
              placeholder="بحث بالاسم أو الهاتف..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full h-9 bg-card border border-input rounded-md pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="h-9 bg-card border border-input rounded-md pr-9 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right appearance-none cursor-pointer min-w-[130px]"
            >
              {DATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              data-testid={`filter-${option.value || "all"}`}
              onClick={() => setStatusFilter(option.value)}
              className={`px-3 h-8 rounded-md text-xs font-medium border transition-colors ${
                statusFilter === option.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-card border border-card-border rounded-lg divide-y divide-border">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 h-4 bg-muted animate-pulse rounded" />
              <div className="w-24 h-4 bg-muted animate-pulse rounded" />
              <div className="w-16 h-6 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-lg">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Search className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">لا توجد طلبات</p>
          <p className="text-xs text-muted-foreground mt-1">جرب تغيير الفلتر أو البحث</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-card border border-card-border rounded-lg overflow-hidden">
            <table className="w-full table-fixed border-collapse border border-border text-sm">
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[21%]" />
                <col className="w-[25%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[13%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className={headCell}>#</th>
                  <th className={headCell}>العميل</th>
                  <th className={headCell}>المنتج</th>
                  <th className={headCell}>الولاية</th>
                  <th className={headCell}>المبلغ</th>
                  <th className={headCell}>الحالة</th>
                  <th className={headCell}>التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((order) => (
                  <tr
                    key={order.id}
                    data-testid={`row-order-${order.id}`}
                    className="hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/orders/${order.id}`)}
                  >
                    <td className={`${bodyCell} text-muted-foreground font-mono text-xs whitespace-nowrap`}>#{order.id}</td>
                    <td className={bodyCell}>
                      <p className="font-medium text-foreground truncate">{order.customerName}</p>
                      <p className="text-xs text-muted-foreground truncate" dir="ltr">{order.customerPhone}</p>
                    </td>
                    <td className={bodyCell}>
                      <div className="flex items-center gap-2 min-w-0">
                        <ProductImageThumb src={order.productImageUrl} alt={order.landingPageName} className="h-11 w-11" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{order.landingPageName ?? "-"}</p>
                          {(order.selectedSize || order.selectedColor) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {[order.selectedSize, order.selectedColor].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`${bodyCell} text-muted-foreground`}>
                      <div className="truncate">{order.customerCity}</div>
                    </td>
                    <td className={`${bodyCell} font-semibold tabular-nums whitespace-nowrap`}>{formatCurrency(order.totalPrice)}</td>
                    <td className={bodyCell}><StatusBadge status={order.status} /></td>
                    <td className={`${bodyCell} text-xs text-muted-foreground whitespace-nowrap`}>
                      {new Date(order.createdAt).toLocaleDateString("ar-DZ-u-nu-latn")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {filtered.map((order) => (
              <div
                key={order.id}
                data-testid={`card-order-${order.id}`}
                onClick={() => setLocation(`/orders/${order.id}`)}
                className="bg-card border border-card-border rounded-lg p-4 cursor-pointer active:bg-accent/50"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{order.customerName}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{order.customerPhone}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <div className="flex items-center gap-3">
                  <ProductImageThumb src={order.productImageUrl} alt={order.landingPageName} className="h-14 w-14" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground truncate">{order.landingPageName ?? "-"}</p>
                    <p className="text-xs text-muted-foreground truncate">{order.customerCity} · #{order.id}</p>
                  </div>
                  <span className="font-bold tabular-nums text-foreground whitespace-nowrap">{formatCurrency(order.totalPrice)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
        </>
      )}
    </div>
  );
}

import { useState } from "react";
import { useLocation } from "wouter";
import { Search, Users } from "lucide-react";
import { getListCustomersQueryKey, useListCustomers } from "@workspace/api-client-react";
import { useStoreId } from "@/context/AuthContext";
import { formatCurrency } from "@/lib/currency";

const headCell = "border border-border px-4 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap";
const bodyCell = "border border-border px-4 py-3.5 align-middle";

export default function CustomersList() {
  const storeId = useStoreId();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const { data: customers, isLoading } = useListCustomers(storeId, {
    query: { queryKey: getListCustomersQueryKey(storeId) },
  });

  const filtered = (customers ?? []).filter((customer) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      customer.name.toLowerCase().includes(q) ||
      customer.phone.includes(q) ||
      customer.city.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-foreground">العملاء</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{customers?.length ?? 0} عميل</p>
        </div>
      </div>

      <div className="relative mb-5 max-w-sm">
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

      {isLoading ? (
        <div className="bg-card border border-card-border rounded-lg divide-y divide-border">
          {[...Array(5)].map((_, index) => (
            <div key={index} className="flex items-center gap-4 px-5 py-4">
              <div className="w-9 h-9 rounded-full bg-muted animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 bg-muted animate-pulse rounded" />
                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-lg">
          <Users className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">لا يوجد عملاء</p>
          <p className="text-xs text-muted-foreground mt-1">ستظهر بيانات العملاء عند استقبال الطلبات</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-card border border-card-border rounded-lg overflow-hidden">
            <div>
              <table className="w-full table-fixed border-collapse border border-border text-sm">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                  <col className="w-[14%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className={headCell}>العميل</th>
                    <th className={headCell}>الهاتف</th>
                    <th className={headCell}>الولاية</th>
                    <th className={headCell}>عدد الطلبات</th>
                    <th className={headCell}>إجمالي الإنفاق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((customer) => (
                    <tr
                      key={customer.id}
                      data-testid={`row-customer-${customer.id}`}
                      className="hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => setLocation(`/customers/${customer.id}`)}
                    >
                      <td className={bodyCell}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary">{customer.name[0]}</span>
                          </div>
                          <span className="font-medium text-foreground truncate">{customer.name}</span>
                        </div>
                      </td>
                      <td className={`${bodyCell} text-muted-foreground truncate`} dir="ltr">{customer.phone}</td>
                      <td className={`${bodyCell} text-muted-foreground`}>
                        <div className="truncate">{customer.city}</div>
                      </td>
                      <td className={`${bodyCell} tabular-nums whitespace-nowrap`}>{customer.ordersCount}</td>
                      <td className={`${bodyCell} font-semibold tabular-nums whitespace-nowrap`}>{formatCurrency(customer.totalSpent ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-2">
            {filtered.map((customer) => (
              <div
                key={customer.id}
                data-testid={`card-customer-${customer.id}`}
                onClick={() => setLocation(`/customers/${customer.id}`)}
                className="bg-card border border-card-border rounded-lg p-4 cursor-pointer active:bg-accent/50 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">{customer.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{customer.name}</p>
                  <p className="text-xs text-muted-foreground truncate" dir="ltr">{customer.phone} · {customer.city}</p>
                </div>
                <div className="text-left flex-shrink-0">
                  <p className="font-bold tabular-nums text-foreground text-sm">{formatCurrency(customer.totalSpent ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">{customer.ordersCount} طلب</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

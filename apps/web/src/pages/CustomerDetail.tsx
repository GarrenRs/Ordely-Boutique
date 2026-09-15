import { useStoreId } from "@/context/AuthContext";
import { useParams } from "wouter";
import {
  useGetCustomer,
  getGetCustomerQueryKey,
  useUpdateCustomer,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Phone, MapPin, ShoppingBag } from "lucide-react";
import { Link } from "wouter";
import StatusBadge from "@/components/StatusBadge";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import ProductImageThumb from "@/components/ProductImageThumb";


export default function CustomerDetail() {
  const STORE_ID = useStoreId();
  const { customerId } = useParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);

  const { data: customer, isLoading } = useGetCustomer(STORE_ID, Number(customerId), {
    query: { queryKey: getGetCustomerQueryKey(STORE_ID, Number(customerId)) },
  });

  useEffect(() => {
    if (customer) setNotes(customer.notes ?? "");
  }, [customer]);

  const updateCustomer = useUpdateCustomer({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCustomerQueryKey(STORE_ID, Number(customerId)) });
        toast({ title: "تم حفظ الملاحظات" });
        setEditingNotes(false);
      },
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="h-6 w-48 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-card border border-card-border rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">العميل غير موجود</p>
        <Link href="/customers" className="text-primary text-sm hover:underline mt-2 inline-block">العودة للعملاء</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
        <Link href="/customers" className="hover:text-foreground transition-colors">العملاء</Link>
        <ChevronRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">{customer.name}</span>
      </div>

      <div className="bg-card border border-card-border rounded-lg p-5 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-primary">{customer.name[0]}</span>
          </div>
          <div>
            <p className="font-bold text-foreground text-lg">{customer.name}</p>
            <p className="text-sm text-muted-foreground">{customer.city}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="w-3.5 h-3.5" />
            <span dir="ltr">{customer.phone}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            <span>{customer.city}</span>
          </div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{customer.ordersCount} طلب</span>
          </div>
          <div>
            <span className="font-semibold tabular-nums">{formatCurrency(customer.totalSpent ?? 0)}</span>
            <span className="text-muted-foreground text-xs mr-1">اجمالي الانفاق</span>
          </div>
        </div>

        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground">ملاحظات</p>
            {!editingNotes && (
              <button
                data-testid="btn-edit-notes"
                onClick={() => setEditingNotes(true)}
                className="text-xs text-primary hover:underline"
              >
                تعديل
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                data-testid="input-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right resize-none"
              />
              <div className="flex gap-2">
                <button
                  data-testid="btn-save-notes"
                  disabled={updateCustomer.isPending}
                  onClick={() => updateCustomer.mutate({ storeId: STORE_ID, customerId: Number(customerId), data: { notes } })}
                  className="px-3 h-7 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  حفظ
                </button>
                <button onClick={() => setEditingNotes(false)} className="px-3 h-7 rounded text-xs font-medium border border-border hover:bg-accent transition-colors">
                  الغاء
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{customer.notes || "لا توجد ملاحظات"}</p>
          )}
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <p className="text-sm font-semibold text-foreground">تاريخ الطلبات</p>
        </div>
        {!customer.orders || customer.orders.length === 0 ? (
          <div className="px-5 py-8 text-center text-muted-foreground text-sm">لا توجد طلبات</div>
        ) : (
          <div className="divide-y divide-border">
            {customer.orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                data-testid={`row-order-${order.id}`}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-accent/50 transition-colors block"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ProductImageThumb src={order.productImageUrl} alt={order.landingPageName} className="h-12 w-12" />
                  <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{order.landingPageName ?? `طلب #${order.id}`}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString("ar-SA-u-nu-latn")}
                  </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(order.totalPrice)}</p>
                  <StatusBadge status={order.status} className="mt-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

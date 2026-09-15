import { useStoreId } from "@/context/AuthContext";
import { useParams } from "wouter";
import {
  useGetOrder,
  getGetOrderQueryKey,
  useUpdateOrder,
  getListOrdersQueryKey,
  getGetOrdersSummaryQueryKey,
  getListCustomersQueryKey,
  getGetCustomerQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Phone, MapPin, Edit2, Check, X, History } from "lucide-react";
import { Link } from "wouter";
import StatusBadge from "@/components/StatusBadge";
import ProductImageThumb from "@/components/ProductImageThumb";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";


const STATUS_TRANSITIONS: Record<string, { value: string; label: string }[]> = {
  NEW: [
    { value: "PENDING_CONFIRMATION", label: "إرسال للتأكيد" },
    { value: "CANCELLED", label: "إلغاء" },
  ],
  PENDING_CONFIRMATION: [
    { value: "CONFIRMED", label: "تأكيد" },
    { value: "REJECTED", label: "رفض" },
  ],
  CONFIRMED: [
    { value: "SHIPPED", label: "تم الشحن" },
    { value: "CANCELLED", label: "إلغاء" },
  ],
  SHIPPED: [
    { value: "DELIVERED", label: "تم التسليم" },
  ],
  DELIVERED: [
    { value: "RETURNED", label: "إرجاع الطلب" },
  ],
  RETURNED: [],
  CANCELLED: [],
  REJECTED: [],
};

const ACTION_LABELS: Record<string, string> = {
  ORDER_CREATED: "تم إنشاء الطلب",
  STATUS_CHANGED: "تغيير الحالة",
  ORDER_UPDATED: "تعديل الطلب",
};

const STATUS_AR: Record<string, string> = {
  NEW: "جديد",
  PENDING_CONFIRMATION: "بانتظار التأكيد",
  CONFIRMED: "مؤكد",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  RETURNED: "مسترجع",
  CANCELLED: "ملغي",
  REJECTED: "مرفوض",
};

interface AuditLog {
  id: number;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  createdAt: string;
}

export default function OrderDetail() {
  const STORE_ID = useStoreId();
  const { orderId } = useParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusNote, setStatusNote] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editCity, setEditCity] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");

  const { data: order, isLoading } = useGetOrder(STORE_ID, Number(orderId), {
    query: { queryKey: getGetOrderQueryKey(STORE_ID, Number(orderId)) },
  });

  const { data: auditLogs } = useQuery<AuditLog[]>({
    queryKey: ["order-audit", STORE_ID, orderId],
    queryFn: async () => {
      const res = await fetch(`/api/stores/${STORE_ID}/orders/${orderId}/audit`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orderId,
  });

  const updateOrder = useUpdateOrder({
    mutation: {
      onSuccess: (updatedOrder) => {
        qc.invalidateQueries({ queryKey: getGetOrderQueryKey(STORE_ID, Number(orderId)) });
        qc.invalidateQueries({ queryKey: getListOrdersQueryKey(STORE_ID) });
        qc.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey(STORE_ID) });
        qc.invalidateQueries({ queryKey: getListCustomersQueryKey(STORE_ID) });
        if (updatedOrder.customerId) {
          qc.invalidateQueries({ queryKey: getGetCustomerQueryKey(STORE_ID, updatedOrder.customerId) });
        }
        qc.invalidateQueries({ queryKey: ["order-audit", STORE_ID, orderId] });
        toast({ title: "تم تحديث الطلب" });
        setEditMode(false);
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "حدث خطأ", variant: "destructive" });
      },
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="h-6 w-48 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-card border border-card-border rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">الطلب غير موجود</p>
        <Link href="/orders" className="text-primary text-sm hover:underline mt-2 inline-block">العودة للطلبات</Link>
      </div>
    );
  }

  const transitions = STATUS_TRANSITIONS[order.status] ?? [];
  const isShedMed = order.transportMode === "SHED_MED";
  const transportLabel = "تسليم واستلام يدوي";

  const handleStatusChange = (newStatus: string) => {
    updateOrder.mutate({
      storeId: STORE_ID,
      orderId: Number(orderId),
      data: {
        status: newStatus as "NEW" | "PENDING_CONFIRMATION" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "RETURNED" | "CANCELLED" | "REJECTED",
        notes: statusNote || undefined,
      },
    });
  };

  const handleAction = (value: string) => {
    if (value === "RETURNED") {
      setReturnReason("");
      setReturnOpen(true);
      return;
    }
    handleStatusChange(value);
  };

  const confirmReturn = () => {
    const reason = returnReason.trim();
    if (!reason) {
      toast({ title: "سبب الإرجاع مطلوب", variant: "destructive" });
      return;
    }
    setReturnOpen(false);
    updateOrder.mutate({
      storeId: STORE_ID,
      orderId: Number(orderId),
      data: {
        status: "RETURNED",
        returnReason: reason,
      },
    });
  };

  const startEdit = () => {
    setEditCity(order.customerCity ?? "");
    setEditAddress((order.customerAddress as string | null) ?? "");
    setEditPhone(order.customerPhone ?? "");
    setEditMode(true);
  };

  const saveEdit = () => {
    updateOrder.mutate({
      storeId: STORE_ID,
      orderId: Number(orderId),
      data: {
        customerCity: editCity,
        customerAddress: editAddress || undefined,
        customerPhone: editPhone,
      },
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
        <Link href="/orders" className="hover:text-foreground transition-colors">الطلبات</Link>
        <ChevronRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">طلب #{order.id}</span>
      </div>

      {/* Status card */}
      <div className="bg-card border border-card-border rounded-lg p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">حالة الطلب</h2>
          <StatusBadge status={order.status} />
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          أُنشئ في {new Date(order.createdAt).toLocaleString("ar-SA-u-nu-latn")}
        </p>

        {transitions.length > 0 && (
          <div>
            {transitions.some(t => t.value !== "RETURNED") && (
              <div className="mb-3">
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">ملاحظة على الانتقال (اختيارية)</label>
                <input
                  data-testid="input-notes"
                  value={statusNote}
                  onChange={e => setStatusNote(e.target.value)}
                  placeholder="سبب التغيير..."
                  className="w-full h-8 bg-background border border-input rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
                />
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {transitions.map(t => (
                <button
                  key={t.value}
                  data-testid={`btn-status-${t.value}`}
                  disabled={updateOrder.isPending}
                  onClick={() => handleAction(t.value)}
                  className={`px-4 h-9 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                    t.value === "CANCELLED" || t.value === "REJECTED" || t.value === "RETURNED"
                      ? "bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Customer card */}
      <div className="bg-card border border-card-border rounded-lg p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">بيانات العميل</h2>
          {!editMode ? (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 px-2.5 h-7 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              تعديل
            </button>
          ) : (
            <div className="flex gap-1.5">
              <button
                disabled={updateOrder.isPending}
                onClick={saveEdit}
                className="flex items-center gap-1 px-2.5 h-7 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                حفظ
              </button>
              <button
                onClick={() => setEditMode(false)}
                className="flex items-center gap-1 px-2.5 h-7 rounded text-xs text-muted-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                إلغاء
              </button>
            </div>
          )}
        </div>

        {!editMode ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs text-muted-foreground">
                {order.customerName[0]}
              </span>
              <span className="font-medium text-foreground">{order.customerName}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Phone className="w-4 h-4 flex-shrink-0" />
              <span dir="ltr">{order.customerPhone}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span>{order.customerCity}{order.customerAddress ? ` - ${order.customerAddress}` : ""}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">الاسم</label>
              <p className="text-sm text-foreground bg-muted/50 rounded px-3 py-2">{order.customerName}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">رقم الجوال</label>
              <input
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                dir="ltr"
                className="w-full h-8 bg-background border border-input rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">المدينة</label>
              <input
                value={editCity}
                onChange={e => setEditCity(e.target.value)}
                className="w-full h-8 bg-background border border-input rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">العنوان التفصيلي (اختياري)</label>
              <input
                value={editAddress}
                onChange={e => setEditAddress(e.target.value)}
                placeholder="الحي، الشارع..."
                className="w-full h-8 bg-background border border-input rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
              />
            </div>
          </div>
        )}
      </div>

      {/* Order details */}
      <div className="bg-card border border-card-border rounded-lg p-5 mb-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">تفاصيل الطلب</h2>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 mb-4">
          <ProductImageThumb src={order.productImageUrl} alt={order.landingPageName} className="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-foreground truncate">{order.landingPageName ?? "-"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {[order.selectedSize, order.selectedColor].filter(Boolean).join(" · ") || `#${order.id}`}
            </p>
          </div>
          <span className="font-bold text-primary tabular-nums whitespace-nowrap">{formatCurrency(order.totalPrice)}</span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">المنتج</span>
            <span className="font-medium">{order.landingPageName ?? "-"}</span>
          </div>
          {order.selectedSize && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">الخيار الرئيسي</span>
              <span className="font-medium">{order.selectedSize}</span>
            </div>
          )}
          {order.selectedColor && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">الخيار الإضافي</span>
              <span className="font-medium">{order.selectedColor}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">الكمية</span>
            <span className="font-medium">{order.quantity}</span>
          </div>
          {order.deliveryWilayaName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">الولاية</span>
              <span className="font-medium">{order.deliveryWilayaName}</span>
            </div>
          )}
          {order.deliveryCommuneName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">البلدية</span>
              <span className="font-medium">
                {order.deliveryCommuneName}{order.deliveryDairaName ? ` - ${order.deliveryDairaName}` : ""}
              </span>
            </div>
          )}
          {order.deliveryMethod && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{isShedMed ? "طريقة التسليم والاستلام" : "طريقة التوصيل"}</span>
              <span className="font-medium">{isShedMed ? transportLabel : order.deliveryMethod === "HOME" ? "للمنزل" : "للمكتب"}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">سعر الوحدة</span>
            <span className="font-medium tabular-nums">{formatCurrency(order.unitPrice ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{isShedMed ? "سعر التسليم والاستلام اليدوي" : "سعر التوصيل"}</span>
            <span className="font-medium tabular-nums">{formatCurrency(order.deliveryFee ?? 0)}</span>
          </div>
          {order.status === "RETURNED" && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">خسارة الاسترجاع</span>
              <span className="font-medium tabular-nums text-destructive">{formatCurrency(order.returnFee ?? 0)}</span>
            </div>
          )}
          {order.returnReason && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">سبب الإرجاع</span>
              <span className="font-medium">{order.returnReason}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-border">
            <span className="text-muted-foreground font-semibold">الإجمالي المطلوب</span>
            <span className="font-bold tabular-nums text-foreground">{formatCurrency(order.payableTotal ?? order.totalPrice)}</span>
          </div>
          {order.notes && (
            <div className="pt-2 border-t border-border">
              <span className="text-muted-foreground block mb-1">ملاحظات</span>
              <p className="text-foreground bg-muted/50 rounded p-2 text-xs">{order.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Audit log */}
      {auditLogs && auditLogs.length > 0 && (
        <div className="bg-card border border-card-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">سجل الحالة</h2>
          </div>
          <div className="space-y-3">
            {auditLogs.map((log, idx) => (
              <div key={log.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${idx === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
                  {idx < auditLogs.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                </div>
                <div className="pb-3 flex-1">
                  <p className="text-xs font-medium text-foreground">
                    {ACTION_LABELS[log.action] ?? log.action}
                    {log.fromStatus && log.toStatus && (
                      <span className="text-muted-foreground font-normal">
                        {" "}— {STATUS_AR[log.fromStatus] ?? log.fromStatus} ← {STATUS_AR[log.toStatus] ?? log.toStatus}
                      </span>
                    )}
                    {!log.fromStatus && log.toStatus && (
                      <span className="text-muted-foreground font-normal"> · {STATUS_AR[log.toStatus] ?? log.toStatus}</span>
                    )}
                  </p>
                  {log.note && <p className="text-xs text-muted-foreground mt-0.5">"{log.note}"</p>}
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {new Date(log.createdAt).toLocaleString("ar-SA-u-nu-latn")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Return confirmation modal */}
      {returnOpen && (
        <div
          className="fixed inset-0 z-[72] flex items-center justify-center p-4 bg-black/40"
          onClick={() => setReturnOpen(false)}
        >
          <section
            className="w-full max-w-md rounded-lg border border-card-border bg-card p-5 shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="return-title" className="text-base font-bold text-foreground">إرجاع الطلب</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              سيتم تحويل الطلب إلى حالة "مسترجع". سبب الإرجاع مطلوب.
            </p>
            <div className="mt-4">
              <label htmlFor="return-reason" className="text-xs font-medium text-muted-foreground block mb-1.5">
                سبب الإرجاع
              </label>
              <textarea
                id="return-reason"
                data-testid="input-return-reason"
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                placeholder="مثال: العميل لم يرغب في المنتج"
                rows={3}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturnOpen(false)}
                className="px-4 h-9 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                data-testid="btn-confirm-return"
                disabled={updateOrder.isPending}
                onClick={confirmReturn}
                className="px-4 h-9 rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                تأكيد الإرجاع
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

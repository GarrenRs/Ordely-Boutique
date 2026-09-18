import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOrdersSummaryQueryKey,
  getListConfirmationsQueryKey,
  getListOrdersQueryKey,
  useConfirmOrder,
  useListConfirmations,
  useRejectOrder,
} from "@workspace/api-client-react";
import { CheckCircle2, Clock, Copy, MessageCircle, XCircle } from "lucide-react";
import ProductImageThumb from "@/components/ProductImageThumb";
import { useStoreId } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";

const headCell = "border border-border px-3 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap";
const bodyCell = "border border-border px-3 py-3 align-middle";

function buildWhatsAppLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? "213" + digits.slice(1) : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

function buildConfirmationMessage(order: {
  id: number;
  customerName: string;
  landingPageName?: string | null;
  selectedSize?: string | null;
  selectedColor?: string | null;
  quantity: number;
  totalPrice: number;
  payableTotal?: number | null;
}) {
  const variantLines = [
    order.selectedSize ? `الخيار الرئيسي: ${order.selectedSize}` : null,
    order.selectedColor ? `الخيار الإضافي: ${order.selectedColor}` : null,
  ].filter(Boolean).join("\n");

  return `عزيزي/عزيزتي ${order.customerName}،
تم استلام طلبك رقم #${order.id} بنجاح.
المنتج: ${order.landingPageName ?? "المنتج"}
${variantLines ? `${variantLines}\n` : ""}الكمية: ${order.quantity} قطعة
المبلغ الإجمالي: ${formatCurrency(order.payableTotal ?? order.totalPrice)}

سيتم التواصل معك قريباً لترتيب التوصيل. شكراً لثقتك بنا!`;
}

export default function OrdersConfirmationsPanel() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: orders, isLoading } = useListConfirmations(storeId, {
    query: { queryKey: getListConfirmationsQueryKey(storeId) },
  });

  const invalidateOrders = () => {
    qc.invalidateQueries({ queryKey: getListConfirmationsQueryKey(storeId) });
    qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) });
    qc.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey(storeId) });
  };

  const confirmOrder = useConfirmOrder({
    mutation: {
      onSuccess: () => {
        invalidateOrders();
        toast({ title: "تم تأكيد الطلب" });
      },
    },
  });

  const rejectOrder = useRejectOrder({
    mutation: {
      onSuccess: () => {
        invalidateOrders();
        toast({ title: "تم رفض الطلب", variant: "destructive" });
      },
    },
  });

  if (isLoading) {
    return (
      <div className="bg-card border border-card-border rounded-lg divide-y divide-border">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="flex items-center gap-4 px-5 py-4">
            <div className="h-12 w-12 rounded bg-muted animate-pulse" />
            <div className="flex-1 h-4 bg-muted animate-pulse rounded" />
            <div className="w-24 h-4 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-lg">
        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <p className="text-base font-semibold text-foreground">لا توجد طلبات معلقة</p>
        <p className="text-sm text-muted-foreground mt-1">جميع الطلبات تمت معالجتها</p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block bg-card border border-card-border rounded-lg overflow-hidden">
        <table className="w-full table-fixed border-collapse border border-border text-sm">
          <colgroup>
            <col className="w-[8%]" />
            <col className="w-[19%]" />
            <col className="w-[25%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[11%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className={headCell}>#</th>
              <th className={headCell}>العميل</th>
              <th className={headCell}>المنتج</th>
              <th className={headCell}>الولاية</th>
              <th className={headCell}>المبلغ</th>
              <th className={headCell}>التاريخ</th>
              <th className={headCell}>الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order) => {
              const confirmMsg = buildConfirmationMessage(order);
              return (
                <tr key={order.id} data-testid={`row-confirmation-${order.id}`} className="hover:bg-accent/50 transition-colors">
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
                        <p className="text-xs text-muted-foreground truncate">
                          {[order.selectedSize, order.selectedColor].filter(Boolean).join(" · ") || `${order.quantity} قطعة`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={`${bodyCell} text-muted-foreground`}><div className="truncate">{order.customerCity}</div></td>
                  <td className={`${bodyCell} font-semibold tabular-nums whitespace-nowrap`}>{formatCurrency(order.totalPrice)}</td>
                  <td className={`${bodyCell} text-xs text-muted-foreground whitespace-nowrap`}>
                    {new Date(order.createdAt).toLocaleDateString("ar-DZ-u-nu-latn")}
                  </td>
                  <td className={bodyCell}>
                    <div className="flex items-center justify-center gap-1.5">
                      <a
                        href={buildWhatsAppLink(order.customerPhone, confirmMsg)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="واتساب"
                        className="h-8 w-8 rounded-md border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-900/20"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                      <button
                        title="نسخ الرسالة"
                        onClick={() => {
                          navigator.clipboard.writeText(confirmMsg)
                            .then(() => toast({ title: "تم نسخ رسالة التأكيد" }))
                            .catch(() => toast({ title: "تعذّر النسخ", variant: "destructive" }));
                        }}
                        className="h-8 w-8 rounded-md border border-border text-muted-foreground bg-card hover:bg-accent flex items-center justify-center"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        data-testid={`btn-reject-${order.id}`}
                        disabled={confirmOrder.isPending || rejectOrder.isPending}
                        onClick={() => rejectOrder.mutate({ storeId, orderId: order.id, data: {} })}
                        className="h-8 w-8 rounded-md border border-destructive/30 text-destructive bg-destructive/5 hover:bg-destructive/10 flex items-center justify-center disabled:opacity-50"
                        title="رفض"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                      <button
                        data-testid={`btn-confirm-${order.id}`}
                        disabled={confirmOrder.isPending || rejectOrder.isPending}
                        onClick={() => confirmOrder.mutate({ storeId, orderId: order.id, data: {} })}
                        className="h-8 w-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center disabled:opacity-50"
                        title="تأكيد"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {orders.map((order) => {
          const confirmMsg = buildConfirmationMessage(order);
          return (
            <article key={order.id} data-testid={`card-confirmation-${order.id}`} className="bg-card border border-card-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{order.customerName}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">{order.customerPhone}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  <Clock className="h-3 w-3" />
                  #{order.id}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <ProductImageThumb src={order.productImageUrl} alt={order.landingPageName} className="h-14 w-14" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{order.landingPageName ?? "-"}</p>
                  <p className="text-xs text-muted-foreground truncate">{order.customerCity} · {order.quantity} قطعة</p>
                </div>
                <span className="font-bold tabular-nums text-foreground whitespace-nowrap">{formatCurrency(order.totalPrice)}</span>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                <a
                  href={buildWhatsAppLink(order.customerPhone, confirmMsg)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 rounded-md border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-900/20"
                  aria-label="واتساب"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(confirmMsg)
                      .then(() => toast({ title: "تم نسخ رسالة التأكيد" }))
                      .catch(() => toast({ title: "تعذّر النسخ", variant: "destructive" }));
                  }}
                  className="h-9 rounded-md border border-border text-muted-foreground bg-card hover:bg-accent flex items-center justify-center"
                  aria-label="نسخ الرسالة"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  data-testid={`btn-reject-${order.id}`}
                  disabled={confirmOrder.isPending || rejectOrder.isPending}
                  onClick={() => rejectOrder.mutate({ storeId, orderId: order.id, data: {} })}
                  className="h-9 rounded-md border border-destructive/30 text-destructive bg-destructive/5 hover:bg-destructive/10 flex items-center justify-center disabled:opacity-50"
                  aria-label="رفض"
                >
                  <XCircle className="w-4 h-4" />
                </button>
                <button
                  data-testid={`btn-confirm-${order.id}`}
                  disabled={confirmOrder.isPending || rejectOrder.isPending}
                  onClick={() => confirmOrder.mutate({ storeId, orderId: order.id, data: {} })}
                  className="h-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center disabled:opacity-50"
                  aria-label="تأكيد"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Package, Save, User, Truck } from "lucide-react";
import {
  useCreateManualOrder,
  useListDeliveryCommunes,
  useListDeliveryZones,
  useListLandingPages,
  getListOrdersQueryKey,
  getGetOrdersSummaryQueryKey,
  getListCustomersQueryKey,
  type LandingPage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useStoreId } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";

const inputCls = "w-full h-9 bg-background border border-input rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right";
const textareaCls = "w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right resize-none";
const labelCls = "block text-sm font-medium text-foreground mb-1.5";

function readApiError(error: unknown): { status?: number; message?: string } {
  const candidate = error as {
    status?: number;
    message?: string;
    data?: { error?: string; message?: string };
    response?: { status?: number; data?: { error?: string; message?: string } };
  };
  return {
    status: candidate.status ?? candidate.response?.status,
    message: candidate.data?.error ?? candidate.data?.message ?? candidate.response?.data?.error ?? candidate.response?.data?.message ?? candidate.message,
  };
}

export default function NewOrder() {
  const storeId = useStoreId();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [landingPageId, setLandingPageId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [deliveryZoneId, setDeliveryZoneId] = useState("");
  const [deliveryCommuneName, setDeliveryCommuneName] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"HOME" | "OFFICE">("OFFICE");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");

  const { data: pagesData, isLoading: pagesLoading } = useListLandingPages(storeId, {
    query: { queryKey: ["list-landing-pages", storeId] },
  });
  const { data: zonesData, isLoading: zonesLoading } = useListDeliveryZones(storeId, {
    query: { queryKey: ["list-delivery-zones", storeId] },
  });

  const pages = pagesData ?? [];
  const zones = zonesData ?? [];

  const usableZones = useMemo(
    () => zones.filter((zone) => zone.isActive && zone.officeFee !== null),
    [zones],
  );

  const selectedPage = pages.find((page) => String(page.id) === landingPageId);
  const selectedZone = usableZones.find((zone) => String(zone.id) === deliveryZoneId);

  const { data: communesData, isLoading: communesLoading } = useListDeliveryCommunes(
    storeId,
    selectedZone?.wilayaCode ?? "",
    {
      query: {
        queryKey: ["list-delivery-communes", storeId, selectedZone?.wilayaCode ?? ""],
        enabled: !!selectedZone,
      },
    },
  );
  const communes = communesData ?? [];

  const sizes = selectedPage?.availableSizes?.length ? selectedPage.availableSizes : [];
  const colors = selectedPage?.availableColors?.length ? selectedPage.availableColors : [];
  const isShedMed = selectedPage?.transportMode === "SHED_MED";
  const homeDisabled = isShedMed || selectedZone?.homeFee === null;

  useEffect(() => {
    if (homeDisabled && deliveryMethod === "HOME") {
      setDeliveryMethod("OFFICE");
    }
    if (deliveryMethod === "OFFICE") {
      setCustomerAddress("");
    }
  }, [homeDisabled, deliveryMethod]);

  useEffect(() => {
    setSelectedSize("");
    setSelectedColor("");
  }, [landingPageId]);

  useEffect(() => {
    setDeliveryCommuneName("");
  }, [deliveryZoneId]);

  const createManual = useCreateManualOrder({
    mutation: {
      onSuccess: (order) => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) });
        queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey(storeId) });
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey(storeId) });
        toast({ title: "تم إنشاء الطلب" });
        setLocation(`/orders/${order.id}`);
      },
      onError: (err: unknown) => {
        const msg = readApiError(err).message;
        toast({ title: msg ?? "تعذر إنشاء الطلب", variant: "destructive" });
      },
    },
  });

  const filterPrices = (page: LandingPage) => formatCurrency(page.price);

  const handleSubmit = () => {
    const name = customerName.trim();
    const phone = customerPhone.trim();

    if (name.length < 2) {
      toast({ title: "اسم العميل مطلوب", variant: "destructive" });
      return;
    }
    if (phone.length < 9) {
      toast({ title: "رقم الهاتف مطلوب", variant: "destructive" });
      return;
    }
    if (!selectedPage) {
      toast({ title: "اختر المنتج", variant: "destructive" });
      return;
    }
    if (sizes.length > 0 && !selectedSize) {
      toast({ title: "اختر المقاس", variant: "destructive" });
      return;
    }
    if (colors.length > 0 && !selectedColor) {
      toast({ title: "اختر اللون", variant: "destructive" });
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
      toast({ title: "الكمية يجب أن تكون بين 1 و 10", variant: "destructive" });
      return;
    }
    if (!selectedZone) {
      toast({ title: "اختر الولاية", variant: "destructive" });
      return;
    }
    if (!deliveryCommuneName) {
      toast({ title: "اختر البلدية", variant: "destructive" });
      return;
    }
    if (deliveryMethod === "HOME" && !customerAddress.trim()) {
      toast({ title: "العنوان مطلوب عند التوصيل إلى المنزل", variant: "destructive" });
      return;
    }

    createManual.mutate({
      storeId,
      data: {
        landingPageId: selectedPage.id,
        customerName: name,
        customerPhone: phone,
        customerAddress: deliveryMethod === "HOME" ? customerAddress.trim() || undefined : undefined,
        deliveryZoneId: selectedZone.id as number,
        deliveryCommuneName,
        deliveryMethod,
        selectedSize: selectedSize || undefined,
        selectedColor: selectedColor || undefined,
        quantity: qty,
        notes: notes.trim() || undefined,
      },
    });
  };

  const busy = createManual.isPending;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/orders" className="hover:text-foreground transition-colors">الطلبات</Link>
            <span>/</span>
            <span className="text-foreground">طلب جديد</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">طلب يدوي جديد</h1>
          <p className="text-sm text-muted-foreground mt-0.5">إدخال طلب تم استلامه يدوياً (الدفع عند الاستلام)</p>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          بيانات العميل
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>اسم العميل</label>
            <input
              data-testid="input-customer-name"
              className={inputCls}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="الاسم الكامل"
            />
          </div>
          <div>
            <label className={labelCls}>رقم الهاتف</label>
            <input
              data-testid="input-customer-phone"
              className={inputCls}
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder="05XX XX XX XX"
              dir="ltr"
            />
          </div>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          المنتج
        </h2>
        {pagesLoading ? (
          <div className="h-9 bg-muted animate-pulse rounded" />
        ) : (
          <div>
            <label className={labelCls}>المنتج</label>
            <select
              data-testid="select-product"
              className={inputCls}
              value={landingPageId}
              onChange={(event) => setLandingPageId(event.target.value)}
            >
              <option value="">اختر منتجاً...</option>
              {pages.map((page) => (
                <option key={page.id} value={String(page.id)}>
                  {page.productName} - {filterPrices(page)}{page.isActive ? "" : " (غير منشور)"}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-4">
          {sizes.length > 0 && (
            <div>
              <label className={labelCls}>المقاس</label>
              <select
                data-testid="select-size"
                className={inputCls}
                value={selectedSize}
                onChange={(event) => setSelectedSize(event.target.value)}
              >
                <option value="">اختر المقاس...</option>
                {sizes.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          )}
          {colors.length > 0 && (
            <div>
              <label className={labelCls}>اللون</label>
              <select
                data-testid="select-color"
                className={inputCls}
                value={selectedColor}
                onChange={(event) => setSelectedColor(event.target.value)}
              >
                <option value="">اختر اللون...</option>
                {colors.map((color) => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>الكمية</label>
            <input
              data-testid="input-quantity"
              className={inputCls}
              type="number"
              min={1}
              max={10}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
        </div>

        {selectedPage && (
          <div className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{selectedPage.productName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sizes.length > 0 ? `المقاس: ${selectedSize || "-"}` : ""}
                {sizes.length > 0 && colors.length > 0 ? "  ·  " : ""}
                {colors.length > 0 ? `اللون: ${selectedColor || "-"}` : ""}
              </p>
            </div>
            <p className="text-sm font-bold tabular-nums text-foreground">
              {isShedMed ? "تسليم واستلام يدوي" : formatCurrency(selectedPage.price * (Number(quantity) || 1))}
            </p>
          </div>
        )}
      </div>

      <div className="bg-card border border-card-border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Truck className="w-4 h-4 text-muted-foreground" />
          التوصيل
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>الولاية</label>
            <select
              data-testid="select-wilaya"
              className={inputCls}
              value={deliveryZoneId}
              onChange={(event) => setDeliveryZoneId(event.target.value)}
            >
              <option value="">اختر الولاية...</option>
              {usableZones.map((zone) => (
                <option key={String(zone.id)} value={String(zone.id)}>{zone.wilayaName}</option>
              ))}
            </select>
            {zonesLoading && <p className="text-xs text-muted-foreground mt-1">جاري تحميل الولايات...</p>}
            {usableZones.length === 0 && !zonesLoading && (
              <p className="text-xs text-destructive mt-1">لا توجد ولايات مفعّلة للتوصيل</p>
            )}
          </div>
          <div>
            <label className={labelCls}>البلدية</label>
            <select
              data-testid="select-commune"
              className={inputCls}
              value={deliveryCommuneName}
              onChange={(event) => setDeliveryCommuneName(event.target.value)}
              disabled={!selectedZone}
            >
              <option value="">{selectedZone ? "اختر البلدية..." : "اختر الولاية أولاً"}</option>
              {!communesLoading &&
                communes.filter((commune) => commune.isActive).map((commune) => (
                  <option key={commune.id} value={commune.name}>{commune.name}</option>
                ))}
              {communesLoading && <option value="">جاري تحميل البلديات...</option>}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>طريقة التوصيل</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="method-office"
              onClick={() => setDeliveryMethod("OFFICE")}
              className={`h-9 rounded-md border text-sm font-semibold transition-colors ${
                deliveryMethod === "OFFICE"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              مكتب البريد
            </button>
            <button
              type="button"
              data-testid="method-home"
              onClick={() => !homeDisabled && setDeliveryMethod("HOME")}
              disabled={homeDisabled}
              className={`h-9 rounded-md border text-sm font-semibold transition-colors disabled:opacity-40 ${
                deliveryMethod === "HOME"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              إلى المنزل
            </button>
          </div>
          {isShedMed && (
            <p className="text-xs text-muted-foreground mt-2">
              هذا المنتج يُسلَّم عبر التسليم اليدوي (SHEED Med) - التوصيل للمكتب فقط
            </p>
          )}
        </div>

        {deliveryMethod === "HOME" && (
          <div>
            <label className={labelCls}>العنوان الكامل</label>
            <input
              data-testid="input-address"
              className={inputCls}
              value={customerAddress}
              onChange={(event) => setCustomerAddress(event.target.value)}
              placeholder="الحي، الشارع، رقم المنزل..."
            />
          </div>
        )}

        <div>
          <label className={labelCls}>ملاحظات (اختياري)</label>
          <textarea
            data-testid="input-notes"
            className={textareaCls}
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="أي تفاصيل إضافية..."
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link href="/orders" className={`h-9 px-4 rounded-md text-sm font-semibold border border-border text-muted-foreground hover:text-foreground transition-colors inline-flex items-center`}>
          إلغاء
        </Link>
        <button
          type="button"
          data-testid="btn-submit"
          onClick={handleSubmit}
          disabled={busy || pagesLoading || zonesLoading}
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-2"
        >
          {busy ? (
            <>
              <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
              جاري الإنشاء...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              إنشاء الطلب
            </>
          )}
        </button>
      </div>
    </div>
  );
}
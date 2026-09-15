import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageCircle,
  Phone,
  Package,
  ShoppingCart,
  Store,
  Truck,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import brandLogo from "@/assets/brand/logo.png";
import {
  DEFAULT_PRIMARY_OPTION_LABEL,
  DEFAULT_SECONDARY_OPTION_LABEL,
  parseOptionGroup,
} from "@/components/product-options";

const schema = z.object({
  customerName: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل"),
  customerPhone: z.string().min(9, "رقم الهاتف غير صحيح").max(15),
  customerCity: z.string().optional(),
  customerAddress: z.string().optional(),
  quantity: z.number().int().min(1).max(10),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;
type LandingTemplate = "classic" | "bold" | "minimal";

interface LandingPageData {
  id: number;
  categoryId: number | null;
  productName: string;
  price: number;
  description: string;
  imageUrl: string | null;
  productImages: string[];
  availableSizes: string[];
  availableColors: string[];
  deliveryZones: Array<{
    id: number;
    wilayaCode: string;
    wilayaName: string;
    homeFee: number | null;
    officeFee: number | null;
    returnFee: number;
    communes: Array<{
      id: number;
      name: string;
      dairaName: string;
    }>;
  }>;
  galleryDisplay: "carousel" | "grid";
  template?: LandingTemplate;
  themeColor: string;
  transportMode?: "DELIVERY_COMPANY" | "SHED_MED";
  deliveryInfo: string | null;
  whatsappNumber: string | null;
  storeId: number;
  store: {
    slug: string;
    name: string;
  } | null;
  relatedProducts: Array<{
    id: number;
    categoryId: number | null;
    productName: string;
    price: number;
    description: string;
    slug: string;
    imageUrl: string | null;
    productImages: string[];
  }>;
}

const inputCls = "w-full h-10 bg-background border border-input rounded-md px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-right";
const labelCls = "text-xs font-semibold text-muted-foreground block mb-1.5";
const PANEL_ORANGE = "#f59e0b";
const LEGACY_BLUE = "#1d1a72";
const MANUAL_DELIVERY_LABEL = "تسليم واستلام يدوي";

const TEMPLATE_STYLES: Record<LandingTemplate, {
  page: string;
  topStop: string;
  glowOpacity: number;
  washOpacity: number;
  grid: string;
  productCard: string;
  imageWrap: string;
  image: string;
  content: string;
  title: string;
  price: string;
  form: string;
  related: string;
}> = {
  classic: {
    page: "",
    topStop: "18rem",
    glowOpacity: 0.2,
    washOpacity: 0.14,
    grid: "lg:grid-cols-[minmax(0,1fr)_400px]",
    productCard: "rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.12)]",
    imageWrap: "aspect-[4/3]",
    image: "object-cover",
    content: "px-5 pt-5 pb-6",
    title: "text-3xl font-black",
    price: "text-3xl font-black mt-4 text-left",
    form: "rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.12)]",
    related: "rounded-2xl shadow-[0_18px_42px_rgba(15,23,42,0.07)]",
  },
  bold: {
    page: "",
    topStop: "21rem",
    glowOpacity: 0.28,
    washOpacity: 0.18,
    grid: "lg:grid-cols-[minmax(0,1.1fr)_380px]",
    productCard: "rounded-[1.6rem] border-primary/25 shadow-[0_34px_92px_rgba(15,23,42,0.20)]",
    imageWrap: "aspect-[16/10] sm:aspect-[16/9]",
    image: "object-cover",
    content: "px-5 pt-6 pb-7 sm:px-6",
    title: "text-3xl sm:text-4xl font-black",
    price: "inline-flex mt-5 rounded-full px-4 py-2 text-2xl font-black text-white",
    form: "rounded-[1.35rem] border-primary/25 shadow-[0_28px_80px_rgba(15,23,42,0.18)]",
    related: "rounded-[1.35rem] shadow-[0_22px_58px_rgba(15,23,42,0.10)]",
  },
  minimal: {
    page: "",
    topStop: "14rem",
    glowOpacity: 0.14,
    washOpacity: 0.1,
    grid: "lg:grid-cols-[minmax(0,0.95fr)_400px]",
    productCard: "rounded-xl shadow-none",
    imageWrap: "aspect-[5/3]",
    image: "object-contain p-2",
    content: "px-5 pt-5 pb-6",
    title: "text-2xl sm:text-3xl font-black",
    price: "text-2xl font-black mt-4 text-left",
    form: "rounded-xl shadow-none",
    related: "rounded-xl shadow-none",
  },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function hexToRgb(color: string) {
  const normalized = color.replace("#", "").trim();
  const hex = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { r: 245, g: 158, b: 11 };
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function colorAlpha(color: string, alpha: number) {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildPageSurfaceStyle(color: string, template: typeof TEMPLATE_STYLES[LandingTemplate]): CSSProperties {
  return {
    background: [
      `radial-gradient(circle at 86% 0%, ${colorAlpha(color, template.glowOpacity)} 0, transparent 24rem)`,
      `radial-gradient(circle at 12% 2rem, ${colorAlpha(color, template.glowOpacity * 0.55)} 0, transparent 18rem)`,
      `linear-gradient(180deg, #020617 0%, #050814 7rem, ${colorAlpha(color, template.washOpacity)} ${template.topStop}, hsl(var(--background)) ${template.topStop})`,
    ].join(", "),
  };
}

function buildFooterStyle(color: string): CSSProperties {
  return {
    background: [
      `radial-gradient(circle at center top, ${colorAlpha(color, 0.18)} 0, transparent 18rem)`,
      "linear-gradient(180deg, #050814 0%, #020617 100%)",
    ].join(", "),
    borderColor: colorAlpha(color, 0.24),
  };
}

function hasDeliveryBaseFee(fee: number | null | undefined): fee is number {
  return typeof fee === "number" && Number.isFinite(fee);
}

function deliveryCompanyFee(zone: LandingPageData["deliveryZones"][number], method: "HOME" | "OFFICE") {
  if (!hasDeliveryBaseFee(zone.officeFee)) return null;
  return method === "HOME" ? zone.officeFee + (zone.homeFee ?? 0) : zone.officeFee;
}

function resolveThemeColor(color: string | null | undefined) {
  return !color || color === LEGACY_BLUE ? PANEL_ORANGE : color;
}

function relatedProductImage(product: LandingPageData["relatedProducts"][number]) {
  return product.productImages[0] ?? product.imageUrl;
}

export default function PublicLandingPage() {
  const { storeSlug, productSlug, slug } = useParams();
  const productPath = storeSlug && productSlug
    ? `/api/public/s/${encodeURIComponent(storeSlug)}/p/${encodeURIComponent(productSlug)}`
    : `/api/public/p/${encodeURIComponent(slug ?? "")}`;
  const [submitted, setSubmitted] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [imageAutoPaused, setImageAutoPaused] = useState(false);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedDeliveryZoneId, setSelectedDeliveryZoneId] = useState<number | null>(null);
  const [selectedCommuneName, setSelectedCommuneName] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"HOME" | "OFFICE">("HOME");
  const [selectionError, setSelectionError] = useState("");
  const orderFormRef = useRef<HTMLFormElement>(null);

  const { data: page, isLoading, error } = useQuery<LandingPageData>({
    queryKey: ["public-page", storeSlug ?? "legacy", productSlug ?? slug],
    queryFn: async () => {
      const res = await fetch(productPath);
      if (!res.ok) throw new Error("الصفحة غير موجودة");
      return res.json();
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      customerCity: "",
      customerAddress: "",
      quantity: 1,
      notes: "",
    },
  });

  const submitOrder = useMutation({
    mutationFn: async (values: FormValues & {
      selectedSize?: string;
      selectedColor?: string;
      deliveryZoneId: number;
      deliveryCommuneName: string;
      deliveryMethod: "HOME" | "OFFICE";
    }) => {
      const res = await fetch(`${productPath}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "فشل إرسال الطلب");
      }
      return res.json();
    },
    onSuccess: (order: { id?: number }) => {
      setSubmittedOrderId(order.id ?? null);
      setSubmitted(true);
    },
  });

  useEffect(() => {
    if (!page?.deliveryZones.length) return;
    const zone = page.deliveryZones.find((item) => item.id === selectedDeliveryZoneId) ?? page.deliveryZones[0];
    if (!selectedDeliveryZoneId || zone.id !== selectedDeliveryZoneId) {
      setSelectedDeliveryZoneId(zone.id);
    }
    if (!selectedCommuneName || !zone.communes.some((commune) => commune.name === selectedCommuneName)) {
      setSelectedCommuneName(zone.communes[0]?.name ?? "");
    }
    setDeliveryMethod(page.transportMode === "SHED_MED" ? "OFFICE" : hasDeliveryBaseFee(zone.officeFee) ? "HOME" : "OFFICE");
  }, [page?.deliveryZones, page?.transportMode, selectedDeliveryZoneId, selectedCommuneName]);

  const imageCount = page?.productImages?.length ? page.productImages.length : page?.imageUrl ? 1 : 0;

  useEffect(() => {
    setActiveImage(0);
    setImageAutoPaused(false);
    setSelectedSize("");
    setSelectedColor("");
    setSelectionError("");
  }, [storeSlug, productSlug, slug, imageCount]);

  useEffect(() => {
    if (imageAutoPaused || imageCount < 2) return;
    const timer = window.setInterval(() => {
      setActiveImage((index) => (index + 1) % imageCount);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [imageAutoPaused, imageCount]);

  const selectImageManually = (index: number) => {
    setActiveImage(index);
    setImageAutoPaused(true);
  };

  const showNextImageManually = () => {
    if (imageCount < 2) return;
    setActiveImage((index) => (index + 1) % imageCount);
    setImageAutoPaused(true);
  };

  const showPreviousImageManually = () => {
    if (imageCount < 2) return;
    setActiveImage((index) => (index - 1 + imageCount) % imageCount);
    setImageAutoPaused(true);
  };

  const primaryOption = parseOptionGroup(page?.availableSizes, DEFAULT_PRIMARY_OPTION_LABEL);
  const secondaryOption = parseOptionGroup(page?.availableColors, DEFAULT_SECONDARY_OPTION_LABEL);

  const onSubmit = (values: FormValues) => {
    if (!page) return;
    if (primaryOption.values.length && !selectedSize) {
      setSelectionError(`اختر ${primaryOption.label} قبل إرسال الطلب`);
      return;
    }
    if (secondaryOption.values.length && !selectedColor) {
      setSelectionError(`اختر ${secondaryOption.label} قبل إرسال الطلب`);
      return;
    }
    const zone = page?.deliveryZones.find((item) => item.id === selectedDeliveryZoneId);
    if (!zone) {
      setSelectionError("اختر ولاية التوصيل قبل إرسال الطلب");
      return;
    }
    if (!selectedCommuneName || !zone.communes.some((commune) => commune.name === selectedCommuneName)) {
      setSelectionError("اختر البلدية من القائمة قبل إرسال الطلب");
      return;
    }
    const effectiveDeliveryMethod = page.transportMode === "SHED_MED" ? "OFFICE" : deliveryMethod;
    if (!hasDeliveryBaseFee(zone.officeFee)) {
      setSelectionError(`${page.transportMode === "SHED_MED" ? MANUAL_DELIVERY_LABEL : "طريقة التوصيل"} غير متاحة لهذه الولاية`);
      return;
    }
    setSelectionError("");
    submitOrder.mutate({
      ...values,
      customerCity: zone.wilayaName,
      deliveryZoneId: zone.id,
      deliveryCommuneName: selectedCommuneName,
      deliveryMethod: effectiveDeliveryMethod,
      quantity,
      selectedSize: selectedSize || undefined,
      selectedColor: selectedColor || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050814] flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen bg-[#050814] flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-4">
          <AlertCircle className="w-7 h-7 text-destructive" />
        </div>
        <h1 className="text-lg font-bold text-white">الصفحة غير موجودة</h1>
        <p className="text-slate-400 mt-2 text-sm">هذا المنتج غير متاح حاليا</p>
      </div>
    );
  }

  const themeColor = resolveThemeColor(page.themeColor);
  const template = page.template ?? "classic";
  const templateStyle = TEMPLATE_STYLES[template] ?? TEMPLATE_STYLES.classic;
  const transportMode = page.transportMode ?? "DELIVERY_COMPANY";
  const isShedMed = transportMode === "SHED_MED";
  const images = page.productImages?.length ? page.productImages : page.imageUrl ? [page.imageUrl] : [];
  const shownImage = images[activeImage] ?? images[0];
  const selectedDeliveryZone = page.deliveryZones.find((item) => item.id === selectedDeliveryZoneId) ?? null;
  const selectedCommune = selectedDeliveryZone?.communes.find((commune) => commune.name === selectedCommuneName) ?? null;
  const availableDeliveryMethods = selectedDeliveryZone
    ? isShedMed
      ? [
          {
            value: "OFFICE" as const,
            label: MANUAL_DELIVERY_LABEL,
            fee: selectedDeliveryZone.officeFee,
          },
        ].filter((item) => item.fee !== null)
      : [
        {
          value: "HOME" as const,
          label: "توصيل للمنزل",
          fee: deliveryCompanyFee(selectedDeliveryZone, "HOME"),
        },
        { value: "OFFICE" as const, label: "توصيل للمكتب", fee: deliveryCompanyFee(selectedDeliveryZone, "OFFICE") },
      ].filter((item) => item.fee !== null)
    : [];
  const deliveryFee = selectedDeliveryZone
    ? Number(
        isShedMed
          ? selectedDeliveryZone.officeFee ?? 0
          : deliveryMethod === "HOME"
          ? deliveryCompanyFee(selectedDeliveryZone, "HOME") ?? 0
          : deliveryCompanyFee(selectedDeliveryZone, "OFFICE") ?? 0,
      )
    : 0;
  const productTotal = page.price * quantity;
  const totalPrice = formatCurrency(productTotal);
  const payableTotal = formatCurrency(productTotal + deliveryFee);
  const publicStore = page.store;

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#050814] flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-400/25 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">تم استلام طلبك</h1>
          <p className="text-slate-300 text-sm leading-relaxed max-w-xs">
          سنتواصل معك قريبا لتأكيد الطلب وترتيب {isShedMed ? "التسليم" : "التوصيل"}.
        </p>
        {submittedOrderId && (
          <p className="mt-4 text-sm font-semibold text-white tabular-nums">
            رقم الطلب #{submittedOrderId}
          </p>
        )}
        {submittedOrderId && (
          <Link
            href={`/track?orderId=${submittedOrderId}`}
            data-testid="link-track-order"
            className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/12 bg-white/8 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:border-primary/60 hover:bg-white/12 hover:text-primary"
          >
            <Package className="w-4 h-4" />
            تتبع طلبك
          </Link>
        )}
        <div className="mt-6 flex w-full max-w-xs flex-col items-center gap-2">
          {page.whatsappNumber && (
            <a
              href={`https://wa.me/${page.whatsappNumber.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: "#25D366" }}
            >
              <Phone className="w-4 h-4" />
              تواصل عبر واتساب
            </a>
          )}
          {publicStore && (
            <Link
              href={`/s/${publicStore.slug}`}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/12 bg-white/8 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:border-primary/60 hover:bg-white/12 hover:text-primary"
            >
              <Store className="w-4 h-4" />
              العودة إلى متجر {publicStore.name}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx("min-h-screen pb-24 text-foreground", templateStyle.page)}
      style={buildPageSurfaceStyle(themeColor, templateStyle)}
      dir="rtl"
    >
      <div className="max-w-6xl mx-auto px-4 py-5 sm:py-8">
        {publicStore && (
          <div className="mb-4 flex justify-start">
            <Link
              href={`/s/${publicStore.slug}`}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white shadow-sm backdrop-blur transition-colors hover:border-primary/50 hover:text-primary"
            >
              <Store className="h-4 w-4" />
              العودة إلى متجر {publicStore.name}
            </Link>
          </div>
        )}

        <div className={cx("grid gap-5 items-start", templateStyle.grid)}>
          <section className={cx("bg-card border border-card-border overflow-hidden", templateStyle.productCard)}>
            {shownImage ? (
              <div className={cx("relative w-full bg-muted overflow-hidden", templateStyle.imageWrap)}>
                <img src={shownImage} alt={page.productName} className={cx("w-full h-full", templateStyle.image)} />
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={showNextImageManually}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 border border-white/15 shadow-sm flex items-center justify-center hover:bg-black/70 transition-colors"
                      aria-label="الصورة التالية"
                    >
                      <ChevronRight className="w-5 h-5 text-white" />
                    </button>
                    <button
                      type="button"
                      onClick={showPreviousImageManually}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 border border-white/15 shadow-sm flex items-center justify-center hover:bg-black/70 transition-colors"
                      aria-label="الصورة السابقة"
                    >
                      <ChevronLeft className="w-5 h-5 text-white" />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="w-full aspect-[4/3] bg-muted flex items-center justify-center text-muted-foreground text-sm">
                لا توجد صورة
              </div>
            )}

            {images.length > 1 && page.galleryDisplay === "grid" ? (
              <div className="grid grid-cols-5 gap-2 px-4 py-3 border-t border-card-border">
                {images.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => selectImageManually(index)}
                    className={`aspect-square rounded-md overflow-hidden border-2 ${index === activeImage ? "border-primary" : "border-card-border"}`}
                  >
                    <img src={image} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : images.length > 1 ? (
              <div className="flex justify-center gap-2 py-3 border-t border-card-border">
                {images.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => selectImageManually(index)}
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: index === activeImage ? themeColor : "hsl(var(--border))" }}
                    aria-label={`صورة ${index + 1}`}
                  />
                ))}
              </div>
            ) : null}

            <div className={templateStyle.content}>
              <h1 className={cx("text-foreground leading-tight", templateStyle.title)}>{page.productName}</h1>
              <p
                className={cx("tabular-nums", templateStyle.price)}
                style={template === "bold" ? { backgroundColor: themeColor } : { color: themeColor }}
              >
                {formatCurrency(page.price)}
              </p>
              <p className="text-muted-foreground mt-3 text-sm leading-7">{page.description}</p>

              {primaryOption.values.length > 0 && (
                <div className="mt-5">
                  <p className="text-sm font-semibold text-foreground mb-2">{primaryOption.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {primaryOption.values.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setSelectedSize(size)}
                        className="min-w-12 h-9 px-3 rounded-md border text-sm font-semibold transition-colors"
                        style={{
                          borderColor: selectedSize === size ? themeColor : "hsl(var(--border))",
                          backgroundColor: selectedSize === size ? themeColor : "hsl(var(--background))",
                          color: selectedSize === size ? "#ffffff" : "hsl(var(--foreground))",
                        }}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {secondaryOption.values.length > 0 && (
                <div className="mt-5">
                  <p className="text-sm font-semibold text-foreground mb-2">{secondaryOption.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {secondaryOption.values.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setSelectedColor(color)}
                        className="h-9 px-3 rounded-md border text-sm font-semibold transition-colors"
                        style={{
                          borderColor: selectedColor === color ? themeColor : "hsl(var(--border))",
                          backgroundColor: selectedColor === color ? themeColor : "hsl(var(--background))",
                          color: selectedColor === color ? "#ffffff" : "hsl(var(--foreground))",
                        }}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {page.deliveryInfo && (
                <div className="flex items-center gap-2 mt-5 rounded-md px-4 py-3 border border-card-border bg-muted/40">
                  <Truck className="w-4 h-4 flex-shrink-0" style={{ color: themeColor }} />
                  <p className="text-sm text-foreground">{page.deliveryInfo}</p>
                </div>
              )}
            </div>
          </section>

          <form
            ref={orderFormRef}
            onSubmit={form.handleSubmit(onSubmit)}
            className={cx("bg-card border border-card-border p-4 sm:p-5 space-y-3 lg:sticky lg:top-6", templateStyle.form)}
          >
            <div className="pb-3 border-b border-card-border">
              <p className="text-base font-bold text-foreground">للطلب املأ المعلومات</p>
              <p className="text-xs text-muted-foreground mt-0.5">سيتم التواصل معك لتأكيد الطلب</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-3">
              <div>
                <label className={labelCls}>الاسم الكامل *</label>
                <input {...form.register("customerName")} className={inputCls} placeholder="الاسم الكامل" autoComplete="name" />
                {form.formState.errors.customerName && <p className="text-xs text-destructive mt-1">{form.formState.errors.customerName.message}</p>}
              </div>
              <div>
                <label className={labelCls}>رقم الهاتف *</label>
                <input {...form.register("customerPhone")} className={inputCls} placeholder="05XXXXXXXX" type="tel" dir="ltr" autoComplete="tel" />
                {form.formState.errors.customerPhone && <p className="text-xs text-destructive mt-1">{form.formState.errors.customerPhone.message}</p>}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-3">
              <div>
                <label className={labelCls}>الولاية *</label>
                <select
                  value={selectedDeliveryZoneId ?? ""}
                  onChange={(event) => {
                    const zoneId = Number(event.target.value);
                    const zone = page.deliveryZones.find((item) => item.id === zoneId);
                    setSelectedDeliveryZoneId(zoneId || null);
                    if (zone) {
                      setSelectedCommuneName(zone.communes[0]?.name ?? "");
                      setDeliveryMethod(isShedMed ? "OFFICE" : hasDeliveryBaseFee(zone.officeFee) ? "HOME" : "OFFICE");
                    } else {
                      setSelectedCommuneName("");
                    }
                  }}
                  className={inputCls}
                  disabled={!page.deliveryZones.length}
                >
                  <option value="">اختر الولاية</option>
                  {page.deliveryZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.wilayaCode} - {zone.wilayaName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>البلدية / العنوان</label>
                <select
                  value={selectedCommuneName}
                  onChange={(event) => setSelectedCommuneName(event.target.value)}
                  className={inputCls}
                  disabled={!selectedDeliveryZone}
                >
                  <option value="">اختر البلدية</option>
                  {selectedDeliveryZone?.communes.map((commune) => (
                    <option key={commune.id} value={commune.name}>
                      {commune.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>العنوان التفصيلي</label>
              <input
                {...form.register("customerAddress")}
                className={inputCls}
                placeholder={selectedCommune ? `حي / شارع داخل ${selectedCommune.name}` : "حي / شارع"}
              />
            </div>

            <div>
              <label className={labelCls}>{isShedMed ? "طريقة التسليم والاستلام *" : "طريقة التوصيل *"}</label>
              <div className={isShedMed ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-2"}>
                {availableDeliveryMethods.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setDeliveryMethod(method.value)}
                    className="h-10 rounded-md border px-3 text-xs font-semibold transition-colors"
                    style={{
                      borderColor: deliveryMethod === method.value ? themeColor : "hsl(var(--border))",
                      backgroundColor: deliveryMethod === method.value ? themeColor : "hsl(var(--background))",
                      color: deliveryMethod === method.value ? "#ffffff" : "hsl(var(--foreground))",
                    }}
                  >
                    {method.label} · {formatCurrency(Number(method.fee))}
                  </button>
                ))}
                {!availableDeliveryMethods.length && (
                  <div className={`${isShedMed ? "" : "col-span-2"} rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground`}>
                    لم يتم تفعيل {isShedMed ? MANUAL_DELIVERY_LABEL : "التوصيل"} لهذه الصفحة بعد.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 bg-primary/5 border border-primary/15 rounded-xl p-3">
              <div>
                <p className="text-xs text-muted-foreground font-semibold">سعر المنتج</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: themeColor }}>{totalPrice}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isShedMed ? MANUAL_DELIVERY_LABEL : "التوصيل"}: <span className="font-semibold tabular-nums">{formatCurrency(deliveryFee)}</span>
                </p>
                <p className="text-sm font-bold text-foreground tabular-nums mt-1">
                  الإجمالي: {payableTotal}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(10, value + 1))}
                  className="w-9 h-9 rounded-md text-white text-xl font-bold flex items-center justify-center"
                  style={{ backgroundColor: themeColor }}
                >
                  +
                </button>
                <span className="text-lg font-bold text-foreground tabular-nums w-6 text-center">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="w-9 h-9 rounded-md bg-secondary text-secondary-foreground border border-secondary-border text-xl font-bold flex items-center justify-center"
                >
                  -
                </button>
              </div>
            </div>

            <textarea
              {...form.register("notes")}
              rows={2}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-right resize-none"
              placeholder="ملاحظات اختيارية"
            />

            {selectionError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {selectionError}
              </div>
            )}

            {submitOrder.isError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {submitOrder.error instanceof Error ? submitOrder.error.message : "فشل إرسال الطلب"}
              </div>
            )}

            <button
              type="submit"
              data-testid="btn-submit-order"
              disabled={submitOrder.isPending || !availableDeliveryMethods.length}
              className="w-full h-12 rounded-lg text-white text-sm font-bold transition-opacity disabled:opacity-50 flex items-center justify-center gap-3 shadow-[0_14px_26px_rgba(15,23,42,0.18)]"
              style={{ backgroundColor: themeColor }}
            >
              {submitOrder.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingCart className="w-5 h-5" />}
              {submitOrder.isPending ? "جاري الإرسال..." : "أطلب الآن"}
            </button>
          </form>
        </div>

        {publicStore && page.relatedProducts.length > 0 && (
          <section className={cx("mt-8 border border-card-border bg-card p-4 sm:p-5", templateStyle.related)}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">منتجات ذات صلة</h2>
                <p className="mt-1 text-xs text-muted-foreground">منتجات من نفس المتجر، والأقرب للتصنيف تظهر أولًا.</p>
              </div>
              <Link
                href={`/s/${publicStore.slug}`}
                className="hidden h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary sm:inline-flex"
              >
                كل المنتجات
                <Store className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {page.relatedProducts.map((product) => {
                const image = relatedProductImage(product);
                return (
                  <Link
                    key={product.id}
                    href={`/s/${publicStore.slug}/p/${product.slug}`}
                    className="group overflow-hidden rounded-xl border border-card-border bg-background transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_16px_34px_rgba(15,23,42,0.10)]"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-muted">
                      {image ? (
                        <img src={image} alt={product.productName} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="line-clamp-1 text-sm font-bold text-foreground">{product.productName}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{product.description}</p>
                      <p className="mt-3 text-sm font-bold text-primary tabular-nums">{formatCurrency(product.price)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <footer className="border-t px-4 py-8 text-center" style={buildFooterStyle(themeColor)}>
        <span className="inline-flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
          <span className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-black px-4 py-2 shadow-[0_0_24px_rgba(245,158,11,0.12)]">
            <img src={brandLogo} alt="Ordely" className="h-8 w-auto max-w-[9.5rem] object-contain" />
          </span>
          <span>Powered by Ordely</span>
        </span>
      </footer>

      <div className="fixed bottom-0 left-0 right-0 bg-[#050814]/95 backdrop-blur border-t border-primary/20 px-4 py-3 lg:hidden">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          {page.whatsappNumber && (
            <a
              href={`https://wa.me/${page.whatsappNumber.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-11 h-11 rounded-md text-white flex items-center justify-center shadow-sm"
              style={{ backgroundColor: themeColor }}
              aria-label="واتساب"
            >
              <MessageCircle className="w-5 h-5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => orderFormRef.current?.requestSubmit()}
            disabled={!availableDeliveryMethods.length}
            className="flex-1 h-11 rounded-md text-white text-sm font-bold shadow-[0_12px_28px_rgba(0,0,0,0.25)]"
            style={{ backgroundColor: themeColor }}
          >
            أطلب الآن
          </button>
        </div>
      </div>
    </div>
  );
}

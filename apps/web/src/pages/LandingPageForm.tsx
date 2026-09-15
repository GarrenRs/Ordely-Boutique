import { useStoreId } from "@/context/AuthContext";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetLandingPage,
  getGetLandingPageQueryKey,
  useCreateLandingPage,
  useUpdateLandingPage,
  getListLandingPagesQueryKey,
  useUploadProductImage,
  useListProductCategories,
  getListProductCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_PRIMARY_OPTION_LABEL,
  DEFAULT_SECONDARY_OPTION_LABEL,
  PRODUCT_OPTION_LABELS,
  parseOptionGroup,
  serializeOptionGroup,
} from "@/components/product-options";

const schema = z.object({
  productName: z.string().min(1, "اسم المنتج مطلوب"),
  price: z.number({ invalid_type_error: "السعر مطلوب" }).positive("السعر يجب أن يكون موجبًا"),
  description: z.string().min(1, "وصف المنتج مطلوب"),
  imageUrl: z.string().optional(),
  template: z.enum(["classic", "bold", "minimal"]),
  slug: z.string().min(1, "رابط الصفحة مطلوب").regex(/^[a-z0-9-]+$/, "الرابط يقبل أحرفًا إنجليزية وأرقامًا وشرطات فقط"),
  transportMode: z.enum(["DELIVERY_COMPANY", "SHED_MED"]),
  deliveryInfo: z.string().optional(),
  whatsappNumber: z.string().optional(),
  categoryId: z.number().optional(),
});

type FormValues = z.infer<typeof schema>;
type GalleryDisplay = "carousel" | "grid";
type UploadContentType = "image/jpeg" | "image/png" | "image/webp";

const PANEL_ORANGE = "#f59e0b";
const LEGACY_BLUE = "#1d1a72";

const THEME_OPTIONS = [
  { label: "رجالي - برتقالي Ordely", value: PANEL_ORANGE },
  { label: "رجالي - أسود فحمي", value: "#111827" },
  { label: "رجالي - كحلي عميق", value: "#0f172a" },
  { label: "رجالي - أزرق ملكي", value: "#1d4ed8" },
  { label: "رجالي - أخضر داكن", value: "#166534" },
  { label: "نسائي - وردي فاخر", value: "#db2777" },
  { label: "نسائي - أحمر أنيق", value: "#dc2626" },
  { label: "نسائي - روز هادئ", value: "#e11d48" },
  { label: "نسائي - بنفسجي ناعم", value: "#7c3aed" },
  { label: "نسائي - مرجاني دافئ", value: "#ea580c" },
];

function resolveFormThemeColor(color: string | null | undefined) {
  if (!color || color === LEGACY_BLUE) return THEME_OPTIONS[0].value;
  return THEME_OPTIONS.some((option) => option.value === color) ? color : THEME_OPTIONS[0].value;
}

const TRANSPORT_OPTIONS = [
  { label: "شركة توصيل", value: "DELIVERY_COMPANY", hint: "مكتب أو منزل حسب الولاية." },
  { label: "تسليم واستلام يدوي", value: "SHED_MED", hint: "اتفاق مباشر مع الزبون بنفس دورة الطلب." },
] as const;

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const inputCls = "w-full h-9 bg-background border border-input rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right";
const textareaCls = "w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right resize-none";

function OptionBuilder({
  title,
  label,
  values,
  draft,
  fallbackLabel,
  onLabelChange,
  onDraftChange,
  onValuesChange,
}: {
  title: string;
  label: string;
  values: string[];
  draft: string;
  fallbackLabel: string;
  onLabelChange: (value: string) => void;
  onDraftChange: (value: string) => void;
  onValuesChange: (value: string[]) => void;
}) {
  const addValue = () => {
    const value = draft.trim();
    if (!value || values.includes(value)) return;
    onValuesChange([...values, value].slice(0, 20));
    onDraftChange("");
  };

  const removeValue = (value: string) => {
    onValuesChange(values.filter((item) => item !== value));
  };

  return (
    <div className="rounded-lg border border-border bg-background/70 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">اتركه فارغًا إذا لم يكن المنتج يحتاج هذا الاختيار.</p>
        </div>
        <select
          value={label}
          onChange={(event) => onLabelChange(event.target.value || fallbackLabel)}
          className="h-9 min-w-28 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value={fallbackLabel}>{fallbackLabel}</option>
          {PRODUCT_OPTION_LABELS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue();
            }
          }}
          className="h-9 flex-1 rounded-md border border-input bg-card px-3 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={`أدخل ${label || fallbackLabel}`}
        />
        <button
          type="button"
          onClick={addValue}
          className="h-9 w-10 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center justify-center"
          aria-label="إضافة خيار"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {values.length > 0 ? (
        <div className="rounded-md border border-border bg-muted/30 overflow-hidden">
          {values.map((value) => (
            <div key={value} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border last:border-b-0">
              <span className="text-sm font-medium text-foreground">{value}</span>
              <button
                type="button"
                onClick={() => removeValue(value)}
                className="h-7 w-7 rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors inline-flex items-center justify-center"
                aria-label="حذف الخيار"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-center text-xs text-muted-foreground">
          لا توجد قيم مضافة لهذا النوع.
        </div>
      )}
    </div>
  );
}

export default function LandingPageForm() {
  const STORE_ID = useStoreId();
  const { pageId } = useParams();
  const [, setLocation] = useLocation();
  const isEditing = !!pageId;
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [primaryOptionLabel, setPrimaryOptionLabel] = useState(DEFAULT_PRIMARY_OPTION_LABEL);
  const [primaryOptionDraft, setPrimaryOptionDraft] = useState("");
  const [primaryOptionValues, setPrimaryOptionValues] = useState<string[]>([]);
  const [secondaryOptionLabel, setSecondaryOptionLabel] = useState(DEFAULT_SECONDARY_OPTION_LABEL);
  const [secondaryOptionDraft, setSecondaryOptionDraft] = useState("");
  const [secondaryOptionValues, setSecondaryOptionValues] = useState<string[]>([]);
  const [galleryDisplay, setGalleryDisplay] = useState<GalleryDisplay>("carousel");
  const [themeColor, setThemeColor] = useState(THEME_OPTIONS[0].value);

  const { data: existing } = useGetLandingPage(STORE_ID, Number(pageId), {
    query: { enabled: isEditing, queryKey: getGetLandingPageQueryKey(STORE_ID, Number(pageId)) },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      productName: "",
      price: 0,
      description: "",
      imageUrl: "",
      template: "classic",
      slug: "",
      transportMode: "DELIVERY_COMPANY",
      deliveryInfo: "",
      whatsappNumber: "",
      categoryId: undefined,
    },
  });

  const { data: categories } = useListProductCategories(STORE_ID, {
    query: { queryKey: getListProductCategoriesQueryKey(STORE_ID) },
  });

  useEffect(() => {
    if (existing) {
      const images = existing.productImages?.length ? existing.productImages : existing.imageUrl ? [existing.imageUrl] : [];
      form.reset({
        productName: existing.productName,
        price: existing.price,
        description: existing.description,
        imageUrl: existing.imageUrl ?? "",
        template: existing.template as "classic" | "bold" | "minimal",
        slug: existing.slug,
        transportMode: existing.transportMode ?? "DELIVERY_COMPANY",
        deliveryInfo: existing.deliveryInfo ?? "",
        whatsappNumber: existing.whatsappNumber ?? "",
        categoryId: existing.categoryId ?? undefined,
      });
      setProductImages(images);
      const primaryOption = parseOptionGroup(existing.availableSizes, DEFAULT_PRIMARY_OPTION_LABEL);
      const secondaryOption = parseOptionGroup(existing.availableColors, DEFAULT_SECONDARY_OPTION_LABEL);
      setPrimaryOptionLabel(primaryOption.label);
      setPrimaryOptionValues(primaryOption.values);
      setPrimaryOptionDraft("");
      setSecondaryOptionLabel(secondaryOption.label);
      setSecondaryOptionValues(secondaryOption.values);
      setSecondaryOptionDraft("");
      setGalleryDisplay((existing.galleryDisplay as GalleryDisplay | undefined) ?? "carousel");
      setThemeColor(resolveFormThemeColor(existing.themeColor));
    }
  }, [existing, form]);

  const uploadImage = useUploadProductImage({
    mutation: {
      onError: () => {
        toast({ title: "تعذر رفع الصورة", variant: "destructive" });
      },
    },
  });

  const handleSaveError = (error: unknown) => {
    const apiError = readApiError(error);
    const duplicateSlugMessage = "رابط الصفحة مستخدم لمنتج آخر داخل هذا المتجر. اختر رابطًا مختلفًا.";
    const message = apiError.status === 409 ? duplicateSlugMessage : apiError.message ?? "تعذر حفظ صفحة المنتج";

    if (apiError.status === 409) {
      form.setError("slug", { type: "server", message: duplicateSlugMessage });
      form.setFocus("slug");
    }

    toast({ title: message, variant: "destructive" });
  };

  const createPage = useCreateLandingPage({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListLandingPagesQueryKey(STORE_ID) });
        toast({ title: "تم إنشاء الصفحة" });
        setLocation("/landing-pages");
      },
      onError: handleSaveError,
    },
  });

  const updatePage = useUpdateLandingPage({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListLandingPagesQueryKey(STORE_ID) });
        qc.invalidateQueries({ queryKey: getGetLandingPageQueryKey(STORE_ID, Number(pageId)) });
        toast({ title: "تم تحديث الصفحة" });
        setLocation("/landing-pages");
      },
      onError: handleSaveError,
    },
  });

  const handleImageFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = Math.max(0, 8 - productImages.length);
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length < files.length) {
      toast({ title: "الحد الأقصى 8 صور للمنتج", variant: "destructive" });
    }

    for (const file of selected) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast({ title: "الصيغ المسموحة: JPG و PNG و WEBP", variant: "destructive" });
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "حجم الصورة يجب ألا يتجاوز 5MB", variant: "destructive" });
        continue;
      }
      const data = await readFileAsDataUrl(file);
      const uploaded = await uploadImage.mutateAsync({
        storeId: STORE_ID,
        data: { fileName: file.name, contentType: file.type as UploadContentType, data },
      });
      setProductImages((current) => [...current, uploaded.url]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (url: string) => {
    setProductImages((current) => current.filter((item) => item !== url));
  };

  const onSubmit = (values: FormValues) => {
    const firstImage = productImages[0] ?? values.imageUrl ?? undefined;
    const data = {
      ...values,
      imageUrl: firstImage || undefined,
      productImages,
      availableSizes: serializeOptionGroup(primaryOptionLabel, primaryOptionValues, DEFAULT_PRIMARY_OPTION_LABEL),
      availableColors: serializeOptionGroup(secondaryOptionLabel, secondaryOptionValues, DEFAULT_SECONDARY_OPTION_LABEL),
      galleryDisplay,
      themeColor,
      deliveryInfo: values.deliveryInfo || undefined,
      whatsappNumber: values.whatsappNumber || undefined,
      categoryId: values.categoryId || undefined,
    };

    if (isEditing) {
      updatePage.mutate({ storeId: STORE_ID, pageId: Number(pageId), data });
    } else {
      createPage.mutate({ storeId: STORE_ID, data });
    }
  };

  const isPending = createPage.isPending || updatePage.isPending || uploadImage.isPending;

  return (
    <div className="min-h-full max-w-2xl mx-auto p-4 sm:p-6 pb-12">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
        <Link href="/landing-pages" className="hover:text-foreground transition-colors">صفحات المنتجات</Link>
        <ChevronRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">{isEditing ? "تعديل الصفحة" : "صفحة جديدة"}</span>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="bg-card border border-card-border rounded-lg p-5 space-y-4">
        <Field label="اسم المنتج" error={form.formState.errors.productName?.message}>
          <input data-testid="input-product-name" {...form.register("productName")} className={inputCls} />
        </Field>

        <Field label="السعر (دج)" error={form.formState.errors.price?.message}>
          <input data-testid="input-price" type="number" step="0.01" {...form.register("price", { valueAsNumber: true })} className={inputCls} />
        </Field>

        <Field label="وصف المنتج" error={form.formState.errors.description?.message}>
          <textarea data-testid="input-description" {...form.register("description")} rows={3} className={textareaCls} />
        </Field>

        <Field label="التصنيف" error={form.formState.errors.categoryId?.message}>
          <select data-testid="select-category" {...form.register("categoryId", { valueAsNumber: true })} className={inputCls}>
            {categories?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="صور المنتج" error={form.formState.errors.imageUrl?.message}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {productImages.map((url) => (
              <div key={url} className="relative aspect-square rounded-md overflow-hidden border border-card-border bg-muted">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-background/90 border border-border text-destructive flex items-center justify-center"
                  aria-label="حذف الصورة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {productImages.length < 8 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadImage.isPending}
                className="aspect-square rounded-md border border-dashed border-input bg-background hover:bg-accent transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground disabled:opacity-50"
              >
                <ImagePlus className="w-6 h-6" />
                <span className="text-xs font-medium">{uploadImage.isPending ? "رفع..." : "إضافة صورة"}</span>
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => void handleImageFiles(event.target.files)} />
          <input type="hidden" {...form.register("imageUrl")} />
        </Field>

        <section className="rounded-lg border border-card-border bg-muted/20 p-4 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">خيارات اختيار المنتج</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-5">
              أضف نوع الخيار المناسب للمنتج مثل المقاس أو اللون أو النوع. لن يظهر أي خيار للزبون إذا تركته فارغًا.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <OptionBuilder
              title="الخيار الرئيسي"
              label={primaryOptionLabel}
              values={primaryOptionValues}
              draft={primaryOptionDraft}
              fallbackLabel={DEFAULT_PRIMARY_OPTION_LABEL}
              onLabelChange={setPrimaryOptionLabel}
              onDraftChange={setPrimaryOptionDraft}
              onValuesChange={setPrimaryOptionValues}
            />
            <OptionBuilder
              title="الخيار الإضافي"
              label={secondaryOptionLabel}
              values={secondaryOptionValues}
              draft={secondaryOptionDraft}
              fallbackLabel={DEFAULT_SECONDARY_OPTION_LABEL}
              onLabelChange={setSecondaryOptionLabel}
              onDraftChange={setSecondaryOptionDraft}
              onValuesChange={setSecondaryOptionValues}
            />
          </div>
        </section>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="طريقة عرض الصور">
            <select value={galleryDisplay} onChange={(event) => setGalleryDisplay(event.target.value as GalleryDisplay)} className={inputCls}>
              <option value="carousel">سلايدر</option>
              <option value="grid">شبكة</option>
            </select>
          </Field>
          <Field label="لون صفحة الطلب">
            <select value={themeColor} onChange={(event) => setThemeColor(event.target.value)} className={inputCls}>
              {THEME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="القالب" error={form.formState.errors.template?.message}>
          <select data-testid="select-template" {...form.register("template")} className={inputCls}>
            <option value="classic">كلاسيك - متوازن</option>
            <option value="bold">جريء - صورة أكبر</option>
            <option value="minimal">بسيط - هادئ</option>
          </select>
        </Field>

        <Field label="طريقة النقل" error={form.formState.errors.transportMode?.message}>
          <div className="grid gap-2 sm:grid-cols-2">
            {TRANSPORT_OPTIONS.map((option) => {
              const selected = form.watch("transportMode") === option.value;
              return (
                <label
                  key={option.value}
                  className={`min-h-[86px] rounded-md border px-3 py-3 cursor-pointer transition-colors flex flex-col justify-center ${
                    option.value === "SHED_MED" ? "items-center text-center" : "items-start text-right"
                  } ${
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                >
                  <input
                    type="radio"
                    value={option.value}
                    {...form.register("transportMode")}
                    className="sr-only"
                  />
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground leading-5">{option.hint}</span>
                </label>
              );
            })}
          </div>
        </Field>

        <Field label="رابط الصفحة (slug)" error={form.formState.errors.slug?.message}>
          <input data-testid="input-slug" {...form.register("slug")} className={inputCls} dir="ltr" placeholder="my-product-name" />
        </Field>

        <Field label="معلومات التوصيل" error={form.formState.errors.deliveryInfo?.message}>
          <input data-testid="input-delivery-info" {...form.register("deliveryInfo")} className={inputCls} />
        </Field>

        <Field label="رقم واتساب" error={form.formState.errors.whatsappNumber?.message}>
          <input data-testid="input-whatsapp" {...form.register("whatsappNumber")} className={inputCls} dir="ltr" />
        </Field>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            data-testid="btn-submit"
            disabled={isPending}
            className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isPending ? "جاري الحفظ..." : isEditing ? "حفظ التعديلات" : "إنشاء الصفحة"}
          </button>
          <Link href="/landing-pages" className="h-9 px-4 rounded-md border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors inline-flex items-center">
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}

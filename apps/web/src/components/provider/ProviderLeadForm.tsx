import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const businessTypes = [
  "ملابس وأحذية",
  "إكسسوارات ومجوهرات",
  "مستحضرات تجميل",
  "إلكترونيات",
  "ديكور ومنزل",
  "منتجات أخرى",
];

const wilayas = [
  "01 - أدرار",
  "02 - الشلف",
  "03 - الأغواط",
  "04 - أم البواقي",
  "05 - باتنة",
  "06 - بجاية",
  "07 - بسكرة",
  "08 - بشار",
  "09 - البليدة",
  "10 - البويرة",
  "11 - تمنراست",
  "12 - تبسة",
  "13 - تلمسان",
  "14 - تيارت",
  "15 - تيزي وزو",
  "16 - الجزائر",
  "17 - الجلفة",
  "18 - جيجل",
  "19 - سطيف",
  "20 - سعيدة",
  "21 - سكيكدة",
  "22 - سيدي بلعباس",
  "23 - عنابة",
  "24 - قالمة",
  "25 - قسنطينة",
  "26 - المدية",
  "27 - مستغانم",
  "28 - المسيلة",
  "29 - معسكر",
  "30 - ورقلة",
  "31 - وهران",
  "32 - البيض",
  "33 - إليزي",
  "34 - برج بوعريريج",
  "35 - بومرداس",
  "36 - الطارف",
  "37 - تندوف",
  "38 - تيسمسيلت",
  "39 - الوادي",
  "40 - خنشلة",
  "41 - سوق أهراس",
  "42 - تيبازة",
  "43 - ميلة",
  "44 - عين الدفلى",
  "45 - النعامة",
  "46 - عين تموشنت",
  "47 - غرداية",
  "48 - غليزان",
  "49 - تيميمون",
  "50 - برج باجي مختار",
  "51 - أولاد جلال",
  "52 - بني عباس",
  "53 - عين صالح",
  "54 - عين قزام",
  "55 - تقرت",
  "56 - جانت",
  "57 - المغير",
  "58 - المنيعة",
];

const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeStoreSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/g, "")
    .slice(0, 48);
}

interface ProviderLeadFormProps {
  submitLabel?: string;
  onSubmitted?: () => void;
}

export default function ProviderLeadForm({
  submitLabel = "اطلب متجرك الآن",
  onSubmitted,
}: ProviderLeadFormProps) {
  const { toast } = useToast();
  const [businessType, setBusinessType] = useState("");
  const [wilaya, setWilaya] = useState("");
  const [sellingStatus, setSellingStatus] = useState("yes");
  const [storeSlug, setStoreSlug] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const fullName = String(formData.get("fullName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const storeName = String(formData.get("storeName") ?? "").trim();
    const safeStoreSlug = normalizeStoreSlug(
      String(formData.get("storeSlug") ?? ""),
    );
    const notes = String(formData.get("notes") ?? "").trim();

    if (
      !fullName ||
      !phone ||
      !email ||
      !storeName ||
      !safeStoreSlug ||
      !businessType ||
      !wilaya ||
      !sellingStatus
    ) {
      toast({
        title: "أكمل بيانات الطلب",
        description:
          "الاسم والهاتف والبريد واسم المتجر ورابط المتجر ونوع النشاط والولاية مطلوبة.",
        variant: "destructive",
      });
      return;
    }

    if (safeStoreSlug.length < 3 || !STORE_SLUG_PATTERN.test(safeStoreSlug)) {
      toast({
        title: "رابط المتجر غير صحيح",
        description:
          "استعمل أحرفًا إنجليزية صغيرة وأرقامًا وشرطات فقط، مثل miral-decorations.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/provider/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          email,
          storeName,
          storeSlug: safeStoreSlug,
          businessType,
          wilaya,
          sellingStatus,
          notes,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "تعذر إرسال الطلب");
      }

      toast({
        title: "تم استلام طلبك بنجاح!",
        description: "سيتواصل معك فريقنا خلال 24 ساعة.",
      });
      form.reset();
      setBusinessType("");
      setWilaya("");
      setSellingStatus("yes");
      setStoreSlug("");
      onSubmitted?.();
    } catch (error) {
      toast({
        title: "تعذر إرسال الطلب",
        description:
          error instanceof Error ? error.message : "حاول مرة أخرى بعد قليل.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="fullName"
            className="text-sm font-bold text-foreground"
          >
            الاسم الكامل
          </Label>
          <Input
            id="fullName"
            name="fullName"
            required
            placeholder="محمد أمين"
            className="h-12 rounded-xl border-border bg-background/80 shadow-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-bold text-foreground">
            رقم الهاتف
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="0550 00 00 00"
            className="h-12 rounded-xl border-border bg-background/80 text-left shadow-sm"
            dir="ltr"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-bold text-foreground">
            البريد الإلكتروني
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="merchant@example.com"
            className="h-12 rounded-xl border-border bg-background/80 text-left shadow-sm"
            dir="ltr"
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="storeName"
            className="text-sm font-bold text-foreground"
          >
            اسم المتجر المقترح
          </Label>
          <Input
            id="storeName"
            name="storeName"
            required
            placeholder="متجر الأناقة"
            className="h-12 rounded-xl border-border bg-background/80 shadow-sm"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label
            htmlFor="storeSlug"
            className="text-sm font-bold text-foreground"
          >
            رابط المتجر باللاتينية
          </Label>
          <Input
            id="storeSlug"
            name="storeSlug"
            required
            minLength={3}
            maxLength={48}
            value={storeSlug}
            onChange={(event) =>
              setStoreSlug(normalizeStoreSlug(event.target.value))
            }
            placeholder="miral-decorations"
            className="h-12 rounded-xl border-border bg-background/80 text-left shadow-sm"
            dir="ltr"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            أحرف إنجليزية صغيرة وأرقام وشرطة فقط. يظهر الرابط مثل:
            /s/miral-decorations
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-bold text-foreground">
            نوع نشاطك التجاري
          </Label>
          <Select value={businessType} onValueChange={setBusinessType}>
            <SelectTrigger className="h-12 rounded-xl border-border bg-background/80 shadow-sm">
              <SelectValue placeholder="اختر نوع المنتجات" />
            </SelectTrigger>
            <SelectContent>
              {businessTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-bold text-foreground">الولاية</Label>
          <Select value={wilaya} onValueChange={setWilaya}>
            <SelectTrigger className="h-12 rounded-xl border-border bg-background/80 shadow-sm">
              <SelectValue placeholder="اختر ولايتك" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {wilayas.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Label className="block text-sm font-bold text-foreground">
          هل تبيع أونلاين حاليًا؟
        </Label>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { value: "yes", label: "نعم، أبيع يوميًا" },
            { value: "sometimes", label: "أحيانًا" },
            { value: "no", label: "لا، أريد البدء" },
          ].map((option) => (
            <label
              key={option.value}
              className="relative flex min-h-20 cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-background/80 px-3 py-4 text-center shadow-sm transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]"
            >
              <input
                type="radio"
                name="sellingStatus"
                value={option.value}
                checked={sellingStatus === option.value}
                onChange={() => setSellingStatus(option.value)}
                className="sr-only"
              />
              <span className="text-sm font-semibold leading-tight">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes" className="text-sm font-bold text-foreground">
          ملاحظات اختيارية
        </Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="اكتب أي تفاصيل تساعدنا على تجهيز المتجر"
          className="w-full rounded-2xl border border-input bg-background/80 px-3 py-3 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 h-14 w-full rounded-2xl bg-primary text-lg font-bold shadow-[0_18px_42px_rgba(245,158,11,0.25)] hover:bg-primary/90"
      >
        {isSubmitting ? "جاري الإرسال..." : submitLabel}
      </Button>
    </form>
  );
}

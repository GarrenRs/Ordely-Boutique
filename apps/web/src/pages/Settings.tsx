import { useStoreId, useAuth } from "@/context/AuthContext";
import { useGetStore, useUpdateStore, getGetStoreQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, type ChangeEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { Store, User, Lock, Save, Upload, X } from "lucide-react";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type AllowedLogoType = (typeof ALLOWED_LOGO_TYPES)[number];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
    reader.readAsDataURL(file);
  });
}

const TABS = [
  { id: "store", label: "المتجر", icon: Store },
  { id: "account", label: "الحساب", icon: User },
  { id: "security", label: "كلمة المرور", icon: Lock },
];

function Field({
  label, value, onChange, placeholder, dir, type,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; dir?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1.5">{label}</label>
      <input
        type={type ?? "text"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        dir={dir}
        className="w-full h-9 bg-background border border-input rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function Settings() {
  const STORE_ID = useStoreId();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("store");

  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const { data: store, isLoading } = useGetStore(STORE_ID, {
    query: { queryKey: getGetStoreQueryKey(STORE_ID) },
  });

  const updateStore = useUpdateStore({
    mutation: {
      onSuccess: (updated) => {
        qc.invalidateQueries({ queryKey: getGetStoreQueryKey(STORE_ID) });
        toast({ title: "تم حفظ إعدادات المتجر" });
        if (updated.name) setStoreName(updated.name);
        setLogoUrl(updated.logoUrl ?? "");
      },
      onError: () => toast({ title: "حدث خطأ أثناء الحفظ", variant: "destructive" }),
    },
  });

  useEffect(() => {
    if (store) {
      setStoreName(store.name ?? "");
      setOwnerName(store.ownerName ?? "");
      setPhone(store.phone ?? "");
      setCity(store.city ?? "");
      setLogoUrl(store.logoUrl ?? "");
    }
  }, [store]);

  const handleSaveStore = () => {
    updateStore.mutate({
      storeId: STORE_ID,
      data: { name: storeName, ownerName, phone, city },
    });
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_LOGO_TYPES.includes(file.type as AllowedLogoType)) {
      toast({ title: "الرجاء رفع صورة بصيغة PNG أو JPG أو WEBP", variant: "destructive" });
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      toast({ title: "حجم الصورة يجب أن لا يتجاوز 5MB", variant: "destructive" });
      return;
    }

    setLogoUploading(true);
    try {
      const data = await readFileAsDataUrl(file);
      const uploadRes = await fetch(`/api/stores/${STORE_ID}/uploads/store-logo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          data,
        }),
      });
      const payload = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || typeof payload.url !== "string") {
        throw new Error(payload.error ?? "تعذر رفع أيقونة المتجر");
      }

      await updateStore.mutateAsync({
        storeId: STORE_ID,
        data: { logoUrl: payload.url },
      });
    } catch (err: unknown) {
      toast({
        title: err instanceof Error ? err.message : "تعذر رفع أيقونة المتجر",
        variant: "destructive",
      });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    updateStore.mutate({
      storeId: STORE_ID,
      data: { logoUrl: null },
    });
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) {
      toast({ title: "كلمات المرور غير متطابقة", variant: "destructive" });
      return;
    }
    if (newPw.length < 6) {
      toast({ title: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", variant: "destructive" });
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "حدث خطأ");
      toast({ title: "تم تغيير كلمة المرور بنجاح" });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      toast({
        title: err instanceof Error ? err.message : "حدث خطأ",
        variant: "destructive",
      });
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-foreground mb-5">الإعدادات</h1>

      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "store" && (
        <div className="bg-card border border-card-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">بيانات المتجر</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-9 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-background/70 p-4">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                  <div className="h-[90px] w-[90px] rounded-3xl border border-white/10 bg-[#050814] shadow-[0_18px_45px_rgba(0,0,0,0.18)] flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      <img src={logoUrl} alt={storeName || "أيقونة المتجر"} className="h-full w-full object-contain p-2" />
                    ) : (
                      <Store className="h-9 w-9 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-center sm:text-right">
                    <h3 className="text-sm font-bold text-foreground">أيقونة المتجر</h3>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      تظهر هذه الأيقونة في واجهة المتجر العامة بدل الأيقونة الافتراضية. يبقى شعار Ordely في الفوتر فقط.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgba(245,158,11,0.18)] transition-colors hover:bg-primary/90 aria-disabled:pointer-events-none aria-disabled:opacity-60">
                        <Upload className="h-4 w-4" />
                        {logoUploading ? "جاري الرفع..." : "رفع أيقونة"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={logoUploading || updateStore.isPending}
                          onChange={handleLogoUpload}
                        />
                      </label>
                      {logoUrl && (
                        <button
                          type="button"
                          disabled={logoUploading || updateStore.isPending}
                          onClick={handleRemoveLogo}
                          className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                          إزالة
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <Field label="اسم المتجر" value={storeName} onChange={setStoreName} placeholder="متجر الأناقة" />
              <Field label="اسم صاحب المتجر" value={ownerName} onChange={setOwnerName} placeholder="أحمد العمري" />
              <Field label="رقم الجوال" value={phone} onChange={setPhone} placeholder="05XXXXXXXX" dir="ltr" />
              <Field label="المدينة" value={city} onChange={setCity} placeholder="الجزائر" />
              <button
                disabled={updateStore.isPending}
                onClick={handleSaveStore}
                className="flex items-center gap-2 px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {updateStore.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
              </button>
            </>
          )}
        </div>
      )}

      {tab === "account" && (
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">معلومات الحساب</h2>
          <div>
            <InfoRow label="البريد الإلكتروني" value={user?.email ?? "-"} />
            <InfoRow label="المتجر المرتبط" value={user?.storeName ?? "-"} />
            <InfoRow label="رقم المتجر" value={String(STORE_ID)} />
          </div>
        </div>
      )}

      {tab === "security" && (
        <div className="bg-card border border-card-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">تغيير كلمة المرور</h2>
          <Field label="كلمة المرور الحالية" type="password" value={currentPw} onChange={setCurrentPw} />
          <Field label="كلمة المرور الجديدة" type="password" value={newPw} onChange={setNewPw} placeholder="6 أحرف على الأقل" />
          <Field label="تأكيد كلمة المرور الجديدة" type="password" value={confirmPw} onChange={setConfirmPw} />
          <button
            disabled={pwLoading || !currentPw || !newPw || !confirmPw}
            onClick={handleChangePassword}
            className="flex items-center gap-2 px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Lock className="w-4 h-4" />
            {pwLoading ? "جاري التغيير..." : "تغيير كلمة المرور"}
          </button>
        </div>
      )}
    </div>
  );
}

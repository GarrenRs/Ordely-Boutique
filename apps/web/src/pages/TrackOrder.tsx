import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  PackageSearch,
  RotateCcw,
  Search,
} from "lucide-react";
import { useTrackOrderStatus } from "@workspace/api-client-react";
import { ApiError } from "@workspace/api-client-react";
import type { OrderTracking } from "@workspace/api-client-react";
import StatusBadge from "@/components/StatusBadge";
import brandLogo from "@/assets/brand/logo.png";

function dateLabel(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("ar-SA-u-nu-latn");
}

type TrackView = "idle" | "loading" | "success" | "not-found" | "rate-limit" | "error";

const inputCls = "w-full h-11 bg-background border border-input rounded-md px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const labelCls = "text-xs font-semibold text-muted-foreground block mb-1.5";

export default function TrackOrder() {
  const search = useSearch();
  const [initialOrderId, setInitialOrderId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [result, setResult] = useState<OrderTracking | null>(null);
  const [view, setView] = useState<TrackView>("idle");

  useEffect(() => {
    const params = new URLSearchParams(search.replace(/^\?/, ""));
    const raw = params.get("orderId");
    if (raw && !Number.isNaN(Number(raw)) && Number(raw) > 0) {
      setOrderId(raw);
      setInitialOrderId(raw);
      setView("idle");
    }
  }, [search]);

  const trackMutation = useTrackOrderStatus({
    mutation: {
      onSuccess: (tracked) => {
        setResult(tracked);
        setView("success");
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          if (error.status === 404) {
            setView("not-found");
            return;
          }
          if (error.status === 429) {
            setView("rate-limit");
            return;
          }
        }
        setView("error");
      },
    },
  });

  const reset = () => {
    setView("idle");
    setResult(null);
    setFieldError("");
    setPhone("");
    setOrderId(initialOrderId);
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedOrderId = orderId.trim();
    const trimmedPhone = phone.trim();
    const numericOrderId = Number(trimmedOrderId);

    if (!/^\d+$/.test(trimmedOrderId) || !Number.isInteger(numericOrderId) || numericOrderId <= 0) {
      setFieldError("أدخل رقم طلب صحيح (أرقام فقط)");
      return;
    }
    if (!trimmedPhone) {
      setFieldError("أدخل رقم الهاتف");
      return;
    }

    setFieldError("");
    setResult(null);
    setView("loading");
    trackMutation.mutate({ data: { orderId: numericOrderId, phone: trimmedPhone } });
  };

  return (
    <div className="min-h-screen bg-[#050814] text-foreground" dir="rtl">
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" className="mb-4 inline-flex items-center justify-center rounded-2xl border border-white/10 bg-black px-4 py-2 shadow-[0_0_24px_rgba(245,158,11,0.12)]">
            <img src={brandLogo} alt="Ordely" className="h-7 w-auto max-w-[8rem] object-contain" />
          </Link>
          <h1 className="text-2xl font-black text-white">تتبع طلبك</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">أدخل رقم الطلب ورقم الهاتف لمعرفة حالة طلبك الحالية.</p>
        </div>

        {view === "idle" || view === "loading" ? (
          <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-white/10 bg-card/60 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.25)] backdrop-blur">
            <div>
              <label className={labelCls}>رقم الطلب *</label>
              <input
                data-testid="track-order-id"
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
                className={`${inputCls} text-right`}
                dir="ltr"
                inputMode="numeric"
                placeholder="مثال: 43"
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelCls}>رقم الهاتف *</label>
              <input
                data-testid="track-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={`${inputCls} text-left`}
                type="tel"
                dir="ltr"
                placeholder="05XXXXXXXX"
                autoComplete="tel"
              />
            </div>

            {fieldError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {fieldError}
              </div>
            )}

            <button
              type="submit"
              data-testid="btn-track-order"
              disabled={trackMutation.isPending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#f59e0b] text-sm font-bold text-white shadow-[0_14px_26px_rgba(245,158,11,0.25)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {trackMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
              {trackMutation.isPending ? "جارٍ التتبع..." : "تتبع الطلب"}
            </button>
          </form>
        ) : null}

        {view === "loading" ? (
          <p className="mt-4 text-center text-sm text-slate-400">نستعلم عن حالة الطلب...</p>
        ) : null}

        {view === "success" && result ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-card/60 p-5" data-testid="track-result">
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="text-sm font-semibold text-emerald-300">تم العثور على طلبك</span>
            </div>
            <div className="space-y-3 pt-1 text-sm">
              <Row label="رقم الطلب" value={`#${result.orderId}`} />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-400">الحالة</span>
                <StatusBadge status={result.status} />
              </div>
              <Row label="تاريخ الطلب" value={dateLabel(result.createdAt)} />
              <Row label="آخر تحديث" value={dateLabel(result.updatedAt)} />
              {result.deliveredAt && <Row label="تاريخ التسليم" value={dateLabel(result.deliveredAt)} />}
              {result.returnedAt && <Row label="تاريخ الإرجاع" value={dateLabel(result.returnedAt)} />}
            </div>
            <button
              type="button"
              data-testid="btn-track-another"
              onClick={reset}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/12 bg-white/8 text-sm font-semibold text-white transition-colors hover:border-primary/60 hover:text-primary"
            >
              <RotateCcw className="h-4 w-4" />
              تتبع طلب آخر
            </button>
          </div>
        ) : null}

        {view === "not-found" ? (
          <div className="flex flex-col items-center rounded-2xl border border-destructive/20 bg-destructive/10 p-6 text-center">
            <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
            <p className="text-sm font-semibold text-white">الطلب غير موجود</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">تأكد من رقم الطلب ورقم الهاتف، أو تابع تتبع طلب آخر.</p>
            <button
              type="button"
              data-testid="btn-track-retry"
              onClick={reset}
              className="mt-4 h-10 rounded-md border border-white/12 bg-white/8 px-5 text-sm font-semibold text-white transition-colors hover:border-primary/60 hover:text-primary"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : null}

        {view === "rate-limit" ? (
          <div className="flex flex-col items-center rounded-2xl border border-amber-400/25 bg-amber-500/10 p-6 text-center">
            <AlertCircle className="mb-3 h-8 w-8 text-amber-500" />
            <p className="text-sm font-semibold text-white">طلبات كثيرة</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">لقد تجاوزت عدد محاولات التتبع المسموحة. حاول مرة أخرى بعد بضع دقائق.</p>
          </div>
        ) : null}

        {view === "error" ? (
          <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-card/60 p-6 text-center">
            <AlertCircle className="mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm font-semibold text-white">حدث خطأ غير متوقع</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">تعذر الاتصال بالخدمة الآن. أعد المحاولة لاحقاً.</p>
            <button
              type="button"
              data-testid="btn-track-error-retry"
              onClick={reset}
              className="mt-4 h-10 rounded-md border border-white/12 bg-white/8 px-5 text-sm font-semibold text-white transition-colors hover:border-primary/60 hover:text-primary"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : null}

        <div className="mt-10 text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition-colors hover:text-primary">
            <PackageSearch className="h-4 w-4" />
            العودة إلى الصفحة الرئيسية
          </Link>
        </div>
      </div>

      <footer className="border-t border-white/10 px-4 py-8 text-center">
        <span className="inline-flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
          <span className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-black px-4 py-2 shadow-[0_0_24px_rgba(245,158,11,0.12)]">
            <img src={brandLogo} alt="Ordely" className="h-8 w-auto max-w-[9.5rem] object-contain" />
          </span>
          <span>Powered by Ordely</span>
        </span>
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold text-slate-400">{label}</span>
      <span className="text-white tabular-nums">{value}</span>
    </div>
  );
}
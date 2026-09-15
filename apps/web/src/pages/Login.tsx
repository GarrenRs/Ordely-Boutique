import { type FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Home,
  Loader2,
  LogIn,
  MessageCircle,
} from "lucide-react";
import ProviderLeadForm from "@/components/provider/ProviderLeadForm";
import brandIcon from "@/assets/brand/icon.png";
import brandLogo from "@/assets/brand/logo.png";

type LoginView = "login" | "apply" | "success";

function viewFromHash(): LoginView {
  if (typeof window === "undefined") return "login";
  if (window.location.hash === "#apply") return "apply";
  if (window.location.hash === "#success") return "success";
  return "login";
}

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<LoginView>(() => viewFromHash());

  useEffect(() => {
    const syncHash = () => setView(viewFromHash());
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const showApplyForm = () => {
    window.history.replaceState(null, "", "/login#apply");
    setView("apply");
    setError("");
  };

  const showLoginForm = () => {
    window.history.replaceState(null, "", "/login");
    setView("login");
    setError("");
  };

  const showSuccessView = () => {
    window.history.replaceState(null, "", "/login#success");
    setView("success");
    setError("");
  };

  const goHome = () => {
    setLocation("/");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      setLocation("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  const isApply = view === "apply";
  const isSuccess = view === "success";
  const title =
    view === "login"
      ? "نظام الطلبات"
      : isApply
        ? "اطلب متجرًا جديدًا"
        : "تم استلام طلبك";
  const description =
    view === "login"
      ? "سجّل دخولك لإدارة متجرك"
      : isApply
        ? "املأ بياناتك وسنراجع الطلب قبل تجهيز المتجر"
        : "طلب المتجر قيد المراجعة والتأكيد";

  return (
    <div
      className="min-h-screen bg-[#050814] bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.14),_transparent_34rem)] flex items-center justify-center p-4"
      dir="rtl"
    >
      <div
        className={`w-full transition-[max-width] duration-200 ${isApply ? "max-w-3xl" : isSuccess ? "max-w-md" : "max-w-sm"}`}
      >
        <div className="mb-5 flex justify-center">
          <button
            type="button"
            onClick={goHome}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white/80 shadow-sm backdrop-blur transition-colors hover:border-primary/45 hover:bg-primary/15 hover:text-white"
          >
            <Home className="h-4 w-4" />
            العودة للواجهة الرئيسية
          </button>
        </div>

        <div className="flex flex-col items-center mb-8">
          {view === "login" ? (
            <div className="mb-5 flex h-[90px] w-[90px] items-center justify-center rounded-3xl border border-white/10 bg-[#050814] shadow-[0_18px_44px_rgba(2,6,23,0.22)]">
              <img
                src={brandIcon}
                alt="Ordely"
                className="h-16 w-16 object-contain"
              />
            </div>
          ) : (
            <div className="mb-5 inline-flex min-h-[88px] items-center justify-center rounded-3xl border border-white/10 bg-[#050814] px-6 py-4 shadow-[0_18px_44px_rgba(2,6,23,0.22)]">
              <img
                src={brandLogo}
                alt="Ordely"
                className="h-14 w-auto max-w-[240px] object-contain sm:h-16"
              />
            </div>
          )}
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <p className="text-sm text-slate-300 mt-1 text-center">
            {description}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-card/95 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur sm:p-7">
          {view === "login" ? (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    البريد الإلكتروني
                  </label>
                  <input
                    data-testid="input-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    className="w-full h-10 bg-background border border-input rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
                    placeholder="admin@store.com"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    كلمة المرور
                  </label>
                  <div className="relative">
                    <input
                      data-testid="input-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      className="w-full h-10 bg-background border border-input rounded-lg pr-3 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <button
                  data-testid="btn-login"
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "جاري التحقق..." : "تسجيل الدخول"}
                </button>
              </form>

              <div className="mt-5 border-t border-border pt-5 text-center">
                <p className="text-xs text-muted-foreground mb-3">
                  ليس لديك متجر بعد؟
                </p>
                <button
                  type="button"
                  onClick={showApplyForm}
                  className="w-full h-10 rounded-lg border border-primary/35 bg-primary/10 text-sm font-bold text-primary hover:bg-primary/15 transition-colors"
                >
                  احصل على متجر جديد
                </button>
              </div>
            </>
          ) : isApply ? (
            <>
              <ProviderLeadForm
                submitLabel="اطلب متجرك الآن"
                onSubmitted={showSuccessView}
              />
              <div className="mt-5 border-t border-border pt-5 text-center">
                <button
                  type="button"
                  onClick={showLoginForm}
                  className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  لديك متجر؟ العودة إلى تسجيل الدخول
                </button>
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-500 shadow-[0_18px_44px_rgba(16,185,129,0.16)]">
                <CheckCircle2 className="h-10 w-10" />
              </div>

              <div className="mt-6 space-y-2">
                <h2 className="text-xl font-bold text-foreground">
                  طلبك قيد المراجعة
                </h2>
                <p className="mx-auto max-w-sm text-sm leading-7 text-muted-foreground">
                  تم استلام معلومات المتجر بنجاح. سنراجع البيانات ونتواصل معك
                  لتأكيد الطلب وتجهيز المتجر بالطريقة المناسبة.
                </p>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <a
                  href="https://wa.me/213549990984"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-600"
                >
                  <MessageCircle className="h-4 w-4" />
                  تواصل عبر واتساب
                </a>
                <button
                  type="button"
                  onClick={showLoginForm}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-bold text-foreground transition-colors hover:bg-accent"
                >
                  <LogIn className="h-4 w-4" />
                  تسجيل الدخول
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

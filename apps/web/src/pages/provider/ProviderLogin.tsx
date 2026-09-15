import { useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useProviderAuth } from "@/context/ProviderAuthContext";
import brandIcon from "@/assets/brand/icon.png";

export default function ProviderLogin() {
  const { login } = useProviderAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) return;
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      setLocation("/provider");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-5 flex h-[90px] w-[90px] items-center justify-center rounded-3xl border border-white/10 bg-[#050814] shadow-[0_18px_44px_rgba(2,6,23,0.22)]">
            <img src={brandIcon} alt="Ordely" className="h-16 w-16 object-contain" />
          </div>
          <h1 className="text-xl font-bold text-foreground">لوحة مزود المتاجر</h1>
          <p className="text-sm text-muted-foreground mt-1">دخول إدارة المتاجر والتجار</p>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">البريد الإلكتروني</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="w-full h-10 bg-background border border-input rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
                placeholder="provider@example.com"
                dir="ltr"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full h-10 bg-background border border-input rounded-lg pr-3 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "جاري التحقق..." : "تسجيل الدخول"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

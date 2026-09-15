import { useLocation } from "wouter";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Clock,
  MessageCircle,
  PackageCheck,
  Phone,
  Send,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import createProductImage from "@/assets/merchant-landing/create product.png";
import dashboardImage from "@/assets/merchant-landing/dashboard.png";
import orderImage from "@/assets/merchant-landing/Order.png";
import productLandingImage from "@/assets/merchant-landing/product landing page.png";
import brandIcon from "@/assets/brand/icon.png";
import brandLogo from "@/assets/brand/logo.png";

const whatsappUrl = "https://wa.me/213549990984";
const showcaseStorePath = "/s/ordely-showcase";

const pains = [
  {
    icon: MessageCircle,
    title: "طلبات تضيع في الرسائل",
    desc: "تفقد زبائن بدون أن تشعر.",
  },
  {
    icon: Truck,
    title: "أخطاء في التوصيل",
    desc: "الولايات والعناوين تسبب مشاكل يومية.",
  },
  {
    icon: Clock,
    title: "تأخر في الرد",
    desc: "الزبون يذهب لمتجر آخر بسرعة.",
  },
  {
    icon: ClipboardList,
    title: "فوضى في المتابعة",
    desc: "لا تعرف أي طلب تم تأكيده.",
  },
  {
    icon: AlertTriangle,
    title: "ضغط طوال اليوم",
    desc: "كل شيء يدوي ومتعب.",
  },
];

const flow = [
  {
    image: createProductImage,
    icon: ShoppingBag,
    title: "أنشئ صفحة منتج جاهزة خلال دقائق",
    desc: "شارك الرابط مباشرة مع زبائنك.",
  },
  {
    image: productLandingImage,
    icon: Send,
    title: "الزبون يطلب بطريقة منظمة وواضحة",
    desc: "كل المعلومات تصل مرتبة بدون رسائل عشوائية.",
  },
  {
    image: orderImage,
    icon: PackageCheck,
    title: "تابع كل طلباتك من مكان واحد",
    desc: "تعرف حالة كل طلب بسهولة من التأكيد حتى التسليم.",
  },
];

const startSteps = ["اطلب متجرك", "أضف منتجاتك", "ابدأ استقبال الطلبات"];

export default function ProviderApply() {
  const [, setLocation] = useLocation();

  const openLeadForm = () => {
    setLocation("/login#apply");
  };

  const openLogin = () => {
    setLocation("/login");
  };

  const openShowcaseStore = () => {
    setLocation(showcaseStorePath);
  };

  const scrollToFlow = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="fixed top-0 z-50 w-full border-b border-primary/20 bg-[#050814]/95 text-white shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2 text-xl font-black">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black shadow-[0_0_22px_rgba(245,158,11,0.14)]">
              <img src={brandIcon} alt="Ordely" className="h-10 w-10 object-contain" />
            </span>
            <span>Ordely</span>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <Button
              variant="ghost"
              onClick={openShowcaseStore}
              className="font-bold text-white/80 hover:bg-white/10 hover:text-white"
            >
              متجر تجريبي
            </Button>
            <Button
              variant="ghost"
              onClick={openLogin}
              className="font-bold text-white/80 hover:bg-white/10 hover:text-white"
            >
              تسجيل الدخول
            </Button>
            <Button
              onClick={openLeadForm}
              className="bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
            >
              اطلب متجرك
            </Button>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-primary/80 to-transparent shadow-[0_0_18px_rgba(245,158,11,0.8)]" />
      </header>

      <section className="relative overflow-hidden bg-[#050814] pt-32 pb-16 text-white lg:pt-44 lg:pb-24">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-[#07101f] to-[#02040a]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-primary/60 to-transparent" />

        <div className="relative z-10 mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-3xl text-center">
            <img src={brandLogo} alt="Ordely" className="mx-auto mb-8 h-16 w-auto max-w-[240px] object-contain md:h-20 md:max-w-[300px]" />

            <h1 className="text-4xl font-black leading-tight tracking-tight md:text-6xl lg:text-7xl">
              تعبت من ضياع الطلبات
              <br className="hidden md:block" />
              <span className="bg-gradient-to-l from-primary to-orange-300 bg-clip-text text-transparent"> داخل الرسائل؟</span>
            </h1>

            <p className="mx-auto mt-6 mb-9 max-w-xl text-lg leading-8 text-slate-300 md:text-xl">
              نظّم طلباتك وتوصيلك من مكان واحد بسهولة.
            </p>

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                onClick={openLeadForm}
                className="h-14 w-full bg-primary px-8 text-lg font-bold text-primary-foreground shadow-[0_0_40px_rgba(245,158,11,0.35)] hover:bg-primary/90 sm:w-auto"
              >
                ابدأ تنظيم طلباتك
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={scrollToFlow}
                className="h-14 w-full border-white/25 bg-white/10 px-8 text-lg font-bold text-white hover:bg-white/15 hover:text-white sm:w-auto"
              >
                شاهد كيف يعمل النظام
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={openShowcaseStore}
                className="h-14 w-full gap-2 border-primary/40 bg-primary/10 px-8 text-lg font-bold text-primary hover:bg-primary/15 hover:text-primary sm:w-auto"
              >
                <Store className="h-5 w-5" />
                تصفح متجرًا تجريبيًا
              </Button>
            </div>

            <div className="relative mx-auto mt-14 max-w-4xl">
              <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-b from-primary/14 via-primary/6 to-transparent blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
                <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#1e2a3a] px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
                  <div className="mx-3 flex h-5 flex-1 items-center rounded bg-white/5 px-2 text-[10px] text-white/30">
                    الطلبات المرتبة
                  </div>
                </div>
                <img src={dashboardImage} alt="طلبات مرتبة داخل Ordely" className="h-auto w-full object-cover object-top" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0F172A] to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">هل هذا يحدث معك كل يوم؟</h2>
            <p className="text-base leading-7 text-muted-foreground">
              عندما يبقى كل شيء داخل الرسائل، يصبح البيع متعبًا حتى لو كانت المنتجات جيدة.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            {pains.map((pain) => (
              <div key={pain.title} className="rounded-2xl border border-destructive/10 bg-card p-5 shadow-sm">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <pain.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-base font-black">{pain.title}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{pain.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative overflow-hidden bg-secondary py-20 text-secondary-foreground">
        <div className="absolute top-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <h2 className="mb-5 text-3xl font-black md:text-5xl">كيف يعمل Ordely؟</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              رحلة بسيطة: منتج واضح، طلب مرتب، متابعة بدون فوضى.
            </p>
          </div>

          <div className="space-y-8">
            {flow.map((item, index) => {
              const hasImage = "image" in item;

              return (
                <div
                  key={item.title}
                  className={
                    hasImage
                      ? `grid items-center gap-10 lg:grid-cols-2 ${index % 2 === 1 ? "lg:[&>div:first-child]:order-2" : ""}`
                      : "rounded-3xl border border-secondary-foreground/10 bg-background/70 p-6 shadow-sm backdrop-blur sm:p-8"
                  }
                >
                  <div>
                    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/15 text-primary">
                      <item.icon className="h-7 w-7" />
                    </div>
                    <h3 className="mb-4 text-3xl font-black leading-tight md:text-4xl">{item.title}</h3>
                    <p className="max-w-lg text-lg leading-8 text-muted-foreground">{item.desc}</p>
                  </div>
                  {hasImage ? (
                    <div className="relative">
                      <div className="pointer-events-none absolute -inset-3 rounded-3xl bg-primary/10 blur-2xl" />
                      <div className="relative overflow-hidden rounded-2xl border border-secondary-foreground/15 bg-[#050814] shadow-2xl">
                        <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#1e2a3a] px-4 py-2.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                          <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
                          <div className="mx-3 flex h-5 flex-1 items-center rounded bg-white/5 px-2 text-[10px] text-white/30">
                            Ordely
                          </div>
                        </div>
                        <img src={item.image} alt={item.title} className="h-auto w-full object-cover object-top" />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-card py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">كيف تبدأ؟</h2>
            <p className="text-base leading-7 text-muted-foreground">
              لا تحتاج خبرة تقنية. فقط خطوات قليلة وتبدأ في استقبال الطلبات.
            </p>
          </div>

          <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3">
            {startSteps.map((step, index) => (
              <div key={step} className="rounded-2xl border border-card-border bg-background p-6 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl font-black text-primary-foreground">
                  {index + 1}
                </div>
                <h3 className="text-xl font-black">{step}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#050814] py-20 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/18 via-[#09111f] to-[#02040a]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-primary/70 to-transparent" />
        <div className="relative z-10 mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.35)] md:p-10">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/12 px-4 py-2 text-sm font-bold text-primary">
              <Check className="h-4 w-4" />
              14 يوم مجانية للتجربة
            </div>

            <h2 className="mx-auto mb-4 max-w-2xl text-4xl font-black leading-tight md:text-5xl">
              ابدأ تنظيم تجارتك اليوم
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-base leading-8 text-slate-300 md:text-lg">
              افتح متجرك، رتب الطلبات، وخلي كل عملية بيع واضحة من أول رسالة حتى التسليم.
            </p>

            <Button
              size="lg"
              onClick={openLeadForm}
              className="h-14 bg-primary px-9 text-lg font-black text-primary-foreground shadow-[0_0_34px_rgba(245,158,11,0.35)] hover:bg-primary/90"
            >
              اطلب متجرك الآن
            </Button>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {["بدون خبرة تقنية", "دعم جزائري", "BARIDIMOB / CCP", "USDT"].map((item) => (
                <div
                  key={item}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm font-bold text-white shadow-inner"
                >
                  <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary text-slate-950">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-primary/20 bg-[#050814] py-12 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div>
              <img src={brandLogo} alt="Ordely" className="h-12 w-auto max-w-[13rem] object-contain md:h-14" />
              <p className="mt-4 max-w-xs text-sm leading-6 text-slate-300">
                Ordely يساعدك على تحويل الرسائل إلى طلبات مرتبة وواضحة.
              </p>
            </div>

            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-white transition-colors hover:text-primary">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <Phone className="h-5 w-5" />
              </div>
              <span className="font-medium">استفسر عبر واتساب</span>
            </a>
          </div>

          <div className="mt-12 border-t border-white/10 pt-8 text-center text-sm text-slate-400">
            © 2026 Ordely. جميع الحقوق محفوظة.
          </div>
        </div>
      </footer>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-24 left-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 md:bottom-8 md:left-8"
        aria-label="استفسر عبر واتساب"
      >
        <MessageCircle className="h-7 w-7" />
      </a>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/20 bg-[#050814]/95 p-4 backdrop-blur md:hidden">
        <Button onClick={openLeadForm} className="h-12 w-full bg-primary text-lg font-bold hover:bg-primary/90">
          ابدأ تنظيم طلباتك
        </Button>
      </div>
    </main>
  );
}

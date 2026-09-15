import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Loader2, MapPin, Package, Search, Store, Tag } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import brandLogo from "@/assets/brand/logo.png";

interface PublicStoreData {
  store: {
    id: number;
    slug: string;
    name: string;
    ownerName: string;
    phone: string;
    city: string;
    logoUrl: string | null;
  };
  categories: Array<{
    id: number;
    name: string;
    slug: string;
    isDefault: boolean;
  }>;
  products: Array<{
    id: number;
    categoryId: number | null;
    productName: string;
    price: number;
    description: string;
    slug: string;
    imageUrl: string | null;
    productImages: string[];
    availableSizes: string[];
    availableColors: string[];
    themeColor: string;
  }>;
}

function productImage(product: PublicStoreData["products"][number]) {
  return product.productImages[0] ?? product.imageUrl;
}

export default function PublicStorePage() {
  const { storeSlug } = useParams();
  const [activeCategory, setActiveCategory] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [heroIndex, setHeroIndex] = useState(0);

  const { data, isLoading, error } = useQuery<PublicStoreData>({
    queryKey: ["public-store", storeSlug],
    queryFn: async () => {
      const res = await fetch(`/api/public/s/${storeSlug}`);
      if (!res.ok) throw new Error("المتجر غير متاح");
      return res.json();
    },
  });

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.products ?? []).filter((product) => {
      const categoryMatch = activeCategory === "all" || product.categoryId === activeCategory;
      const searchMatch = !q || product.productName.toLowerCase().includes(q) || product.description.toLowerCase().includes(q);
      return categoryMatch && searchMatch;
    });
  }, [activeCategory, data?.products, search]);

  const heroSlides = useMemo(() => {
    return (data?.products ?? [])
      .map((product) => ({ product, image: productImage(product) }))
      .filter((slide): slide is { product: PublicStoreData["products"][number]; image: string } => Boolean(slide.image));
  }, [data?.products]);

  useEffect(() => {
    setHeroIndex(0);
  }, [storeSlug, heroSlides.length]);

  useEffect(() => {
    if (heroSlides.length < 2) return;
    const timer = window.setInterval(() => {
      setHeroIndex((index) => (index + 1) % heroSlides.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [heroSlides.length]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050814] flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#050814] flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-4">
          <AlertCircle className="w-7 h-7 text-destructive" />
        </div>
        <h1 className="text-lg font-bold text-white">المتجر غير متاح</h1>
        <p className="text-sm text-slate-400 mt-2">تحقق من رابط المتجر أو حاول لاحقا.</p>
      </div>
    );
  }

  const categoriesWithProducts = data.categories.filter((category) =>
    data.products.some((product) => product.categoryId === category.id),
  );
  const heroSlide = heroSlides[heroIndex % heroSlides.length] ?? null;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-foreground" dir="rtl">
      <header className="relative overflow-hidden border-b border-primary/20 bg-[#050814] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_-10%,rgba(245,158,11,0.16),transparent_28rem),radial-gradient(circle_at_5%_10%,rgba(59,130,246,0.12),transparent_24rem)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-primary/80 to-transparent shadow-[0_0_18px_rgba(245,158,11,0.7)]" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-14 w-14 rounded-2xl border border-white/10 bg-black flex items-center justify-center flex-shrink-0 overflow-hidden shadow-[0_0_24px_rgba(245,158,11,0.12)]">
                {data.store.logoUrl ? (
                  <img src={data.store.logoUrl} alt={data.store.name} className="w-full h-full object-contain p-1.5" />
                ) : (
                  <Store className="w-6 h-6 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xl font-black text-white truncate">{data.store.name}</p>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span>{data.store.city}</span>
                </div>
              </div>
            </div>
            <a
              href="#products"
              className="hidden sm:inline-flex h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-bold items-center shadow-[0_12px_28px_rgba(245,158,11,0.22)] hover:bg-primary/90 transition-colors"
            >
              تصفح المنتجات
            </a>
          </div>

          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-5 items-stretch py-8 sm:py-10">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 sm:p-8 flex flex-col justify-between min-h-80 backdrop-blur">
              <div>
                <p className="text-xs font-bold text-primary mb-4">معرض منتجات منظم للطلب المباشر</p>
                <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight">
                  اختر المنتج المناسب وأرسل طلبك من صفحة مخصصة.
                </h1>
                <p className="text-sm text-slate-300 leading-7 mt-5 max-w-xl">
                  منتجات المتجر مرتبة بتصنيفات واضحة. كل منتج يفتح صفحة طلب مستقلة لتسجيل بياناتك وتأكيد الطلب بسهولة.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-8">
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-2xl font-black tabular-nums text-white">{data.products.length}</p>
                  <p className="text-xs text-slate-400 mt-1">منتج</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-2xl font-black tabular-nums text-white">{categoriesWithProducts.length}</p>
                  <p className="text-xs text-slate-400 mt-1">تصنيف</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-2xl font-black text-primary">دج</p>
                  <p className="text-xs text-slate-400 mt-1">الدفع عند الاستلام</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 overflow-hidden min-h-80 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
              {heroSlide ? (
                <div className="relative h-full min-h-80">
                  <img
                    src={heroSlide.image}
                    alt={heroSlide.product.productName}
                    className="w-full h-full object-cover min-h-80 transition-opacity duration-500"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-5">
                    <p className="text-xs font-semibold text-primary">يعرض الآن</p>
                    <p className="mt-1 line-clamp-1 text-lg font-black text-white">{heroSlide.product.productName}</p>
                    <p className="mt-1 text-sm font-bold text-primary tabular-nums">{formatCurrency(heroSlide.product.price)}</p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full min-h-80 bg-black/30 flex items-center justify-center">
                  <Package className="w-12 h-12 text-slate-500" />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="relative">
        <section id="products" className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5 mb-5 shadow-[0_18px_42px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-foreground">المنتجات</h2>
                <p className="text-sm text-muted-foreground mt-1">تصفح حسب التصنيف أو ابحث باسم المنتج.</p>
              </div>
              <div className="relative w-full lg:w-80">
                <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full h-11 bg-background border border-input rounded-lg pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
                  placeholder="ابحث عن منتج"
                />
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pt-4 pb-1">
              <button
                type="button"
                onClick={() => setActiveCategory("all")}
                className={`h-9 px-4 rounded-md border text-sm font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === "all"
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_10px_22px_rgba(245,158,11,0.18)]"
                    : "bg-background text-foreground border-border hover:bg-accent"
                }`}
              >
                الكل
              </button>
              {categoriesWithProducts.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  className={`h-9 px-4 rounded-md border text-sm font-semibold whitespace-nowrap transition-colors ${
                    activeCategory === category.id
                      ? "bg-primary text-primary-foreground border-primary shadow-[0_10px_22px_rgba(245,158,11,0.18)]"
                      : "bg-background text-foreground border-border hover:bg-accent"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {visibleProducts.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl py-16 text-center bg-card">
              <Package className="w-9 h-9 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">لا توجد منتجات مطابقة</p>
              <p className="text-xs text-muted-foreground mt-1">جرّب تصنيفا آخر أو غيّر كلمة البحث.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleProducts.map((product) => {
                const image = productImage(product);
                const category = data.categories.find((item) => item.id === product.categoryId);
                return (
                  <Link
                    key={product.id}
                    href={`/s/${data.store.slug}/p/${product.slug}`}
                    className="group bg-card border border-card-border rounded-xl overflow-hidden hover:border-primary/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)]"
                  >
                    <div className="aspect-[4/3] bg-muted overflow-hidden">
                      {image ? (
                        <img src={image} alt={product.productName} className="w-full h-full object-cover group-hover:scale-[1.035] transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-10 h-10 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                        <Tag className="w-3.5 h-3.5 text-primary" />
                        <span>{category?.name ?? "عام"}</span>
                      </div>
                      <h3 className="font-bold text-foreground line-clamp-1">{product.productName}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2 leading-6">{product.description}</p>
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                        <span className="text-lg font-black text-primary tabular-nums">{formatCurrency(product.price)}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                          اطلب الآن
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-primary/15 bg-[#050814]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col items-center justify-center gap-3 text-center text-sm text-slate-300">
          <p className="font-semibold text-white">{data.store.name} · {data.store.city}</p>
          <p>صفحة طلبات منظمة وسريعة</p>
          <div className="flex flex-col items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-black px-4 py-2 shadow-[0_0_24px_rgba(245,158,11,0.12)]">
              <img src={brandLogo} alt="Ordely" className="h-8 w-auto max-w-[9.5rem] object-contain" />
            </span>
            <span>Powered by Ordely</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

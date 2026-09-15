import { useStoreId } from "@/context/AuthContext";
import {
  getGetStoreQueryKey,
  getListLandingPagesQueryKey,
  getListProductCategoriesQueryKey,
  useGetStore,
  useCreateProductCategory,
  useDeleteLandingPage,
  useDeleteProductCategory,
  useListLandingPages,
  useListProductCategories,
  useUpdateLandingPage,
  useUpdateProductCategory,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Check, Copy, ExternalLink, Pencil, Plus, Power, Tags, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import ProductImageThumb from "@/components/ProductImageThumb";

const TEMPLATE_LABELS: Record<string, string> = {
  classic: "كلاسيك",
  bold: "جريء",
  minimal: "بسيط",
};

const TRANSPORT_LABELS: Record<string, string> = {
  DELIVERY_COMPANY: "شركة توصيل",
  SHED_MED: "تسليم واستلام يدوي",
};

type PendingDelete =
  | { type: "category"; id: number; title: string; description: string }
  | { type: "page"; id: number; title: string; description: string }
  | null;

function ConfirmActionDialog({
  action,
  isPending,
  onCancel,
  onConfirm,
}: {
  action: Exclude<PendingDelete, null>;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dashboard-modal-backdrop fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-4">
      <div className="dashboard-modal-panel w-full max-w-sm bg-card border border-card-border rounded-lg shadow-lg p-5">
        <div className="w-10 h-10 rounded-md bg-destructive/10 text-destructive flex items-center justify-center mb-4">
          <Trash2 className="w-5 h-5" />
        </div>
        <h2 className="text-base font-bold text-foreground">{action.title}</h2>
        <p className="text-sm text-muted-foreground leading-6 mt-2">{action.description}</p>
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="flex-1 h-9 rounded-md bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50"
          >
            {isPending ? "جاري الحذف..." : "تأكيد الحذف"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="h-9 px-4 rounded-md border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LandingPagesList() {
  const STORE_ID = useStoreId();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const { data: store } = useGetStore(STORE_ID, {
    query: { queryKey: getGetStoreQueryKey(STORE_ID) },
  });

  const { data: pages, isLoading } = useListLandingPages(STORE_ID, {
    query: { queryKey: getListLandingPagesQueryKey(STORE_ID) },
  });
  const { data: categories } = useListProductCategories(STORE_ID, {
    query: { queryKey: getListProductCategoriesQueryKey(STORE_ID) },
  });

  const categoryMap = new Map((categories ?? []).map((category) => [category.id, category.name]));
  const productImage = (page: { productImages?: string[]; imageUrl?: string | null }) =>
    page.productImages?.[0] ?? page.imageUrl ?? null;
  const storePublicSlug = store?.slug ?? String(STORE_ID);
  const productHref = (slug: string) => `/s/${storePublicSlug}/p/${slug}`;

  const refreshCategories = () => {
    qc.invalidateQueries({ queryKey: getListProductCategoriesQueryKey(STORE_ID) });
    qc.invalidateQueries({ queryKey: getListLandingPagesQueryKey(STORE_ID) });
  };

  const deletePage = useDeleteLandingPage({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListLandingPagesQueryKey(STORE_ID) });
        toast({ title: "تم حذف الصفحة" });
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "تعذر حذف الصفحة", variant: "destructive" });
      },
    },
  });

  const updatePage = useUpdateLandingPage({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListLandingPagesQueryKey(STORE_ID) });
      },
    },
  });

  const createCategory = useCreateProductCategory({
    mutation: {
      onSuccess: () => {
        setNewCategoryName("");
        refreshCategories();
        toast({ title: "تم إنشاء التصنيف" });
      },
    },
  });

  const updateCategory = useUpdateProductCategory({
    mutation: {
      onSuccess: () => {
        setEditingCategoryId(null);
        setEditingCategoryName("");
        refreshCategories();
        toast({ title: "تم تحديث التصنيف" });
      },
    },
  });

  const deleteCategory = useDeleteProductCategory({
    mutation: {
      onSuccess: () => {
        refreshCategories();
        toast({ title: "تم حذف التصنيف ونقل منتجاته إلى عام" });
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "تعذر حذف التصنيف", variant: "destructive" });
      },
    },
  });

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}${productHref(slug)}`;
    navigator.clipboard.writeText(url)
      .then(() => toast({ title: "تم نسخ الرابط" }))
      .catch(() => toast({ title: "تعذر النسخ", variant: "destructive" }));
  };

  const toggleActive = (pageId: number, current: boolean) => {
    updatePage.mutate({
      storeId: STORE_ID,
      pageId,
      data: { isActive: !current },
    });
  };

  const createNewCategory = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    createCategory.mutate({ storeId: STORE_ID, data: { name } });
  };

  const storeHref = `/s/${storePublicSlug}`;
  const deletePending = () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === "category") {
      deleteCategory.mutate(
        { storeId: STORE_ID, categoryId: pendingDelete.id },
        { onSuccess: () => setPendingDelete(null) },
      );
      return;
    }
    deletePage.mutate(
      { storeId: STORE_ID, pageId: pendingDelete.id },
      { onSuccess: () => setPendingDelete(null) },
    );
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-foreground">صفحات المنتجات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{pages?.length ?? 0} صفحة</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={storeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-2 px-4 h-9 rounded-md border border-border bg-card text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            معاينة المتجر
          </a>
          <button
            type="button"
            data-testid="btn-categories"
            onClick={() => setCategoriesOpen(true)}
            className="flex items-center gap-2 px-4 h-9 rounded-md border border-border bg-card text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            <Tags className="w-4 h-4" />
            التصنيفات
          </button>
          <Link
            href="/landing-pages/new"
            data-testid="btn-new-page"
            className="flex items-center gap-2 px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            إنشاء صفحة
          </Link>
        </div>
      </div>

      {categoriesOpen && (
        <div className="dashboard-modal-backdrop fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="dashboard-modal-panel w-full max-w-lg bg-card border border-card-border rounded-lg shadow-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
              <div>
                <h2 className="text-base font-bold text-foreground">تصنيفات المنتجات</h2>
                <p className="text-xs text-muted-foreground mt-0.5">التصنيف الافتراضي عام وثابت لكل متجر</p>
              </div>
              <button
                type="button"
                onClick={() => setCategoriesOpen(false)}
                className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <form onSubmit={createNewCategory} className="flex gap-2">
                <input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  className="flex-1 h-9 bg-background border border-input rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
                  placeholder="اسم التصنيف"
                />
                <button
                  type="submit"
                  disabled={createCategory.isPending || !newCategoryName.trim()}
                  className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  إضافة
                </button>
              </form>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {categories?.map((category) => (
                  <div key={category.id} className="flex items-center gap-3 bg-background border border-border rounded-md px-3 py-2">
                    <div className="flex-1 min-w-0">
                      {editingCategoryId === category.id ? (
                        <input
                          value={editingCategoryName}
                          onChange={(event) => setEditingCategoryName(event.target.value)}
                          className="w-full h-8 bg-card border border-input rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{category.name}</p>
                          {category.isDefault && (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">افتراضي</span>
                          )}
                          {!category.isActive && (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold">متوقف</span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{category.productsCount ?? 0} منتج</p>
                    </div>

                    {editingCategoryId === category.id ? (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={updateCategory.isPending || !editingCategoryName.trim()}
                          onClick={() => updateCategory.mutate({ storeId: STORE_ID, categoryId: category.id, data: { name: editingCategoryName.trim() } })}
                          className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryId(null);
                            setEditingCategoryName("");
                          }}
                          className="w-8 h-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={category.isDefault}
                          onClick={() => {
                            setEditingCategoryId(category.id);
                            setEditingCategoryName(category.name);
                          }}
                          className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center disabled:opacity-40"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={category.isDefault || deleteCategory.isPending}
                          onClick={() => setPendingDelete({
                            type: "category",
                            id: category.id,
                            title: "حذف التصنيف",
                            description: "سيتم نقل المنتجات المرتبطة بهذا التصنيف إلى التصنيف العام ثم حذف التصنيف. لا يمكن التراجع عن هذه العملية.",
                          })}
                          className="w-8 h-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-lg p-5 h-44 animate-pulse" />
          ))}
        </div>
      ) : !pages || pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-lg">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Plus className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">لا توجد صفحات بعد</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">أنشئ أول صفحة منتج لاستقبال الطلبات</p>
          <Link
            href="/landing-pages/new"
            className="px-4 h-8 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center"
          >
            إنشاء صفحة
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pages.map((page) => {
            const ordersCount = page.ordersCount ?? 0;
            return (
              <div key={page.id} data-testid={`card-page-${page.id}`} className="bg-card border border-card-border rounded-lg p-5 flex flex-col gap-3">
                <ProductImageThumb src={productImage(page)} alt={page.productName} className="h-40 w-full rounded-lg" />
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${page.isActive ? "bg-emerald-500" : "bg-gray-400"}`} />
                      <span className="text-xs text-muted-foreground">
                        {page.isActive ? "نشطة" : "متوقفة"} · {TEMPLATE_LABELS[page.template] ?? page.template}
                      </span>
                    </div>
                    <p className="font-semibold text-foreground truncate">{page.productName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {categoryMap.get(page.categoryId ?? 0) ?? "عام"} · {TRANSPORT_LABELS[page.transportMode ?? "DELIVERY_COMPANY"]}
                    </p>
                    <p className="text-lg font-bold text-primary tabular-nums mt-0.5">{formatCurrency(page.price)}</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2">{page.description}</p>

                <div className="flex items-center gap-1 bg-muted/50 rounded-md px-2 py-1.5 text-xs text-muted-foreground overflow-hidden">
                  <span className="truncate flex-1">{productHref(page.slug)}</span>
                  <button onClick={() => copyLink(page.slug)} title="نسخ الرابط" className="flex-shrink-0 hover:text-foreground transition-colors p-0.5">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a href={productHref(page.slug)} target="_blank" rel="noopener noreferrer" title="معاينة" className="flex-shrink-0 hover:text-foreground transition-colors p-0.5">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">{ordersCount} طلب</span>
                  <div className="flex gap-1">
                    <button
                      data-testid={`btn-toggle-page-${page.id}`}
                      disabled={updatePage.isPending}
                      onClick={() => toggleActive(page.id, page.isActive)}
                      title={page.isActive ? "إيقاف الصفحة" : "تفعيل الصفحة"}
                      className={`h-7 w-7 rounded flex items-center justify-center transition-colors disabled:opacity-50 ${
                        page.isActive
                          ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <Link href={`/landing-pages/${page.id}`} data-testid={`btn-edit-page-${page.id}`} className="h-7 px-2.5 rounded text-xs font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors inline-flex items-center">
                      تعديل
                    </Link>
                    <button
                      data-testid={`btn-delete-page-${page.id}`}
                      disabled={deletePage.isPending || ordersCount > 0}
                      onClick={() => setPendingDelete({
                        type: "page",
                        id: page.id,
                        title: "حذف صفحة المنتج",
                        description: "سيتم حذف صفحة المنتج نهائيا. إذا كانت الصفحة تحتوي على طلبات فلن يسمح النظام بالحذف وسيطلب منك إيقافها فقط.",
                      })}
                      title={ordersCount > 0 ? "أوقف الصفحة بدل حذفها لأنها تحتوي على طلبات" : "حذف الصفحة"}
                      className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {pendingDelete && (
        <ConfirmActionDialog
          action={pendingDelete}
          isPending={deleteCategory.isPending || deletePage.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={deletePending}
        />
      )}
    </div>
  );
}

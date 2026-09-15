import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, KeyRound, Mail, Phone, Search, Store, UserPlus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "REJECTED" | "CONVERTED";

interface MerchantLead {
  id: number;
  fullName: string;
  phone: string;
  email: string;
  storeName: string;
  storeSlug: string | null;
  businessType: string;
  wilaya: string;
  sellingStatus: string;
  notes: string | null;
  convertedStoreId: number | null;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

interface ConvertedStoreResponse {
  store: {
    id: number;
    name: string;
    slug: string;
    merchantEmail: string | null;
  };
  lead: MerchantLead;
  merchantPassword: string;
}

const statusLabels: Record<LeadStatus, string> = {
  NEW: "جديد",
  CONTACTED: "تم التواصل",
  QUALIFIED: "مؤهل",
  REJECTED: "مرفوض",
  CONVERTED: "تم التحويل",
};

const statusClasses: Record<LeadStatus, string> = {
  NEW: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  CONTACTED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  QUALIFIED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  CONVERTED: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
};

const sellingStatusLabels: Record<string, string> = {
  yes: "يبيع الآن",
  sometimes: "يبيع أحيانًا",
  no: "يريد البدء",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-DZ-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ProviderLeads() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [convertedStore, setConvertedStore] = useState<ConvertedStoreResponse | null>(null);
  const queryKey = ["provider-leads"];

  const { data: leads = [], isLoading } = useQuery<MerchantLead[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch("/api/provider/leads", { credentials: "include" });
      if (!response.ok) throw new Error("تعذر تحميل طلبات التجار");
      return response.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: number; status: LeadStatus }) => {
      const response = await fetch(`/api/provider/leads/${leadId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "تعذر تحديث حالة الطلب");
      }
      return response.json() as Promise<MerchantLead>;
    },
    onSuccess: (updatedLead) => {
      queryClient.setQueryData<MerchantLead[]>(queryKey, (current = []) =>
        current.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead)),
      );
      toast({ title: "تم تحديث حالة الطلب" });
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "تعذر تحديث حالة الطلب",
        variant: "destructive",
      });
    },
  });

  const convertLead = useMutation({
    mutationFn: async (leadId: number) => {
      const response = await fetch(`/api/provider/leads/${leadId}/convert`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "تعذر إنشاء المتجر من الطلب");
      }
      return response.json() as Promise<ConvertedStoreResponse>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<MerchantLead[]>(queryKey, (current = []) =>
        current.map((lead) => (lead.id === data.lead.id ? data.lead : lead)),
      );
      queryClient.invalidateQueries({ queryKey: ["provider-stores"] });
      setConvertedStore(data);
      toast({ title: "تم إنشاء المتجر من الطلب" });
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "تعذر إنشاء المتجر من الطلب",
        variant: "destructive",
      });
    },
  });

  const visibleLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) =>
      lead.fullName.toLowerCase().includes(q) ||
      lead.phone.toLowerCase().includes(q) ||
      lead.email.toLowerCase().includes(q) ||
      lead.storeName.toLowerCase().includes(q) ||
      (lead.storeSlug ?? "").toLowerCase().includes(q) ||
      lead.businessType.toLowerCase().includes(q) ||
      lead.wilaya.toLowerCase().includes(q),
    );
  }, [leads, search]);

  const newCount = leads.filter((lead) => lead.status === "NEW").length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">طلبات التجار</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            استقبال طلبات فتح المتاجر ومراجعتها يدويًا قبل إنشاء أي متجر.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:min-w-72">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">كل الطلبات</p>
            <p className="mt-1 text-2xl font-bold">{leads.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">جديدة</p>
            <p className="mt-1 text-2xl font-bold text-primary">{newCount}</p>
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-card-border bg-card p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background pr-9 pl-3 text-right text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="ابحث بالاسم أو المتجر أو البريد أو الهاتف أو النشاط"
          />
        </div>
      </div>

      {convertedStore && (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/10">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                تم إنشاء متجر {convertedStore.store.name}
              </p>
              <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/80" dir="ltr">
                /s/{convertedStore.store.slug}
              </p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-background px-3 py-2 dark:border-emerald-800">
              <p className="text-[11px] font-semibold text-muted-foreground">كلمة مرور التاجر الجاهزة للتسليم</p>
              <p className="mt-1 font-mono text-sm font-bold text-foreground" dir="ltr">{convertedStore.merchantPassword}</p>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : visibleLeads.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <UserPlus className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">لا توجد طلبات تجار مطابقة.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleLeads.map((lead) => (
            <article key={lead.id} className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold">{lead.storeName}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[lead.status]}`}>
                      {statusLabels[lead.status]}
                    </span>
                    {lead.convertedStoreId && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        متجر منشأ
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                    {lead.storeSlug && (
                      <span className="text-foreground" dir="ltr">
                        /s/{lead.storeSlug}
                      </span>
                    )}
                    <span className="flex items-center gap-2 text-foreground">
                      <Store className="h-4 w-4" />
                      {lead.fullName}
                    </span>
                    <a href={`tel:${lead.phone}`} dir="ltr" className="flex items-center gap-2 text-foreground hover:text-primary">
                      <Phone className="h-4 w-4" />
                      {lead.phone}
                    </a>
                    <a href={`mailto:${lead.email}`} dir="ltr" className="flex items-center gap-2 text-foreground hover:text-primary">
                      <Mail className="h-4 w-4" />
                      {lead.email}
                    </a>
                    <span>{lead.businessType}</span>
                    <span>{lead.wilaya}</span>
                    <span>{sellingStatusLabels[lead.sellingStatus] ?? lead.sellingStatus}</span>
                  </div>
                  {lead.notes && (
                    <p className="mt-3 rounded-md border border-border bg-background/70 px-3 py-2 text-sm leading-6 text-muted-foreground">
                      {lead.notes}
                    </p>
                  )}
                </div>

                <div className="grid w-full shrink-0 gap-2 lg:w-52">
                  <Select
                    value={lead.status}
                    onValueChange={(status) => updateStatus.mutate({ leadId: lead.id, status: status as LeadStatus })}
                    disabled={updateStatus.isPending || Boolean(lead.convertedStoreId)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    disabled={convertLead.isPending || Boolean(lead.convertedStoreId)}
                    onClick={() => convertLead.mutate(lead.id)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <KeyRound className="h-4 w-4" />
                    {lead.convertedStoreId ? "تم الإنشاء" : "إنشاء متجر"}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>تم الاستقبال: {formatDate(lead.createdAt)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

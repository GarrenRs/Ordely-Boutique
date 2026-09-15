import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MapPin, Search, SlidersHorizontal, Truck, X } from "lucide-react";
import { useStoreId } from "@/context/AuthContext";
import { formatCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";

interface DeliveryZone {
  id: number | null;
  storeId?: number;
  wilayaCode: string;
  wilayaName: string;
  homeFee: number | null;
  officeFee: number | null;
  returnFee: number;
  isActive: boolean;
}

interface DeliveryCommune {
  id: number;
  name: string;
  dairaName: string;
  isActive: boolean;
}

interface DraftZone {
  isActive: boolean;
  homeFee: string;
  officeFee: string;
  returnFee: string;
}

const headCell = "border border-border px-3 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap";
const bodyCell = "border border-border px-3 py-3 align-middle";
const numberInput = "w-full h-9 bg-background border border-input rounded-md px-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring";

function toDraft(zone: DeliveryZone): DraftZone {
  return {
    isActive: zone.isActive,
    homeFee: zone.homeFee === null ? "" : String(zone.homeFee),
    officeFee: zone.officeFee === null ? "" : String(zone.officeFee),
    returnFee: String(zone.returnFee),
  };
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readFee(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function CommunesDialog({
  storeId,
  zone,
  onClose,
}: {
  storeId: number;
  zone: DeliveryZone;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const queryKey = ["delivery-communes", storeId, zone.wilayaCode];

  const { data: communes = [], isLoading } = useQuery<DeliveryCommune[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/stores/${storeId}/delivery-zones/${zone.wilayaCode}/communes`, { credentials: "include" });
      if (!res.ok) throw new Error("تعذر تحميل البلديات");
      return res.json();
    },
  });

  const saveCommunes = useMutation({
    mutationFn: async () => {
      const payload = {
        communes: Object.entries(changes).map(([name, isActive]) => ({ name, isActive })),
      };
      const res = await fetch(`/api/stores/${storeId}/delivery-zones/${zone.wilayaCode}/communes`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "تعذر حفظ البلديات");
      }
      return res.json() as Promise<DeliveryCommune[]>;
    },
    onSuccess: (updated) => {
      qc.setQueryData<DeliveryCommune[]>(queryKey, (current = []) => {
        const updatedMap = new Map(updated.map((commune) => [commune.name, commune]));
        return current.map((commune) => updatedMap.get(commune.name) ?? commune);
      });
      setChanges({});
      toast({ title: "تم حفظ إعدادات البلديات" });
    },
    onError: (error) => {
      toast({ title: error instanceof Error ? error.message : "تعذر حفظ البلديات", variant: "destructive" });
    },
  });

  const visibleCommunes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return communes;
    return communes.filter((commune) =>
      commune.name.toLowerCase().includes(q) || commune.dairaName.toLowerCase().includes(q),
    );
  }, [communes, search]);

  const currentActive = (commune: DeliveryCommune) => changes[commune.name] ?? commune.isActive;
  const activeCount = communes.filter((commune) => currentActive(commune)).length;
  const changedCount = Object.keys(changes).length;

  return (
    <div className="dashboard-modal-backdrop fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
      <div className="dashboard-modal-panel w-full max-w-2xl bg-card border border-card-border rounded-lg shadow-lg overflow-hidden" dir="rtl">
        <div className="px-5 py-4 border-b border-card-border flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-foreground">بلديات {zone.wilayaCode} - {zone.wilayaName}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {activeCount} مفعلة من {communes.length} بلدية
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="relative mb-4">
            <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full h-10 bg-background border border-input rounded-md pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
              placeholder="ابحث باسم البلدية أو الدائرة"
            />
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_110px] bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground">
              <div className="px-3 py-2 border-l border-border">البلدية</div>
              <div className="px-3 py-2 border-l border-border">الدائرة</div>
              <div className="px-3 py-2">الحالة</div>
            </div>
            <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(6)].map((_, index) => <div key={index} className="h-10 bg-muted rounded animate-pulse" />)}
                </div>
              ) : visibleCommunes.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">لا توجد بلديات مطابقة.</div>
              ) : (
                visibleCommunes.map((commune) => {
                  const active = currentActive(commune);
                  return (
                    <label key={commune.id} className="grid grid-cols-[1fr_1fr_110px] items-center hover:bg-accent/40 cursor-pointer">
                      <div className="px-3 py-2 border-l border-border text-sm font-medium text-foreground truncate">{commune.name}</div>
                      <div className="px-3 py-2 border-l border-border text-sm text-muted-foreground truncate">{commune.dairaName}</div>
                      <div className="px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold">
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(event) => {
                              const next = event.target.checked;
                              setChanges((current) => {
                                const updated = { ...current };
                                if (next === commune.isActive) delete updated[commune.name];
                                else updated[commune.name] = next;
                                return updated;
                              });
                            }}
                            className="w-4 h-4 accent-primary"
                          />
                          {active ? "مفعلة" : "معطلة"}
                        </span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-4">
            <p className="text-xs text-muted-foreground">{changedCount > 0 ? `${changedCount} تعديل بانتظار الحفظ` : "لا توجد تعديلات غير محفوظة"}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-md border border-border text-sm font-medium hover:bg-accent"
              >
                إغلاق
              </button>
              <button
                type="button"
                disabled={changedCount === 0 || saveCommunes.isPending}
                onClick={() => saveCommunes.mutate()}
                className="h-9 px-5 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                {saveCommunes.isPending ? "جاري الحفظ..." : "حفظ البلديات"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DeliverySystem() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<number, DraftZone>>({});
  const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(null);

  const queryKey = ["delivery-zones", storeId];
  const { data: zones = [], isLoading } = useQuery<DeliveryZone[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/stores/${storeId}/delivery-zones`, { credentials: "include" });
      if (!res.ok) throw new Error("تعذر تحميل ولايات التوصيل");
      return res.json();
    },
  });

  const updateZone = useMutation({
    mutationFn: async ({ zone, draft }: { zone: DeliveryZone; draft: DraftZone }) => {
      const payload = {
        isActive: draft.isActive,
        homeFee: toNullableNumber(draft.homeFee),
        officeFee: toNullableNumber(draft.officeFee),
        returnFee: readFee(draft.returnFee),
      };
      const res = await fetch(`/api/stores/${storeId}/delivery-zones/${zone.wilayaCode}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "تعذر حفظ الولاية");
      }
      return res.json() as Promise<DeliveryZone>;
    },
    onSuccess: (zone) => {
      qc.setQueryData<DeliveryZone[]>(queryKey, (current = []) =>
        current.map((item) => (item.wilayaCode === zone.wilayaCode ? zone : item)),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[Number(zone.wilayaCode)];
        return next;
      });
      toast({ title: "تم حفظ إعدادات الولاية" });
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "تعذر الحفظ",
        variant: "destructive",
      });
    },
  });

  const visibleZones = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((zone) =>
      zone.wilayaName.toLowerCase().includes(q) || zone.wilayaCode.includes(q),
    );
  }, [search, zones]);

  const activeCount = zones.filter((zone) => zone.isActive).length;
  const configuredCount = zones.filter((zone) => zone.officeFee !== null).length;
  const averageReturnFee = zones.length
    ? zones.reduce((sum, zone) => sum + Number(zone.returnFee ?? 0), 0) / zones.length
    : 0;

  const updateDraft = (zone: DeliveryZone, patch: Partial<DraftZone>) => {
    setDrafts((current) => ({
      ...current,
      [Number(zone.wilayaCode)]: { ...(current[Number(zone.wilayaCode)] ?? toDraft(zone)), ...patch },
    }));
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">نظام التوصيل</h1>
          <p className="text-sm text-muted-foreground mt-1">
            سعر الولاية هو السعر الأساسي. إضافة المنزل تضاف فوقه فقط عند اختيار التوصيل للمنزل.
          </p>
        </div>
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full h-10 bg-background border border-input rounded-md pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-right"
            placeholder="ابحث باسم الولاية أو رقمها"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-card border border-card-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
            <MapPin className="w-4 h-4" />
            الولايات المفعلة
          </div>
          <p className="text-2xl font-bold tabular-nums mt-2">{activeCount}</p>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
            <Truck className="w-4 h-4" />
            ولايات لها سعر أساسي
          </div>
          <p className="text-2xl font-bold tabular-nums mt-2">{configuredCount}</p>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            متوسط الاسترجاع
          </div>
          <p className="text-2xl font-bold tabular-nums mt-2">{formatCurrency(averageReturnFee)}</p>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="h-14 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : visibleZones.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">لا توجد ولاية مطابقة للبحث.</div>
        ) : (
          <>
          <div className="hidden md:block">
          <table className="w-full table-fixed border-collapse border border-border text-sm">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[25%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[13%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className={headCell}>الحالة</th>
                <th className={headCell}>الولاية</th>
                <th className={headCell}>إضافة المنزل</th>
                <th className={headCell}>سعر الولاية</th>
                <th className={headCell}>الاسترجاع</th>
                <th className={headCell}>الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleZones.map((zone) => {
                const draftKey = Number(zone.wilayaCode);
                const draft = drafts[draftKey] ?? toDraft(zone);
                const dirty = drafts[draftKey] !== undefined;
                const canActivate = toNullableNumber(draft.officeFee) !== null;
                return (
                  <tr key={zone.wilayaCode} className="hover:bg-accent/40 transition-colors">
                    <td className={bodyCell}>
                      <label className="inline-flex items-center gap-2 text-sm font-semibold whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={draft.isActive}
                          onChange={(event) => updateDraft(zone, { isActive: event.target.checked })}
                          className="w-4 h-4 accent-primary"
                        />
                        {draft.isActive ? "مفعل" : "متوقف"}
                      </label>
                    </td>
                    <td className={bodyCell}>
                      <p className="text-sm font-bold text-foreground truncate">{zone.wilayaCode} - {zone.wilayaName}</p>
                      {!canActivate && draft.isActive && (
                        <p className="text-xs text-destructive mt-1 truncate">أدخل سعر الولاية الأساسي قبل الحفظ.</p>
                      )}
                    </td>
                    <td className={bodyCell}>
                      <input
                        value={draft.homeFee}
                        onChange={(event) => updateDraft(zone, { homeFee: event.target.value })}
                        type="number"
                        min="0"
                        step="1"
                        className={numberInput}
                        placeholder="اختياري"
                      />
                    </td>
                    <td className={bodyCell}>
                      <input
                        value={draft.officeFee}
                        onChange={(event) => updateDraft(zone, { officeFee: event.target.value })}
                        type="number"
                        min="0"
                        step="1"
                        className={numberInput}
                        placeholder="السعر"
                      />
                    </td>
                    <td className={bodyCell}>
                      <input
                        value={draft.returnFee}
                        onChange={(event) => updateDraft(zone, { returnFee: event.target.value })}
                        type="number"
                        min="0"
                        step="1"
                        className={numberInput}
                      />
                    </td>
                    <td className={bodyCell}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!dirty || updateZone.isPending || (draft.isActive && !canActivate)}
                          onClick={() => updateZone.mutate({ zone, draft })}
                          className="h-9 flex-1 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                        >
                          حفظ
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedZone(zone)}
                          className="h-9 w-9 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center"
                          title="البلديات"
                        >
                          <SlidersHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div className="grid gap-3 p-3 md:hidden">
            {visibleZones.map((zone) => {
              const draftKey = Number(zone.wilayaCode);
              const draft = drafts[draftKey] ?? toDraft(zone);
              const dirty = drafts[draftKey] !== undefined;
              const canActivate = toNullableNumber(draft.officeFee) !== null;
              return (
                <article key={zone.wilayaCode} className="rounded-lg border border-card-border bg-background/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{zone.wilayaCode} - {zone.wilayaName}</p>
                      {!canActivate && draft.isActive && (
                        <p className="mt-1 text-xs text-destructive">أدخل سعر الولاية الأساسي قبل الحفظ.</p>
                      )}
                    </div>
                    <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(event) => updateDraft(zone, { isActive: event.target.checked })}
                        className="h-4 w-4 accent-primary"
                      />
                      {draft.isActive ? "مفعل" : "متوقف"}
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-muted-foreground">سعر الولاية</span>
                      <input
                        value={draft.officeFee}
                        onChange={(event) => updateDraft(zone, { officeFee: event.target.value })}
                        type="number"
                        min="0"
                        step="1"
                        className={numberInput}
                        placeholder="السعر"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-muted-foreground">إضافة المنزل</span>
                      <input
                        value={draft.homeFee}
                        onChange={(event) => updateDraft(zone, { homeFee: event.target.value })}
                        type="number"
                        min="0"
                        step="1"
                        className={numberInput}
                        placeholder="اختياري"
                      />
                    </label>
                    <label className="col-span-2 space-y-1.5">
                      <span className="text-[11px] font-semibold text-muted-foreground">الاسترجاع</span>
                      <input
                        value={draft.returnFee}
                        onChange={(event) => updateDraft(zone, { returnFee: event.target.value })}
                        type="number"
                        min="0"
                        step="1"
                        className={numberInput}
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_2.75rem] gap-2">
                    <button
                      type="button"
                      disabled={!dirty || updateZone.isPending || (draft.isActive && !canActivate)}
                      onClick={() => updateZone.mutate({ zone, draft })}
                      className="h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                    >
                      حفظ
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedZone(zone)}
                      className="flex h-10 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="البلديات"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          </>
        )}
      </div>

      {selectedZone && (
        <CommunesDialog
          storeId={storeId}
          zone={selectedZone}
          onClose={() => setSelectedZone(null)}
        />
      )}
    </div>
  );
}

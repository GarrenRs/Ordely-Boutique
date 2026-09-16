export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function firstProductImage(page: { productImages?: unknown; imageUrl?: string | null } | null | undefined): string | null {
  if (!page) return null;
  return asStringArray(page.productImages)[0] ?? page.imageUrl ?? null;
}

export function validateVariantSelection(
  options: string[],
  selected: string | null | undefined,
  label: string,
): string | null {
  if (!options.length) return null;
  if (!selected) return `${label} is required for this product`;
  if (!options.includes(selected)) return `${label} is not available for this product`;
  return null;
}

export function formatOrder(
  o: Record<string, unknown>,
  landingPageName?: string | null,
  landingPageImage?: string | null,
  transportMode?: string | null,
) {
  return {
    ...o,
    unitPrice: Number(o.unitPrice),
    totalPrice: Number(o.totalPrice),
    customerAddress: o.customerAddress ?? null,
    deliveryZoneId: o.deliveryZoneId ?? null,
    deliveryWilayaCode: o.deliveryWilayaCode ?? null,
    deliveryWilayaName: o.deliveryWilayaName ?? null,
    deliveryCommuneName: o.deliveryCommuneName ?? null,
    deliveryDairaName: o.deliveryDairaName ?? null,
    deliveryMethod: o.deliveryMethod ?? null,
    transportMode: transportMode ?? "DELIVERY_COMPANY",
    deliveryFee: Number(o.deliveryFee ?? 0),
    returnFee: Number(o.returnFee ?? 0),
    payableTotal: Number(o.totalPrice ?? 0) + Number(o.deliveryFee ?? 0),
    selectedSize: o.selectedSize ?? null,
    selectedColor: o.selectedColor ?? null,
    customerId: o.customerId ?? null,
    notes: o.notes ?? null,
    confirmedAt: o.confirmedAt ?? null,
    shippedAt: o.shippedAt ?? null,
    deliveredAt: o.deliveredAt ?? null,
    returnedAt: o.returnedAt ?? null,
    returnReason: o.returnReason ?? null,
    landingPageName: landingPageName ?? null,
    productImageUrl: o.productImageUrl ?? landingPageImage ?? null,
  };
}
export const OPTION_LABEL_MARKER = "__label:";

export const DEFAULT_PRIMARY_OPTION_LABEL = "خيار المنتج";
export const DEFAULT_SECONDARY_OPTION_LABEL = "خيار إضافي";

export const PRODUCT_OPTION_LABELS = [
  "مقاس",
  "لون",
  "نوع",
  "خامة",
  "موديل",
  "أخرى",
] as const;

export function normalizeOptionLabel(label: string, fallback: string) {
  const trimmed = label.trim();
  return trimmed.length ? trimmed : fallback;
}

export function parseOptionGroup(values: unknown, fallbackLabel: string) {
  const list = Array.isArray(values)
    ? values
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const marker = list.find((item) => item.startsWith(OPTION_LABEL_MARKER));
  const label = marker
    ? normalizeOptionLabel(marker.slice(OPTION_LABEL_MARKER.length), fallbackLabel)
    : fallbackLabel;

  return {
    label,
    values: list.filter((item) => !item.startsWith(OPTION_LABEL_MARKER)),
  };
}

export function serializeOptionGroup(label: string, values: string[], fallbackLabel: string) {
  const cleanValues = Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  ).slice(0, 20);

  if (!cleanValues.length) return [];

  return [`${OPTION_LABEL_MARKER}${normalizeOptionLabel(label, fallbackLabel)}`, ...cleanValues];
}

export const CURRENCY_LABEL = "دج";

export function formatCurrency(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  return `${amount.toLocaleString("en-US")} ${CURRENCY_LABEL}`;
}

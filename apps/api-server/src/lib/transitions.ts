export const VALID_TRANSITIONS: Record<string, string[]> = {
  NEW: ["PENDING_CONFIRMATION", "CANCELLED"],
  PENDING_CONFIRMATION: ["CONFIRMED", "REJECTED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
  REJECTED: [],
};

export function isValidTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

/** Shared order constants (client + server safe). */
export const ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready", "delivered", "canceled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const FULFILLMENTS = ["pickup", "delivery", "dine_in"] as const;

/** Allowed status moves. Delivered and canceled are final. */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "canceled"],
  confirmed: ["preparing", "ready", "canceled"],
  preparing: ["ready", "canceled"],
  ready: ["delivered", "canceled"],
  delivered: [],
  canceled: [],
};
export const canMove = (from: string, to: string) => (NEXT_STATUS[from as OrderStatus] ?? []).includes(to as OrderStatus);

/** Maps database errors raised by create_order() to user-facing messages. */
export function orderErrorMessage(msg: string): string | null {
  if (/Product not available/i.test(msg)) return "One of the products is no longer available.";
  if (/Invalid quantity/i.test(msg)) return "Quantities must be between 1 and 999.";
  if (/at least one item/i.test(msg)) return "Add at least one item.";
  if (/Too many items/i.test(msg)) return "An order can have at most 50 lines.";
  return null;
}

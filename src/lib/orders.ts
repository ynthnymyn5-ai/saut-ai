/** Shared order constants (client + server safe). */
export const ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "delivered", "canceled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const FULFILLMENTS = ["pickup", "delivery", "dine_in"] as const;

/** Allowed status moves. Delivered and canceled are final. */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "canceled"],
  confirmed: ["preparing", "ready", "canceled"],
  preparing: ["ready", "canceled"],
  ready: ["out_for_delivery", "delivered", "canceled"],
  out_for_delivery: ["delivered", "canceled"],
  delivered: [],
  canceled: [],
};
/** Next statuses for an order; "out for delivery" only exists for delivery orders. */
export const nextStatuses = (from: string, fulfillment = "pickup"): OrderStatus[] =>
  (NEXT_STATUS[from as OrderStatus] ?? []).filter((s) => s !== "out_for_delivery" || fulfillment === "delivery");
export const canMove = (from: string, to: string, fulfillment = "pickup") => nextStatuses(from, fulfillment).includes(to as OrderStatus);

/** Kuwait-style delivery address (area / block / street / avenue / house / floor / apartment). */
export type DeliveryAddress = { area: string; block: string; street?: string; avenue?: string; house?: string; floor?: string; apartment?: string; notes?: string };

/** Returns the missing required parts (empty = complete). Mirrors the check inside create_order(). */
export function missingAddressParts(a: Partial<DeliveryAddress> | null | undefined): ("area" | "block" | "house_or_street")[] {
  const t = (v?: string) => (v ?? "").trim();
  const out: ("area" | "block" | "house_or_street")[] = [];
  if (!t(a?.area)) out.push("area");
  if (!t(a?.block)) out.push("block");
  if (!t(a?.house) && !t(a?.street)) out.push("house_or_street");
  return out;
}

/** "Salmiya, Block 10, St Salem Al Mubarak, House 5" (Arabic labels when ar). */
export function formatAddress(a: Partial<DeliveryAddress> | null | undefined, ar = false): string {
  if (!a) return "";
  const L = ar ? { block: "قطعة", street: "شارع", avenue: "جادة", house: "منزل", floor: "دور", apartment: "شقة" } : { block: "Block", street: "St", avenue: "Ave", house: "House", floor: "Floor", apartment: "Apt" };
  const parts = [a.area, a.block && `${L.block} ${a.block}`, a.street && `${L.street} ${a.street}`, a.avenue && `${L.avenue} ${a.avenue}`, a.house && `${L.house} ${a.house}`, a.floor && `${L.floor} ${a.floor}`, a.apartment && `${L.apartment} ${a.apartment}`];
  return parts.filter(Boolean).join(ar ? "، " : ", ");
}

/** Maps database errors raised by create_order() to user-facing messages. */
export function orderErrorMessage(msg: string): string | null {
  if (/Product not available/i.test(msg)) return "One of the products is no longer available.";
  if (/Invalid quantity/i.test(msg)) return "Quantities must be between 1 and 999.";
  if (/at least one item/i.test(msg)) return "Add at least one item.";
  if (/Too many items/i.test(msg)) return "An order can have at most 50 lines.";
  if (/address incomplete/i.test(msg)) return "Delivery address is incomplete: area, block and house (or street) are required.";
  if (/Outside delivery area/i.test(msg)) return "This area is outside your delivery zones.";
  const min = msg.match(/Below minimum order for this area: ([\d.]+)/i);
  if (min) return `The minimum order for this area is ${Number(min[1]).toFixed(3)}.`;
  return null;
}

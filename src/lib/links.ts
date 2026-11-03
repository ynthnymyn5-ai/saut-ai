/** Client-safe link builders (no configuration or secrets). */

/** Google Maps search link for a Kuwaiti address (area, block, street, house). */
export function mapsUrl(a: { area?: string; block?: string; street?: string; avenue?: string; house?: string } | null | undefined): string | null {
  if (!a?.area) return null;
  const q = [a.area, a.block && `Block ${a.block}`, a.street && `Street ${a.street}`, a.avenue && `Avenue ${a.avenue}`, a.house && `House ${a.house}`, "Kuwait"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** wa.me link that opens a chat with the customer with the text pre-filled (staff press send themselves). */
export function waMeUrl(phone: string | null | undefined, text: string): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 8 ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
}

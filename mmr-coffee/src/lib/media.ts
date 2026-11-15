import manifest from "./media.json";

/**
 * Real photography and film. `npm run media` fills media.json from the files in media-src/.
 * Anything missing falls back to the built-in 3D scene or illustration, so the site never shows a broken slot.
 */
type Entry = { src: string; width?: number; height?: number; webm?: string; poster?: string };
const m = manifest as Record<string, Entry>;

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
export const media = {
  menu: (name: string) => m[`menu/${slug(name)}`],
  product: (id: string) => m[`products/${id}`],
  story: () => m["story"],
  experience: () => m["experience"],
};

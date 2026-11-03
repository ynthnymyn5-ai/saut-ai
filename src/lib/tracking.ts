import { publicEnv } from "@/lib/env";

/** Public page where a customer follows their order (no login; the 64-hex token is the key). */
export const trackingUrl = (token: string | null | undefined) => (token && /^[0-9a-f]{64}$/.test(token) ? `${publicEnv.appUrl}/t/${token}` : null);

export { mapsUrl, waMeUrl } from "@/lib/links";

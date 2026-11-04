/**
 * The one public contact address shown to customers (support, privacy, sales, account deletion).
 * Set NEXT_PUBLIC_CONTACT_EMAIL in Vercel to change it (e.g. to support@sautai.company once that inbox exists).
 */
export const CONTACT_EMAIL = (process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hmidan6611@gmail.com").trim();

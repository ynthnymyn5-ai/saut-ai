/**
 * Currency minor units. Gulf dinars (KWD, BHD, OMR) and JOD/TND use 3 decimals (fils),
 * so 49.000 KWD = 49000 minor units at Stripe. Dividing every currency by 100 overstates
 * dinar payments ×10 — always convert through these helpers.
 */
const THREE_DECIMAL = new Set(["KWD", "BHD", "OMR", "JOD", "TND", "LYD", "IQD"]);
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "PYG", "XAF", "XOF", "UGX", "RWF"]);

export function minorUnitDigits(currency: string): 0 | 2 | 3 {
  const c = currency.toUpperCase();
  return THREE_DECIMAL.has(c) ? 3 : ZERO_DECIMAL.has(c) ? 0 : 2;
}

export function fromMinor(amount: number, currency: string): number {
  const d = minorUnitDigits(currency);
  return Number((amount / 10 ** d).toFixed(d));
}

/** Stripe requires 3-decimal amounts to end in 0 (e.g. 49.120 KWD → 49120). */
export function toMinor(amount: number, currency: string): number {
  const d = minorUnitDigits(currency);
  const v = Math.round(amount * 10 ** d);
  return d === 3 ? Math.round(v / 10) * 10 : v;
}

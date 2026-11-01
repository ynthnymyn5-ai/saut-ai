import "server-only";
import crypto from "node:crypto";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * MyFatoorah — KNET, cards and Apple Pay for Kuwait & GCC.
 * Flow: ExecutePayment → customer pays on hosted page → MyFatoorah calls our webhook and
 * redirects back → we call GetPaymentStatus server-side to confirm before activating.
 * Recurring billing: enable "Recurring" on your MyFatoorah account and pass RecurringModel.
 */
async function mf<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${serverEnv("MYFATOORAH_BASE_URL")}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv("MYFATOORAH_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { IsSuccess: boolean; Message?: string; Data: T };
  if (!res.ok || !data.IsSuccess) throw new Error(`MyFatoorah: ${data.Message ?? res.status}`);
  return data.Data;
}

export async function createMyFatoorahPayment(opts: {
  orgId: string;
  amount: number;
  currency: string;
  customerName: string;
  email: string;
  reference: string; // our pending subscription id
  interval: "monthly" | "annual";
  recurring?: boolean; // false for one-time purchases such as add-ons
}) {
  const data = await mf<{ PaymentURL: string; InvoiceId: number }>("/v2/SendPayment", {
    NotificationOption: "LNK",
    InvoiceValue: opts.amount,
    DisplayCurrencyIso: opts.currency,
    CustomerName: opts.customerName,
    CustomerEmail: opts.email,
    CustomerReference: opts.reference,
    UserDefinedField: opts.orgId,
    Language: "AR",
    CallBackUrl: `${publicEnv.appUrl}/dashboard/billing?checkout=processing`,
    ErrorUrl: `${publicEnv.appUrl}/dashboard/billing?checkout=failed`,
    ...(opts.recurring === false ? {} : { RecurringModel: { RecurringType: opts.interval === "annual" ? "Yearly" : "Monthly", Iteration: 0 } }),
  });
  return { url: data.PaymentURL, invoiceId: data.InvoiceId };
}

/** Authoritative check — always called before marking anything as paid. */
export async function getMyFatoorahStatus(invoiceId: string) {
  return mf<{
    InvoiceId: number;
    InvoiceStatus: "Pending" | "Paid" | "Canceled";
    InvoiceValue: number;
    RecurringId?: string | null;
    CustomerReference: string;
    UserDefinedField: string;
    InvoiceTransactions: { PaymentGateway: string; TransactionStatus: string; PaymentId: string }[];
  }>("/v2/GetPaymentStatus", { Key: invoiceId, KeyType: "InvoiceId" });
}

/**
 * Verifies the MyFatoorah-Signature header (HMAC-SHA256 over the sorted Data fields,
 * base64) using the webhook secret from the MyFatoorah portal.
 */
export function verifyMyFatoorahSignature(data: Record<string, unknown>, signature: string) {
  const secret = serverEnv("MYFATOORAH_WEBHOOK_SECRET");
  const payload = Object.keys(data)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((k) => `${k}=${data[k] ?? ""}`)
    .join(",");
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Stops future recurring charges at MyFatoorah. Called when an owner cancels; access
 * continues until the paid period ends (expire_lapsed_subscriptions() closes it then).
 */
export async function cancelMyFatoorahRecurring(recurringId: string) {
  const res = await fetch(`${serverEnv("MYFATOORAH_BASE_URL")}/v2/CancelRecurringPayment?recurringId=${encodeURIComponent(recurringId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv("MYFATOORAH_API_KEY")}`, "Content-Type": "application/json" },
  });
  const data = (await res.json().catch(() => ({}))) as { IsSuccess?: boolean; Message?: string };
  if (!res.ok || !data.IsSuccess) throw new Error(`MyFatoorah cancel recurring: ${data.Message ?? res.status}`);
}

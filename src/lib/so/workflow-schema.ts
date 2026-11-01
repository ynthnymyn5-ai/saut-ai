import { z } from "zod";

export const TRIGGERS = ["call_received", "missed_call", "whatsapp_message", "lead_created", "appointment_created", "appointment_canceled", "complaint", "payment_confirmed", "ticket_created"] as const;

export const nodeSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  kind: z.enum(["condition", "action"]),
  type: z.string().regex(/^[a-z_]{3,48}$/),
  config: z.record(z.unknown()).default({}),
  parent_key: z.string().nullable().default(null),
  branch: z.enum(["yes", "no"]).nullable().default(null),
  position: z.number().int().min(0).max(100),
});

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** Opening/working hours: up to three ranges per day, e.g. {"fri":[["13:00","23:00"]]}. */
export const hoursSchema = z.record(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]), z.array(z.tuple([hm, hm])).max(3));

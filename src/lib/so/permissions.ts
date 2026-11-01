/**
 * SO Guardrails — pure permission logic (no I/O, unit-tested in scripts/test-engine.mjs).
 *
 * Every tool declares the permission it needs. An agent's effective effect for a permission is:
 *   1. HARD_DENY  → always "deny" (no configuration can enable it for an AI agent)
 *   2. explicit row in agent_permissions
 *   3. the role default below
 *   4. otherwise "deny"
 * "confirm" means a human must approve the execution in the Command Center before it runs.
 */
export type Effect = "allow" | "confirm" | "deny";
export type AgentRole = "receptionist" | "sales" | "support" | "manager" | "booking" | "custom";

export const PERMISSIONS = [
  "customers.read", "customers.write", "customers.delete", "customers.export",
  "appointments.read", "appointments.write", "appointments.cancel",
  "orders.read", "orders.write",
  "leads.read", "leads.write",
  "messages.send", "messages.bulk_send",
  "tasks.write", "tasks.delegate",
  "knowledge.read",
  "reports.read",
  "calls.transfer",
  "payments.charge", "payments.refund",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Never available to an AI agent, whatever the configuration says. */
export const HARD_DENY: readonly Permission[] = ["payments.charge", "payments.refund", "customers.delete", "customers.export", "messages.bulk_send"];

/** Configurable, but forced to at least "confirm". */
export const ALWAYS_CONFIRM: readonly Permission[] = ["appointments.cancel"];

const base: Partial<Record<Permission, Effect>> = {
  "customers.read": "allow", "knowledge.read": "allow", "calls.transfer": "allow", "tasks.write": "allow", "tasks.delegate": "allow",
  "orders.read": "allow", // catalogue prices + the caller's own orders only
};

export const ROLE_DEFAULTS: Record<AgentRole, Partial<Record<Permission, Effect>>> = {
  receptionist: { ...base, "orders.write": "allow", "customers.write": "allow", "appointments.read": "allow", "appointments.write": "allow", "appointments.cancel": "confirm", "leads.write": "allow", "messages.send": "allow" },
  sales:        { ...base, "orders.write": "allow", "customers.write": "allow", "leads.read": "allow", "leads.write": "allow", "appointments.read": "allow", "appointments.write": "allow", "messages.send": "allow" },
  support:      { ...base, "customers.write": "allow", "appointments.read": "allow", "messages.send": "allow" },
  manager:      { ...base, "reports.read": "allow", "leads.read": "allow", "appointments.read": "allow" },
  booking:      { ...base, "customers.write": "allow", "appointments.read": "allow", "appointments.write": "allow", "appointments.cancel": "confirm", "messages.send": "allow" },
  custom:       { ...base },
};

export function resolveEffect(role: AgentRole, permission: Permission, overrides: Partial<Record<string, Effect>> = {}): Effect {
  if (HARD_DENY.includes(permission)) return "deny";
  const e: Effect = overrides[permission] ?? ROLE_DEFAULTS[role]?.[permission] ?? "deny";
  if (e === "allow" && ALWAYS_CONFIRM.includes(permission)) return "confirm";
  return e;
}

/** Combine tool sensitivity with the agent's effect: a sensitive tool upgrades "allow" to "confirm". */
export function decide(effect: Effect, sensitive: boolean, testMode: boolean): "run" | "confirm" | "deny" | "simulate" {
  if (effect === "deny") return "deny";
  if (testMode) return "simulate";
  if (effect === "confirm" || sensitive) return "confirm";
  return "run";
}

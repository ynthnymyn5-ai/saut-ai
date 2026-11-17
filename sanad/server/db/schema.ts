/**
 * Drizzle schema for Sanad.
 *
 * Sanad is single-user (the owner), so business tables carry no user_id —
 * access is gated by the auth middleware instead.
 */
import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  vector,
  index,
} from "drizzle-orm/pg-core";

/** Embedding size of text-embedding-3-small (and of the local fallback embedder). */
export const EMBEDDING_DIMS = 1536;

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

// ─── Auth ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: varchar("id", { length: 128 }).primaryKey(), // Replit OIDC "sub"
  email: varchar("email", { length: 255 }),
  name: varchar("name", { length: 255 }),
  profileImageUrl: text("profile_image_url"),
  createdAt: createdAt(),
});

/** Session store used by connect-pg-simple (table name must be "session"). */
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (t) => [index("IDX_session_expire").on(t.expire)]);

/** Simple key/value settings (owner id, VAPID keys, preferences…). */
export const settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

// ─── Conversations ───────────────────────────────────────────────────────────
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("New conversation"),
  channel: varchar("channel", { length: 20 }).notNull().default("web"), // web | telegram | whatsapp
  agentId: varchar("agent_id", { length: 30 }).notNull().default("chief"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(), // user | assistant
  content: text("content").notNull(),
  agentId: varchar("agent_id", { length: 30 }),
  lang: varchar("lang", { length: 5 }),
  meta: jsonb("meta"), // delegations, actions, pending ids
  createdAt: createdAt(),
}, (t) => [index("messages_conversation_idx").on(t.conversationId)]);

// ─── Memory ──────────────────────────────────────────────────────────────────
export const memories = pgTable("memories", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 20 }).notNull().default("fact"), // fact | person | business | preference
  content: text("content").notNull(),
  tags: text("tags").array().notNull().default([]),
  source: varchar("source", { length: 30 }).notNull().default("manual"), // manual | auto | seed
  pinned: boolean("pinned").notNull().default(false),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMS }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── Operations ──────────────────────────────────────────────────────────────
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("todo"), // todo | in_progress | done
  priority: varchar("priority", { length: 10 }).notNull().default("medium"), // low | medium | high | urgent
  project: varchar("project", { length: 120 }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  sent: boolean("sent").notNull().default(false),
  createdAt: createdAt(),
});

// ─── Sales ───────────────────────────────────────────────────────────────────
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  email: text("email"),
  phone: text("phone"),
  stage: varchar("stage", { length: 20 }).notNull().default("new"), // new | contacted | qualified | proposal | won | lost
  value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: varchar("currency", { length: 5 }).notNull().default("KWD"),
  nextStep: text("next_step"),
  followUpAt: timestamp("follow_up_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── Finance ─────────────────────────────────────────────────────────────────
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 10 }).notNull(), // income | expense
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 5 }).notNull().default("KWD"),
  category: varchar("category", { length: 60 }).notNull().default("general"),
  description: text("description"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 40 }).notNull(),
  client: text("client").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 5 }).notNull().default("KWD"),
  status: varchar("status", { length: 12 }).notNull().default("draft"), // draft | sent | paid | overdue
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ─── Marketing ───────────────────────────────────────────────────────────────
export const contentItems = pgTable("content_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  platform: varchar("platform", { length: 30 }).notNull().default("instagram"),
  caption: text("caption"),
  status: varchar("status", { length: 20 }).notNull().default("idea"), // idea | draft | scheduled | published
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── Knowledge notes (Researcher, Strategist, Engineering, Design) ───────────
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  agentId: varchar("agent_id", { length: 30 }).notNull(), // researcher | strategist | engineering | design
  kind: varchar("kind", { length: 20 }).notNull().default("note"), // note | research | decision | plan | snippet | spec | brief | moodboard
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  codeLanguage: varchar("code_language", { length: 30 }),
  tags: text("tags").array().notNull().default([]),
  /** research sources, moodboard colours, pros/cons… */
  data: jsonb("data"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── Local calendar + sample inbox (used when Google isn't connected) ────────
export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
  location: text("location"),
  attendees: text("attendees").array().notNull().default([]),
  description: text("description"),
  createdAt: createdAt(),
});

export const sampleEmails = pgTable("sample_emails", {
  id: serial("id").primaryKey(),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  unread: boolean("unread").notNull().default(true),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailDrafts = pgTable("email_drafts", {
  id: serial("id").primaryKey(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  inReplyTo: text("in_reply_to"),
  status: varchar("status", { length: 12 }).notNull().default("draft"), // draft | sent
  externalId: text("external_id"),
  createdAt: createdAt(),
});

// ─── Safety & audit ──────────────────────────────────────────────────────────
export const pendingActions = pgTable("pending_actions", {
  id: serial("id").primaryKey(),
  tool: varchar("tool", { length: 60 }).notNull(),
  args: jsonb("args").notNull(),
  summary: text("summary").notNull(),
  agentId: varchar("agent_id", { length: 30 }),
  conversationId: integer("conversation_id"),
  channel: varchar("channel", { length: 20 }).notNull().default("web"),
  status: varchar("status", { length: 12 }).notNull().default("pending"),
  result: jsonb("result"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  actor: varchar("actor", { length: 20 }).notNull().default("sanad"), // sanad | user | system
  agentId: varchar("agent_id", { length: 30 }),
  action: varchar("action", { length: 60 }).notNull(),
  summary: text("summary").notNull(),
  status: varchar("status", { length: 12 }).notNull().default("success"), // success | failed | pending | cancelled
  details: jsonb("details"),
  createdAt: createdAt(),
});

// ─── Integrations, push, briefs ──────────────────────────────────────────────
export const integrationAccounts = pgTable("integration_accounts", {
  provider: varchar("provider", { length: 30 }).primaryKey(), // google | notion | telegram | whatsapp
  accountLabel: text("account_label"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scope: text("scope"),
  meta: jsonb("meta"),
  updatedAt: updatedAt(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").notNull(),
  createdAt: createdAt(),
});

export const briefs = pgTable("briefs", {
  id: serial("id").primaryKey(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD in owner timezone
  lang: varchar("lang", { length: 5 }).notNull().default("en"),
  text: text("text").notNull(),
  data: jsonb("data").notNull(),
  createdAt: createdAt(),
});

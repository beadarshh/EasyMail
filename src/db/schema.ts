import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const directionEnum = pgEnum("email_direction", ["inbound", "outbound"]);
// Outbound mail is either composed in EasyMail or sent by one of your apps
// through the same Resend account (picked up from webhooks).
export const sourceEnum = pgEnum("email_source", ["easymail", "external"]);

// App's own login (not Supabase Auth). The first admin is created on /setup.
export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(), // always lowercase
  passwordHash: text("password_hash").notNull(),
  // Bumped on password change so existing sessions are signed out.
  sessionVersion: integer("session_version").notNull().default(1),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const identities = pgTable("identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address").notNull().unique(), // always lowercase
  displayName: text("display_name"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  canSend: boolean("can_send").notNull().default(true),
  canReceive: boolean("can_receive").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Keys that let a website call POST /api/contact. Only the SHA-256 hash is stored; the raw key is
// shown once at creation. A key is bound to a project, a From address, a recipient and the
// website domains allowed to use it.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(), // first characters, to recognise a key in the list
    keyHash: text("key_hash").notNull().unique(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    identityId: uuid("identity_id").references(() => identities.id, { onDelete: "set null" }),
    toAddress: text("to_address").notNull(), // where contact-form messages are delivered
    allowedOrigins: text("allowed_origins").array().notNull().default([]), // hostnames, lowercase
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_keys_project_idx").on(t.projectId)],
);

export const emails = pgTable(
  "emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resendId: text("resend_id").unique(),
    direction: directionEnum("direction").notNull(),
    source: sourceEnum("source").notNull().default("easymail"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    identityId: uuid("identity_id").references(() => identities.id, { onDelete: "set null" }),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    to: text("to").array().notNull().default([]),
    cc: text("cc").array().notNull().default([]),
    bcc: text("bcc").array().notNull().default([]),
    replyTo: text("reply_to").array().notNull().default([]),
    subject: text("subject").notNull().default(""),
    text: text("text"),
    html: text("html"),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    references: text("references").array().notNull().default([]),
    threadId: uuid("thread_id").notNull(),
    status: text("status").notNull().default("received"),
    tags: jsonb("tags").$type<Record<string, string>>(),
    isRead: boolean("is_read").notNull().default(false),
    isStarred: boolean("is_starred").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    opens: integer("opens").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("emails_thread_idx").on(t.threadId),
    index("emails_dir_sent_idx").on(t.direction, t.sentAt),
    index("emails_project_idx").on(t.projectId),
    index("emails_message_id_idx").on(t.messageId),
  ],
);

export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // svix-id of the webhook delivery: makes replays idempotent
    webhookId: text("webhook_id").notNull().unique(),
    emailId: uuid("email_id").references(() => emails.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("email_events_email_idx").on(t.emailId), index("email_events_type_idx").on(t.type, t.occurredAt)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailId: uuid("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    resendAttachmentId: text("resend_attachment_id"),
    filename: text("filename").notNull().default("attachment"),
    contentType: text("content_type").notNull().default("application/octet-stream"),
    size: integer("size").notNull().default(0),
    contentId: text("content_id"),
    // Path in the Supabase Storage bucket; null when not archived
    storagePath: text("storage_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachments_email_idx").on(t.emailId)],
);

export const quotaUsage = pgTable("quota_usage", {
  day: date("day").primaryKey(), // UTC date
  sent: integer("sent").notNull().default(0),
  received: integer("received").notNull().default(0),
});

export const contacts = pgTable("contacts", {
  address: text("address").primaryKey(),
  name: text("name"),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  sentCount: integer("sent_count").notNull().default(0),
  receivedCount: integer("received_count").notNull().default(0),
});

// Small key/value store: last webhook time, Resend usage snapshot, toggles.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Every notable thing that happens (mail sent/received, delivery events, logins, admin changes) is
// written here once, so the dashboard reads one small indexed table instead of re-deriving it.
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(), // e.g. "email.sent", "auth.login"
    title: text("title").notNull(), // human-readable one-liner
    actor: text("actor"), // admin username, or null for system / webhook events
    emailId: uuid("email_id").references(() => emails.id, { onDelete: "set null" }),
    threadId: uuid("thread_id"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_log_created_idx").on(t.createdAt)],
);

export type Admin = typeof admins.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Identity = typeof identities.$inferSelect;
export type Email = typeof emails.$inferSelect;
export type EmailEvent = typeof emailEvents.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;

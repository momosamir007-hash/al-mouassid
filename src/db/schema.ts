import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/** المستخدمون. الدور: learner | admin (المدير الأول يحتاج رمز تأسيس خادم). */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("learner"),
  defaultLevel: text("default_level"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** الجلسات: نخزّن بصمة (hash) الرمز فقط وليس الرمز نفسه. */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** المواد الدراسية (قابلة للإدارة والتوسعة). */
export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  icon: text("icon").notNull().default("📘"),
  levels: jsonb("levels").$type<string[]>().notNull(),
  sortOrder: integer("sort_order").notNull().default(100),
  enabled: boolean("enabled").notNull().default(true),
});

/** مزودو الذكاء الاصطناعي. المفاتيح: اسم متغير بيئة من قائمة مسموحة أو نص مشفّر AES-256-GCM. */
export const aiProviders = pgTable("ai_providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // openai | openai-compatible | gemini | anthropic | ollama
  baseUrl: text("base_url"),
  model: text("model").notNull(),
  apiKeyEnv: text("api_key_env"),
  apiKeyEnc: text("api_key_enc"),
  keyHint: text("key_hint"),
  priority: integer("priority").notNull().default(100),
  enabled: boolean("enabled").notNull().default(false),
  isLocal: boolean("is_local").notNull().default(false),
  tasks: jsonb("tasks").$type<string[]>().notNull(),
  supportsVision: boolean("supports_vision").notNull().default(false),
  timeoutMs: integer("timeout_ms").notNull().default(30000),
  dailyRequestLimit: integer("daily_request_limit"),
  dailyCostLimitUsd: doublePrecision("daily_cost_limit_usd"),
  alertPercent: integer("alert_percent").notNull().default(80),
  costInPer1k: doublePrecision("cost_in_per_1k"),
  costOutPer1k: doublePrecision("cost_out_per_1k"),
  status: text("status").notNull().default("untested"),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastLatencyMs: integer("last_latency_ms"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** سجل الاستهلاك والأخطاء (بدون نصوص المستخدم أو الأسرار). */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    providerId: integer("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    task: text("task").notNull(),
    ok: boolean("ok").notNull(),
    errorKind: text("error_kind"),
    errorMessage: text("error_message"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: doublePrecision("cost_usd"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_provider_time_idx").on(t.providerId, t.createdAt)],
);

/** التمارين. لا تُخزَّن صور التمارين إطلاقاً، النص فقط. */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    level: text("level").notNull(),
    subject: text("subject").notNull(),
    title: text("title").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("exercises_user_client_uq").on(t.userId, t.clientId)],
);

/** رسائل المساعدة داخل التمرين (سياق المحادثة). */
export const helpMessages = pgTable(
  "help_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    action: text("action").notNull(),
    content: text("content").notNull(),
    providerName: text("provider_name"),
    providerLocal: boolean("provider_local"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("help_messages_exercise_idx").on(t.exerciseId, t.createdAt)],
);


/** محدد معدل موزع بين نسخ الخادم. */
export const apiRateLimits = pgTable("api_rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  hits: integer("hits").notNull().default(0),
});

/** سجل حذف دائم حتى تنتشر عمليات الحذف إلى بقية أجهزة الحساب. */
export const exerciseDeletions = pgTable("exercise_deletions", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("exercise_deletions_user_client_uq").on(t.userId, t.clientId)]);

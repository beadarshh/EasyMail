import "server-only";
import { z } from "zod";

const schema = z.object({
  RESEND_API_KEY: z.string().startsWith("re_"),
  RESEND_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SUPABASE_URL: z
    .string()
    .regex(/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/, "must look like https://<project-ref>.supabase.co")
    .optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  // Database → Settings → Database password (raw, no URL-encoding needed)
  SUPABASE_DB_PASSWORD: z.string().optional(),
  // Region from Connect → pooler host, e.g. "ap-northeast-1" or "aws-1-ap-northeast-1"
  SUPABASE_REGION: z.string().optional(),
  SUPABASE_BUCKET: z.string().default("attachments"),
  // Advanced: full Postgres URL that overrides the SUPABASE_* database settings
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "must be a postgresql:// connection string")
    .optional(),
  CRON_SECRET: z.string().optional(),
  DAILY_SEND_CAP: z.coerce.number().int().positive().default(95),
  DAILY_WARN_AT: z.coerce.number().int().positive().default(80),
  MONTHLY_CAP: z.coerce.number().int().positive().default(3000),
  ARCHIVE_ATTACHMENTS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Total size of attachments on an outgoing email (Vercel body limit is 4.5 MB)
  MAX_ATTACHMENT_MB: z.coerce.number().positive().max(4).default(4),
  // Largest inbound attachment copied into Supabase Storage
  ARCHIVE_MAX_MB: z.coerce.number().positive().default(10),
});

const checked = schema.superRefine((e, ctx) => {
  if (e.DATABASE_URL) return;
  for (const key of ["SUPABASE_URL", "SUPABASE_DB_PASSWORD", "SUPABASE_REGION"] as const) {
    if (!e[key]) ctx.addIssue({ code: "custom", path: [key], message: "required to connect to the database" });
  }
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Validated lazily so `next build` works without secrets present.
export function env(): Env {
  if (!cached) {
    // Treat `KEY=` (empty) in .env files as "not set".
    const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
    const parsed = checked.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function storageEnabled() {
  const e = env();
  return Boolean(e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY);
}

CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"actor" text,
	"email_id" uuid,
	"thread_id" uuid,
	"project_id" uuid,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_created_idx" ON "activity_log" USING btree ("created_at");
--> statement-breakpoint
ALTER TABLE "activity_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Seed the log with recent mail so the dashboard isn't empty on day one.
INSERT INTO "activity_log" ("type", "title", "email_id", "thread_id", "project_id", "created_at")
SELECT
	CASE WHEN "direction" = 'inbound' THEN 'email.received' ELSE 'email.sent' END,
	CASE WHEN "direction" = 'inbound'
		THEN 'Received "' || left("subject", 80) || '" from ' || "from_address"
		ELSE 'Sent "' || left("subject", 80) || '" to ' || coalesce("to"[1], '')
	END,
	"id", "thread_id", "project_id", "sent_at"
FROM "emails"
ORDER BY "sent_at" DESC
LIMIT 100;

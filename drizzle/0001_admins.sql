CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_username_unique" UNIQUE("username")
);

--> statement-breakpoint
ALTER TABLE "admins" ENABLE ROW LEVEL SECURITY;
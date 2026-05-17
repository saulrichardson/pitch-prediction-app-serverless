ALTER TABLE "timeline_start_jobs" ADD COLUMN "lease_token" text;--> statement-breakpoint
ALTER TABLE "timeline_start_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;
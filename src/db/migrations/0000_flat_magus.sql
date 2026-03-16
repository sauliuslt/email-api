CREATE TYPE "public"."event_severity" AS ENUM('info', 'warning', 'error', 'temporary', 'permanent');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('accepted', 'delivered', 'bounced', 'failed', 'opened', 'clicked', 'complained', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sending', 'delivered', 'bounced', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('bounce', 'unsubscribe', 'complaint');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"domain_id" uuid,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"spf_verified" boolean DEFAULT false NOT NULL,
	"dkim_verified" boolean DEFAULT false NOT NULL,
	"dmarc_verified" boolean DEFAULT false NOT NULL,
	"dkim_selector" text DEFAULT 'mail' NOT NULL,
	"dkim_private_key" text NOT NULL,
	"dkim_public_key" text NOT NULL,
	"ip_pool_id" uuid,
	"webhooks" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"severity" "event_severity" DEFAULT 'info' NOT NULL,
	"recipient" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"pool_id" uuid NOT NULL,
	"hostname" text,
	"warmup_stage" integer DEFAULT 0 NOT NULL,
	"daily_limit" integer DEFAULT 50 NOT NULL,
	"sent_today" integer DEFAULT 0 NOT NULL,
	"reputation_score" numeric(5, 2) DEFAULT '100' NOT NULL,
	"postfix_port" integer DEFAULT 25 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ip_addresses_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "ip_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ip_pools_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"text_body" text,
	"html_body" text,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"ip_address_id" uuid,
	"message_id_header" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"email" text NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_domain_email" UNIQUE("domain_id","email")
);
--> statement-breakpoint
CREATE TABLE "warmup_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" integer NOT NULL,
	"daily_limit" integer NOT NULL,
	CONSTRAINT "warmup_schedules_day_unique" UNIQUE("day")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_ip_pool_id_ip_pools_id_fk" FOREIGN KEY ("ip_pool_id") REFERENCES "public"."ip_pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_pool_id_ip_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."ip_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_ip_address_id_ip_addresses_id_fk" FOREIGN KEY ("ip_address_id") REFERENCES "public"."ip_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_list" ADD CONSTRAINT "suppression_list_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;
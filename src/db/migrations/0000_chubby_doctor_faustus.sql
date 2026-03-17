CREATE TABLE `api_keys` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`key_prefix` varchar(255) NOT NULL,
	`key_hash` varchar(255) NOT NULL,
	`domain_id` varchar(36),
	`permissions` json DEFAULT ('[]'),
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_key_hash_unique` UNIQUE(`key_hash`)
);
--> statement-breakpoint
CREATE TABLE `domains` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`spf_verified` boolean NOT NULL DEFAULT false,
	`dkim_verified` boolean NOT NULL DEFAULT false,
	`dmarc_verified` boolean NOT NULL DEFAULT false,
	`dkim_selector` varchar(255) NOT NULL DEFAULT 'mail',
	`dkim_private_key` text NOT NULL,
	`dkim_public_key` text NOT NULL,
	`ip_pool_id` varchar(36),
	`webhooks` json DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `domains_id` PRIMARY KEY(`id`),
	CONSTRAINT `domains_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` varchar(36) NOT NULL,
	`message_id` varchar(36) NOT NULL,
	`type` enum('accepted','delivered','bounced','failed','opened','clicked','complained','unsubscribed') NOT NULL,
	`severity` enum('info','warning','error','temporary','permanent') NOT NULL DEFAULT 'info',
	`recipient` varchar(255) NOT NULL,
	`details` json DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ip_addresses` (
	`id` varchar(36) NOT NULL,
	`address` varchar(255) NOT NULL,
	`pool_id` varchar(36) NOT NULL,
	`hostname` text,
	`warmup_stage` int NOT NULL DEFAULT 0,
	`daily_limit` int NOT NULL DEFAULT 50,
	`sent_today` int NOT NULL DEFAULT 0,
	`reputation_score` decimal(5,2) NOT NULL DEFAULT '100',
	`postfix_port` int NOT NULL DEFAULT 25,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ip_addresses_id` PRIMARY KEY(`id`),
	CONSTRAINT `ip_addresses_address_unique` UNIQUE(`address`)
);
--> statement-breakpoint
CREATE TABLE `ip_pools` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ip_pools_id` PRIMARY KEY(`id`),
	CONSTRAINT `ip_pools_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` varchar(36) NOT NULL,
	`domain_id` varchar(36) NOT NULL,
	`from_address` varchar(255) NOT NULL,
	`to_address` varchar(255) NOT NULL,
	`subject` text NOT NULL,
	`text_body` text,
	`html_body` text,
	`status` enum('queued','sending','delivered','bounced','failed','rejected') NOT NULL DEFAULT 'queued',
	`ip_address_id` varchar(36),
	`message_id_header` varchar(255),
	`postfix_queue_id` varchar(255),
	`smtp_response` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppression_list` (
	`id` varchar(36) NOT NULL,
	`domain_id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`reason` enum('bounce','unsubscribe','complaint') NOT NULL,
	`details` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suppression_list_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_domain_email` UNIQUE(`domain_id`,`email`)
);
--> statement-breakpoint
CREATE TABLE `warmup_schedules` (
	`id` varchar(36) NOT NULL,
	`day` int NOT NULL,
	`daily_limit` int NOT NULL,
	CONSTRAINT `warmup_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `warmup_schedules_day_unique` UNIQUE(`day`)
);
--> statement-breakpoint
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_domain_id_domains_id_fk` FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `domains` ADD CONSTRAINT `domains_ip_pool_id_ip_pools_id_fk` FOREIGN KEY (`ip_pool_id`) REFERENCES `ip_pools`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ip_addresses` ADD CONSTRAINT `ip_addresses_pool_id_ip_pools_id_fk` FOREIGN KEY (`pool_id`) REFERENCES `ip_pools`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_domain_id_domains_id_fk` FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_ip_address_id_ip_addresses_id_fk` FOREIGN KEY (`ip_address_id`) REFERENCES `ip_addresses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suppression_list` ADD CONSTRAINT `suppression_list_domain_id_domains_id_fk` FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON DELETE cascade ON UPDATE no action;
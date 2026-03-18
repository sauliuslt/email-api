CREATE TABLE `inbound_emails` (
	`id` varchar(36) NOT NULL,
	`sender` varchar(255) NOT NULL,
	`recipient` varchar(255) NOT NULL,
	`subject` text,
	`message_id` varchar(36),
	`classification` enum('bounce','complaint','unsubscribe','unknown') NOT NULL DEFAULT 'unknown',
	`matched` boolean NOT NULL DEFAULT false,
	`raw_headers` text,
	`details` json DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inbound_emails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD CONSTRAINT `inbound_emails_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE set null ON UPDATE no action;
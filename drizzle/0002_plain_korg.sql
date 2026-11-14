CREATE TABLE `Comment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`postSlug` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`message` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Reaction` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`postSlug` text NOT NULL,
	`loves` integer DEFAULT 0 NOT NULL
);

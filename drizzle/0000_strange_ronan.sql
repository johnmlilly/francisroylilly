CREATE TABLE `PostNotification` (
	`postSlug` text PRIMARY KEY NOT NULL,
	`notifiedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Subscriber` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`firstName` text NOT NULL,
	`lastName` text NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`confirmedAt` integer,
	`unsubscribedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Subscriber_email_unique` ON `Subscriber` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `Subscriber_token_unique` ON `Subscriber` (`token`);
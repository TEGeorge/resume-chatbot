CREATE TABLE `chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`position` integer NOT NULL,
	`label` text NOT NULL,
	`text` text NOT NULL,
	`model` text NOT NULL,
	`embedding` blob NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chunks_source_idx` ON `chunks` (`source_type`,`source_id`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `summary` text;
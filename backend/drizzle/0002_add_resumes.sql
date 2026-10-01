CREATE TABLE `resumes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`file_name` text,
	`mime_type` text,
	`text` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `chats` ADD `resume_id` text REFERENCES resumes(id);
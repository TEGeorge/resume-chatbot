CREATE TABLE `scores` (
	`id` text PRIMARY KEY NOT NULL,
	`resume_id` text NOT NULL,
	`job_id` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model` text NOT NULL,
	`global_score` real NOT NULL,
	`band` text NOT NULL,
	`confidence` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);

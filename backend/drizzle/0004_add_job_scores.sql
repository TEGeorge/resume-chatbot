CREATE TABLE `job_scores` (
	`resume_id` text NOT NULL,
	`job_id` text NOT NULL,
	`rubric_version` text NOT NULL,
	`score` real NOT NULL,
	`result` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`resume_id`, `job_id`, `rubric_version`),
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);

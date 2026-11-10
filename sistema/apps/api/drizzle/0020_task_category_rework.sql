-- 0020: rework (retrabalho). A task category can be flagged `is_rework`: the client's tasks in such
-- categories count against its score (delinquency report and the client report; shared
-- `clientScore`). Existing categories are not rework (default false). The counts read `tasks` by
-- (workspace_id, category_id), already indexed (`tasks_category_idx`). See docs/api.md → "Retrabalho".
-- Runs inside the migrator's transaction; re-runnable (IF NOT EXISTS) and also on PGlite.

ALTER TABLE "task_categories" ADD COLUMN IF NOT EXISTS "is_rework" boolean DEFAULT false NOT NULL;

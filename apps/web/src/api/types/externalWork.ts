/** Passive origin/plan observations. No native lifecycle events or execution authority. */
export interface ExternalPullRequest { number: number; title: string; state: string; url: string }
export interface ExternalBranch {
  name: string; head_sha: string; ahead_by: number | null; behind_by: number | null;
  comparison: string; state: string; task_id: string | null; url: string;
  pull_request: ExternalPullRequest | null;
}
export interface ExternalPlanTask {
  todo_id: string; task_id: string; title: string; phase_id: string;
  phase_source: string; parent_id: string | null; milestone_ids: string[];
  priority_rank: number; critical_path: boolean; state: string; reason: string;
  dependencies: string[]; pending_dependencies: string[]; merged: boolean;
  observed_efforts: number; source_url: string; pull_requests: ExternalPullRequest[];
}
export interface ExternalWorkSnapshot {
  schema_version: number; family: string; source_repo: string; provider: string;
  source_url: string; default_branch: string; observed_at: string;
  task_observed_at: string; branch_observed_at: string;
  branches: ExternalBranch[];
  phases: { id: string; label: string; description: string }[];
  milestones: { id: string; label: string; task_ids: string[] }[];
  tasks: ExternalPlanTask[]; problems: string[];
}
export interface ExternalWorkReport { snapshots: ExternalWorkSnapshot[]; problems: string[] }

// deployments.ts — wire shapes for the forge's GitHub-shaped deployment routes
// (`/api/v3/repos/{owner}/{repo}/environments`) and the release compare route
// (`/api/v1/repos/{id}/compare`).

export type DeploymentState =
  | 'error'
  | 'failure'
  | 'inactive'
  | 'in_progress'
  | 'queued'
  | 'pending'
  | 'success';

export interface DeploymentCreator {
  login: string;
}

export interface Deployment {
  id: number;
  sha: string;
  ref: string;
  task: string;
  environment: string;
  description: string | null;
  /** Free-form deploy detail: release id, binary digest, host, previous release. */
  payload: Record<string, unknown>;
  creator: DeploymentCreator;
  created_at: string;
  production_environment: boolean;
  transient_environment: boolean;
}

export interface DeploymentStatus {
  id: number;
  state: DeploymentState;
  description: string | null;
  environment_url: string | null;
  log_url: string | null;
  creator: DeploymentCreator;
  created_at: string;
}

export interface DeploymentWithStatus {
  deployment: Deployment;
  /** The deployment's newest status; null until one is posted. */
  status: DeploymentStatus | null;
  /** True when the deployment ever reached `success`. */
  succeeded: boolean;
}

export interface EnvironmentSummary {
  name: string;
  /** Newest deployment of the environment, whatever its outcome. */
  latest: DeploymentWithStatus | null;
  /** What the environment runs now. */
  current: DeploymentWithStatus | null;
  /** The deployment `current` replaced: the rollback target. */
  previous: DeploymentWithStatus | null;
}

export interface EnvironmentsResponse {
  total_count: number;
  environments: EnvironmentSummary[];
}

/** One row of `GET /api/v1/deployments?environment=`. */
export interface DeployedRepository {
  /** `owner/name`. */
  repo: string;
  default_branch: string;
  sha: string;
  release: string | null;
  deployed_at: string;
  deployed_by: string;
  /** Commits on the default branch the deployment lacks; null = git could not say. */
  commits_behind: number | null;
}

/** Repositories with a live deployment in `environment`; others are omitted. */
export interface DeployedRepositoriesResponse {
  environment: string;
  repositories: DeployedRepository[];
}

export interface CompareCommit {
  sha: string;
  summary: string;
  author: string;
  committed_at: string;
}

/** `GET /api/v1/repos/{id}/compare?base=&head=`: commits in head but not base. */
export interface CompareResponse {
  base: string;
  head: string;
  base_sha: string;
  head_sha: string;
  ahead_by: number;
  behind_by: number;
  /** Oldest first, capped; `truncated` says whether `ahead_by` counts more. */
  commits: CompareCommit[];
  truncated: boolean;
}

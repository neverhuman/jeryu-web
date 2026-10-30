/** Read-only delivery evidence: Git objects, build records and target observations. */
export interface LineageCommit { sha: string; parents: string[]; summary: string; author: string; committed_at: string }
export interface LineageBranch { name: string; sha: string; updated_at: string; pull_number: number | null; pull_title: string | null; draft: boolean; base_ref: string | null; relation: 'contained' | 'ahead' | 'diverged' | 'unknown' }
export interface LineageGraph { repository: string; default_branch: string; default_sha: string; observed_at: string; branches: LineageBranch[]; commits: LineageCommit[]; truncated: boolean; missing_parents: string[]; shallow: boolean }
export interface BuildArtifact { repository: string; digest: string; tags: string[] }
export interface CandidateBuild { id: string; deliverable: string; built_at: string; observed_at: string; source_repo: string; source_sha: string; status: 'building' | 'built' | 'failed' | 'rejected'; artifacts: BuildArtifact[]; log_url: string | null }
export interface BuildPlacement { deliverable: string; environment: string; target: string; current: string | null; previous: string | null; production: boolean }
export interface BuildInventory { family: string; deliverable: string; deliverables: string[]; builds: CandidateBuild[]; placements: BuildPlacement[]; placements_observed_at: string | null; total: number; next_offset: number | null }

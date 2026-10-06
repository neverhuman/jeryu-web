// JMCP/control-plane local wire types. These are intentionally frontend-local
// until the Rust read-model exporter owns this contract.
export type EvidenceState =
  | 'fresh'
  | 'missing'
  | 'queued'
  | 'failed'
  | 'unknown';

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface SourceLink {
  label: string;
  url: string;
}

export interface ControlPlaneSummary {
  repoCount: number;
  openPrCount: number;
  draftPrCount: number;
  queuedCheckCount: number;
  runningCheckCount: number;
  failingCheckCount: number;
  missingCheckPrCount: number;
  /**
   * Open PRs with no failing check yet: none recorded, or some in flight.
   * Optional: an older forge does not send it.
   */
  waitingCheckPrCount?: number;
  /**
   * Open PRs with at least one failing check; `failingCheckCount` counts check
   * runs, which is a different number when one lane breaks twice. Optional:
   * an older forge does not send it.
   */
  failingCheckPrCount?: number;
  priorityCount: number;
  criticalPriorityCount: number;
  highPriorityCount: number;
  mirrorState: EvidenceState;
  artifactState: EvidenceState;
  runnerState: EvidenceState;
}

export interface LocalAuthority {
  sourceOfTruth: string;
  state: EvidenceState;
  docsUrl: string;
}

export interface ControlRepo {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  openPullRequests: number;
  draftPullRequests: number;
  queuedChecks: number;
  runningChecks: number;
  failingChecks: number;
  latestHeadSha: string | null;
  state: EvidenceState;
}

export interface ControlPullRequest {
  repo: string;
  number: number;
  title: string;
  /** Login of the pull request's author. */
  author: string;
  draft: boolean;
  state: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  mergeable: boolean;
  mergeableState: string;
  changedFiles: string[];
  stateEvidence: EvidenceState;
  sourceLinks: SourceLink[];
  /**
   * When the forge last touched it; the collection is ordered by it. Optional:
   * a payload written before the field existed carries no timestamp.
   */
  updatedAt?: string;
  checks: {
    total: number;
    queued: number;
    running: number;
    failing: number;
    successful: number;
    missing: boolean;
  };
}

export interface ArtifactEvidence {
  state: EvidenceState;
  artifactCount: number;
  reason: string;
  sourceLinks: SourceLink[];
}

export interface ArtifactLatestResponse {
  schemaVersion: string;
  state: EvidenceState;
  latestBuild: ArtifactEvidence;
  latestRelease: ArtifactEvidence;
  mirrorArtifacts: ArtifactEvidence;
  docsUrl: string;
  absenceIsSuccess: boolean;
}

export interface MirrorEvidence {
  name: string;
  state: EvidenceState;
  reason: string;
  docsUrl: string;
}

export interface RemoteStatusResponse {
  schemaVersion: string;
  state: EvidenceState;
  mirrors: MirrorEvidence[];
  divergence: {
    state: EvidenceState;
    reason: string;
    localDefaultBranches: SourceLink[];
    mirrorDefaultBranches: SourceLink[];
  };
}

export interface RunnerFabricResponse {
  schemaVersion: string;
  local: {
    state: EvidenceState;
    nodes: number;
    onlineRunners: number;
    offlineRunners: number;
    busyRunners: number;
    idleRunners: number;
    totalSlots: number;
    activeSlots: number;
    utilization: number;
    lastUpdated: string | null;
    nodeDetails: RunnerNodeSummary[];
  };
  mirror: MirrorEvidence;
  /** The forge server's own build. Absent from an older forge. */
  forge?: ForgeBuild;
  /** The forge's clock when it answered (RFC3339). Absent from an older forge. */
  serverTime?: string;
}

/** What code the forge itself runs: its release and the commits it was built from. */
export interface ForgeBuild {
  version: string;
  /** The server's commit; null when the build did not record one. */
  commit: string | null;
  /** The commit of the web bundle the server pins; null when unknown. */
  webCommit: string | null;
}

/** The code a runner has installed and runs. */
export interface RunnerCode {
  repo: string;
  commit: string;
  version?: string;
  installedAt?: string;
}

/**
 * One tool a runner evaluates pull requests with: the scorer, scanners and
 * linters on its PATH, by name, version and the sha256 of the binary.
 */
export interface RunnerTool {
  name: string;
  version?: string;
  sha256?: string;
}

/**
 * What a runner is, as the forge classifies it. Absent from an older forge,
 * which leaves the page to read it from the labels.
 */
export type RunnerNodeKind =
  | 'gate'
  | 'reviewer'
  | 'automation'
  | 'deployer'
  | 'jankurai-audit'
  | 'workcell';

export interface RunnerNodeSummary {
  runnerId: string;
  /** The forge's classification; absent from an older forge. */
  kind?: RunnerNodeKind;
  source: string;
  state: string;
  capacity: number;
  inFlight: number;
  labels: string[];
  classes: string[];
  activeTaskCount: number;
  lastUpdated: string | null;
  activeTasks: RunnerTaskSummary[];
  /** The last job a heartbeat runner finished; absent for other runner kinds. */
  lastActivity?: RunnerLastActivity | null;
  /**
   * Seconds of silence after which the forge shows this runner offline
   * (`max(180, 3 * intervalSeconds)`). Absent from an older forge and on
   * nodes that do not report by heartbeat.
   */
  offlineAfterSeconds?: number | null;
  /**
   * Reviewer only: repositories it is reviewing where the merge identity has
   * no write grant, so an approval there cannot land. Absent when none.
   */
  mergeGrantGaps?: MergeGrantGap[];
  /** The runner's own installed code. Absent from an older forge or runner. */
  code?: RunnerCode;
  /** The tools that evaluate a pull request on this runner. Absent from an older forge. */
  tools?: RunnerTool[];
}

/** The forge's answer to the last attempt to merge or enqueue a pull request. */
export interface MergeAttempt {
  /** `merged`, `queued`, or `refused`. */
  result: string;
  status: number;
  /** Forge error code of a refusal (`permission_denied`, `queue_merge_commits`). */
  code?: string;
  message?: string;
  actor?: string;
  at: string;
}

/** The merge identity cannot write to a repository. */
export interface MergeGrantGap {
  repo: string;
  identity: string;
  message: string;
}

/** `GET /api/v1/repos/{id}/pulls/{number}/merge-attempt`. */
export interface MergeAttemptResponse {
  repo: string;
  number: number;
  attempt: MergeAttempt | null;
  /** `code - message` of the last refusal; null when nothing blocks. */
  blockedReason: string | null;
  grantGap: MergeGrantGap | null;
  approvedBy: string[];
}

export interface RunnerLastActivity {
  repo: string;
  /** Null for work that has no pull request (auto-stage stages a commit). */
  pr: number | null;
  sha: string;
  recipe: string;
  conclusion: string;
  seconds: number;
  finishedAt: string;
  /** Reviewer only: the forge's answer to the last merge attempt on this PR. */
  mergeAttempt?: MergeAttempt | null;
}

export interface RunnerTaskSummary {
  taskId: string;
  jobId: string;
  agentRunId: string | null;
  workcellId: string | null;
  repo: string | null;
  label: string;
  program: string;
  state: string;
  startedAt: string | null;
  updatedAt: string | null;
  ttyPreview: RunnerTtyPreview;
  /**
   * How long a gate or review of this recipe on this repository usually takes,
   * from its recent passes. Absent with fewer than three, for workcell runs,
   * and from an older forge.
   */
  estimate?: RunnerTaskEstimate | null;
}

/** The median and 90th percentile of a recipe's recent complete passes, in seconds. */
export interface RunnerTaskEstimate {
  typicalSeconds: number;
  slowSeconds: number;
  samples: number;
}

export interface RunnerTtyPreview {
  state: EvidenceState;
  lines: string[];
}

export interface CodegraphControlSummary {
  state: EvidenceState;
  indexedSymbols: number;
  indexedReferences: number;
  crateEdges: number;
  indexedFiles: number;
  latestIndexRun: string | null;
  reason: string;
}

export interface ToolBuildControlSummary {
  state: EvidenceState;
  clusterCount: number;
  ignoredCount: number;
  topClusters: ToolBuildClusterSummary[];
}

export interface ToolBuildClusterSummary {
  clusterId: string;
  repoId: string;
  score: number;
  occurrenceCount: number;
  fileCount: number;
  insight: string;
}

export interface PriorityInsight {
  id: string;
  title: string;
  severity: InsightSeverity;
  score: number;
  confidence: number;
  owner: string;
  proofLane: string;
  recommendedAction: string;
  evidence: string[];
  sourceLinks: SourceLink[];
  state: EvidenceState;
  rulesVersion: string;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: string;
  state: EvidenceState;
  weight: number;
  metadata: Record<string, string>;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: string;
  state: EvidenceState;
  weight: number;
  /**
   * Edge facts the server has, as plain strings. `depends_on` edges carry the
   * pin comparison: `pinState`, `pinnedRef`, `behind`.
   */
  metadata?: Record<string, string>;
}

export interface GraphCluster {
  id: string;
  label: string;
  kind: string;
  state: EvidenceState;
  severity: InsightSeverity;
  nodeIds: string[];
  insights: string[];
}

export interface RepoGraphResponse {
  schemaVersion: string;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  insights: Array<{
    id: string;
    clusterId: string;
    title: string;
    evidence: string[];
  }>;
}

/**
 * `GET /api/v1/control-plane/repo-graph?include=depends_on` (`jeryu.repo_graph/v2`).
 * The same shape as the snapshot graph, with the requested edge kinds added.
 */
export type RepoGraphInclude = 'depends_on';

export interface McpToolHealth {
  state: EvidenceState;
  toolCount: number;
  liveBackedTools: string[];
  degradedTools: string[];
}

/** What a paged collection of the snapshot applied, from `page.collections`. */
export interface CollectionPageInfo {
  limit: number;
  page: number;
  /** Rows matching the request before paging. */
  total: number;
  has_more: boolean;
}

/**
 * `page` of `GET /api/v1/control-plane/status`: the limit and page it applied
 * and, per collection, how much of it the response carries. A reader that
 * counts rows needs this to know whether it is counting all of them.
 */
export interface ControlPlanePageReport {
  limit: number;
  page: number;
  collections: Record<string, CollectionPageInfo>;
}

export interface ControlPlaneSnapshot {
  schemaVersion: string;
  generatedAt: string;
  localAuthority: LocalAuthority;
  summary: ControlPlaneSummary;
  repos: ControlRepo[];
  pullRequests: ControlPullRequest[];
  checkRuns: Array<{
    id: string;
    repo: string;
    name: string;
    headSha: string;
    status: string;
    conclusion: string | null;
    state: EvidenceState;
  }>;
  artifacts: ArtifactLatestResponse;
  runners: RunnerFabricResponse;
  workflows: unknown[];
  releases: unknown;
  workcells: unknown;
  agentRuns: unknown[];
  codegraph: CodegraphControlSummary;
  toolBuild: ToolBuildControlSummary;
  mcp: McpToolHealth;
  mirror: RemoteStatusResponse;
  priorities: PriorityInsight[];
  repoGraph: RepoGraphResponse;
  /** Absent from an older forge, which sent every row unpaged. */
  page?: ControlPlanePageReport;
}

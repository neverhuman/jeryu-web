// automation.ts — wire types for what acts on one repository:
//
//   GET /api/v1/repos/{id}/automation
//
// The forge already held every fact here, each behind its own route: the
// checks, the required contexts, the reviewer and merger identities and their
// grants, the runners and deployers that report by heartbeat, and the mirrors
// the repository is copied to. This one envelope joins them so the repository
// page can answer "what happens when this merges, and where does it end up?".

/** One check name and its newest run on the repository. */
export interface AutomationCheck {
  name: string;
  /** The default branch's protection rule names this context. */
  required: boolean;
  /** `reported`, or `missing` for a required context that never ran. */
  state: 'reported' | 'missing';
  lastConclusion?: string | null;
  lastRunAt?: string | null;
  lastHeadSha?: string | null;
  detailsUrl?: string | null;
}

/** Whether an identity holds the access its job needs. */
export interface AutomationGrant {
  /** What the actor's job needs: `read`, `write` or `admin`. */
  required: string;
  present: boolean;
  /** What the identity holds today; absent when it holds nothing. */
  held?: string | null;
  /** One sentence naming what the missing grant costs. */
  warning?: string | null;
}

/** The last thing an actor did to the repository. */
export interface AutomationRun {
  conclusion: string;
  at: string;
  sha?: string | null;
  pr?: number | null;
  /** Where a deployer put it (`edge-pages`, `staging`, …). */
  target?: string | null;
  detail?: string | null;
}

export type AutomationActorKind =
  | 'reviewer'
  | 'merger'
  | 'gate-runner'
  | 'deployer'
  | 'jankurai-audit'
  | 'automation';

/** One thing that acts on the repository. */
export interface AutomationActor {
  kind: AutomationActorKind;
  /** A login, a runner id or an environment name. */
  identity: string;
  /** One line saying what it does. */
  role: string;
  state: 'online' | 'offline' | 'configured';
  grant?: AutomationGrant | null;
  lastRun?: AutomationRun | null;
}

/** One place the repository is copied to. */
export interface AutomationMirror {
  /** Where the copy lives, as a reader would open it. */
  target: string;
  direction: 'push' | 'pull';
  refs: string[];
  state: 'in_sync' | 'behind' | 'ahead' | 'diverged' | 'unknown';
  /** True while the target lacks commits the forge holds. */
  behind: boolean;
  forgeHead?: string | null;
  /** The sha the target holds: the last thing pushed to it. */
  lastPushedSha?: string | null;
  lastPushedAt?: string | null;
  lastCheckedAt?: string | null;
  lastError?: string | null;
}

/** One grant on the repository. */
export interface AutomationGrantRow {
  login: string;
  access: string;
  grantedBy: string;
  grantedAt: string;
}

export interface RepoAutomation {
  /** `owner/name`. */
  repo: string;
  defaultBranch: string;
  checks: AutomationCheck[];
  requiredContexts: string[];
  actors: AutomationActor[];
  mirrors: AutomationMirror[];
  /** Listed only for a caller who may administer the repository. */
  grants: AutomationGrantRow[];
  /** False when the caller may not read the grants, so an empty list never
   *  reads as "nobody has access". */
  grantsVisible: boolean;
  /** One sentence per thing only a person can settle. */
  warnings: string[];
}

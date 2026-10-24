// endpoints.ts — typed URL builders (W-FE-03).
//
// Single source of truth for every API path so URL bugs surface at
// typecheck time. All paths are versioned (§35.1.1) under `/api/v1/`.

import type { RepoGraphInclude } from './types/controlPlane';
import type { PipelineEventsQuery, PipelineHistogramQuery } from './types/pipeline';
import type { SearchQuery } from './types/search';
import type { ScorecardQuery } from './types/scorecard';
import type { UsageQuery } from './types/usage';
import type { FlowQuery } from './types/flow';
import type { YieldQuery } from './types/yield';

export const endpoints = {
  bootstrap: (): string => '/api/v1/bootstrap',
  authMe: (): string => '/api/v1/auth/me',
  authLogin: (): string => '/api/v1/auth/login',
  /** Spend a mailed sign-up link: `{token, login, password}` creates the account. */
  authSignup: (): string => '/api/v1/auth/signup',
  /** Mail a sign-up link to an address; always 202, whoever owns it. */
  authSignupStart: (): string => '/api/v1/auth/signup/start',
  /** Whether sign-up is open (`email`) or `closed`, and where the waitlist is. No session needed. */
  authSignupPolicy: (): string => '/api/v1/auth/signup/policy',
  /** Public waitlist. Does not create an account or a session. */
  waitlistJoin: (): string => '/api/v1/waitlist',
  authLogout: (): string => '/api/v1/auth/logout',
  authPassword: (): string => '/api/v1/auth/password',
  /** The account's recovery address and whether it is verified (GET, PUT). */
  authEmail: (): string => '/api/v1/auth/email',
  /** Spend a mailed verification link. No session needed. */
  authEmailVerify: (): string => '/api/v1/auth/email/verify',
  authEmailVerifyResend: (): string => '/api/v1/auth/email/verify/resend',
  /** Mail a reset link to a verified address; always 202, whoever asks. */
  authPasswordForgot: (): string => '/api/v1/auth/password/forgot',
  /** Spend a mailed reset link and set the new password. No session needed. */
  authPasswordReset: (): string => '/api/v1/auth/password/reset',
  authTokens: (): string => '/api/v1/auth/tokens',
  authToken: (id: string): string =>
    `/api/v1/auth/tokens/${encodeURIComponent(id)}`,
  /** The caller's agent provider connections (connect once, used by every run). */
  providerConnections: (): string => '/api/v1/me/provider-connections',
  providerConnection: (id: string): string =>
    `/api/v1/me/provider-connections/${encodeURIComponent(id)}`,
  providerLogins: (): string => '/api/v1/me/provider-connections/login',
  providerLogin: (id: string): string =>
    `/api/v1/me/provider-connections/login/${encodeURIComponent(id)}`,
  adminUsers: (): string => '/api/v1/admin/users',
  /** Public waitlist sign-ups, newest request first (admin-only). */
  adminWaitlist: (limit: number, offset: number): string =>
    `/api/v1/admin/waitlist?limit=${limit}&offset=${offset}`,
  adminUserKind: (login: string): string =>
    `/api/v1/admin/users/${encodeURIComponent(login)}/kind`,
  adminResetPassword: (login: string): string =>
    `/api/v1/admin/users/${encodeURIComponent(login)}/reset-password`,
  adminRepoGrants: (owner: string, repo: string): string =>
    `/api/v1/admin/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/grants`,
  adminRepoGrant: (owner: string, repo: string, login: string): string =>
    `/api/v1/admin/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/grants/${encodeURIComponent(login)}`,
  /** Instance-wide settings any caller may read (the internal wiki). */
  siteSettings: (): string => '/api/v1/site-settings',
  /** The same settings as an admin reads and writes them. */
  adminSiteSettings: (): string => '/api/v1/admin/site-settings',

  /** What the running server is: its version and the commits it was built from. */
  version: (): string => '/api/v1/version',

  /** Product-wide search; see `jeryu-deploy/docs/search.md`. */
  search: (query: SearchQuery): string => {
    const params = new URLSearchParams({ q: query.q });
    if (query.kind && query.kind.length > 0) params.set('kind', query.kind.join(','));
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    return `/api/v1/search?${params.toString()}`;
  },

  repos: (): string => '/api/v1/repos',
  repo: (id: string): string => `/api/v1/repos/${encodeURIComponent(id)}`,
  refs: (id: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/refs`,
  tree: (id: string, params: { ref: string; path?: string }): string => {
    const qs = new URLSearchParams({ ref: params.ref });
    if (params.path !== undefined && params.path !== '') {
      qs.set('path', params.path);
    }
    return `/api/v1/repos/${encodeURIComponent(id)}/tree?${qs.toString()}`;
  },
  blob: (
    id: string,
    params: { ref: string; path: string; render?: 'html' }
  ): string => {
    const qs = new URLSearchParams({ ref: params.ref, path: params.path });
    if (params.render) qs.set('render', params.render);
    return `/api/v1/repos/${encodeURIComponent(id)}/blob?${qs.toString()}`;
  },
  raw: (id: string, params: { ref: string; path: string }): string => {
    const qs = new URLSearchParams({ ref: params.ref, path: params.path });
    return `/api/v1/repos/${encodeURIComponent(id)}/raw?${qs.toString()}`;
  },
  /**
   * The same bytes at `/raw/{ref}/{path}`, so a raw HTML page's relative
   * links (`<img src="shot.png">`) resolve to its sibling files. Each segment
   * is encoded on its own; a ref with slashes is matched longest-first.
   */
  rawPath: (id: string, params: { ref: string; path: string }): string => {
    const segments = (value: string): string =>
      value.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return `/api/v1/repos/${encodeURIComponent(id)}/raw/${segments(params.ref)}/${segments(params.path)}`;
  },
  readme: (id: string, ref?: string): string => {
    const base = `/api/v1/repos/${encodeURIComponent(id)}/readme`;
    return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
  },
  /** Every Markdown page in the commit `ref` names, at any depth. */
  pages: (id: string, ref?: string): string => {
    const base = `/api/v1/repos/${encodeURIComponent(id)}/pages`;
    return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
  },
  /** Which commit last changed each line of one file. */
  blame: (id: string, params: { ref?: string; path: string }): string => {
    const qs = new URLSearchParams({ path: params.path });
    if (params.ref) qs.set('ref', params.ref);
    return `/api/v1/repos/${encodeURIComponent(id)}/blame?${qs.toString()}`;
  },
  /**
   * A branch's commits, newest first (`ref` defaults to the default branch).
   * `limit` caps the page; the response's `page.total` counts all of them.
   * `path` narrows them to the commits that touched one file or directory.
   */
  commits: (
    id: string,
    params: { ref?: string; path?: string; limit?: number; page?: number } = {}
  ): string => {
    const qs = new URLSearchParams();
    if (params.ref) qs.set('ref', params.ref);
    if (params.path) qs.set('path', params.path);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.page !== undefined) qs.set('page', String(params.page));
    const suffix = qs.toString();
    const base = `/api/v1/repos/${encodeURIComponent(id)}/commits`;
    return suffix ? `${base}?${suffix}` : base;
  },
  /** One commit: its message, who wrote it, its parents and its diff. */
  commit: (id: string, sha: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/commit/${encodeURIComponent(sha)}`,
  compare: (id: string, base: string, head: string): string => {
    const qs = new URLSearchParams({ base, head });
    return `/api/v1/repos/${encodeURIComponent(id)}/compare?${qs.toString()}`;
  },
  /** Newest tag reachable from `branch` (default branch when omitted). */
  releaseTag: (id: string, branch?: string): string => {
    const base = `/api/v1/repos/${encodeURIComponent(id)}/release-tag`;
    return branch ? `${base}?branch=${encodeURIComponent(branch)}` : base;
  },
  /** Commits of other repositories that live deployments carry, forge-wide. */
  releasePins: (): string => '/api/v1/release-pins',
  pulls: (id: string, state?: string, paging?: { limit: number; page: number }): string => {
    const base = `/api/v1/repos/${encodeURIComponent(id)}/pulls`;
    const query = new URLSearchParams();
    if (state) query.set('state', state);
    if (paging) {
      query.set('limit', String(paging.limit));
      query.set('page', String(paging.page));
    }
    const text = query.toString();
    return text ? `${base}?${text}` : base;
  },
  pull: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}`,
  pullDiff: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/diff`,
  pullChecks: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/checks`,
  pullThreads: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/threads`,
  pullReviews: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/reviews`,
  pullApprove: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/approve`,
  /** The draft lifecycle: POST marks a draft ready for review. */
  pullReady: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/ready`,
  /** POST puts an open pull request back into draft. */
  pullDraft: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/draft`,
  pullMerge: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/merge`,
  pullMergeAttempt: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/merge-attempt`,
  /** Which of a blocked passport's blockers the viewer can clear, and how. */
  pullOwnerPaths: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/owner-paths`,
  /** POST joins the merge queue (idempotent); DELETE leaves it. */
  pullQueue: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/queue`,
  /** Every queue entry of one repository, whatever state it is in. */
  repoMergeQueue: (id: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/merge-queue`,
  /** What acts on the repository (checks, reviewer, merger, runners,
   *  deployers, grants) and where it is mirrored to. */
  repoAutomation: (id: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/automation`,

  ws: (): string => '/api/v1/ws',
  /**
   * The snapshot. `limit` raises the page every collection in it is cut to
   * (the server allows up to 500); a view that must see all the open work
   * asks for more than the default 100.
   */
  controlPlaneStatus: (limit?: number): string =>
    limit === undefined
      ? '/api/v1/control-plane/status'
      : `/api/v1/control-plane/status?limit=${limit}`,
  controlPlaneRunners: (): string => '/api/v1/control-plane/runners',
  /**
   * The repository graph on its own. `include` asks for edge kinds the
   * snapshot graph leaves out, such as `depends_on` (`jeryu.repo_graph/v2`).
   */
  controlPlaneRepoGraph: (params?: { include?: RepoGraphInclude[] }): string => {
    const include = params?.include ?? [];
    return include.length > 0
      ? `/api/v1/control-plane/repo-graph?include=${include.map(encodeURIComponent).join(',')}`
      : '/api/v1/control-plane/repo-graph';
  },
  /** GitHub-shaped per-environment summary (latest, current, previous). */
  repoEnvironments: (owner: string, repo: string): string =>
    `/api/v3/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments`,
  /** GitHub-shaped check runs of one commit-ish (a branch name works). */
  commitCheckRuns: (owner: string, repo: string, ref: string): string =>
    `/api/v3/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}/check-runs`,
  /**
   * GitHub-shaped commits of one pull request, oldest first. `perPage`/`page`
   * page the list the way the server's `Link` header does.
   */
  pullCommits: (
    owner: string,
    repo: string,
    prNumber: string,
    params?: { perPage?: number; page?: number }
  ): string => {
    const base = `/api/v3/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(prNumber)}/commits`;
    const qs = new URLSearchParams();
    if (params?.perPage !== undefined) qs.set('per_page', String(params.perPage));
    if (params?.page !== undefined) qs.set('page', String(params.page));
    const suffix = qs.toString();
    return suffix ? `${base}?${suffix}` : base;
  },
  /** GitHub-shaped pull request; `PATCH {state}` closes or reopens it. */
  githubPull: (owner: string, repo: string, prNumber: string): string =>
    `/api/v3/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(prNumber)}`,
  /** GitHub-shaped issue comments; a pull request's number is its issue number. */
  githubIssueComments: (owner: string, repo: string, number: string): string =>
    `/api/v3/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(number)}/comments`,
  /** GitHub-shaped branch protection rule; 404 when the branch is unprotected. */
  branchProtection: (owner: string, repo: string, branch: string): string =>
    `/api/v3/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}/protection`,
  ecosystem: (): string => '/api/v1/ecosystem',
  toolBuildClusters: (params?: {
    repo?: string;
    limit?: number;
    includeIgnored?: boolean;
  }): string => {
    const qs = new URLSearchParams();
    if (params?.repo) qs.set('repo', params.repo);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.includeIgnored) qs.set('include_ignored', 'true');
    const suffix = qs.toString();
    return suffix
      ? `/api/v1/codegraph/tool-build/clusters?${suffix}`
      : '/api/v1/codegraph/tool-build/clusters';
  },
  fleetToolAdoption: (): string => '/api/v1/fleet/tool-adoption',
  toolRegistrySummary: (): string => '/api/v1/tools/registry/summary',
  toolFinderScan: (): string => '/api/v1/tool-finder/scan',
  toolFinderDashboard: (params?: {
    limit?: number;
    includeIgnored?: boolean;
  }): string => {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.includeIgnored) qs.set('include_ignored', 'true');
    const suffix = qs.toString();
    return suffix
      ? `/api/v1/tool-finder/dashboard?${suffix}`
      : '/api/v1/tool-finder/dashboard';
  },
  toolFinderPropose: (clusterId: string): string =>
    `/api/v1/tool-finder/propose/${encodeURIComponent(clusterId)}`,
  toolProposalDecision: (toolId: string): string =>
    `/api/v1/tool-finder/proposals/${encodeURIComponent(toolId)}/decision`,
  toolBuildClusterFeedback: (clusterId: string): string =>
    `/api/v1/codegraph/tool-build/clusters/${encodeURIComponent(clusterId)}/feedback`,
  repoAgentRuns: (id: string): string => `/api/v1/repos/${encodeURIComponent(id)}/agent-runs`,
  repoSessions: (id: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/sessions`,
  /** The caller's Firecracker sessions across repositories, newest first. */
  mySessions: (params?: { state?: string; repo?: string; limit?: number }): string => {
    const qs = new URLSearchParams();
    if (params?.state) qs.set('state', params.state);
    if (params?.repo) qs.set('repo', params.repo);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    const suffix = qs.toString();
    return suffix ? `/api/v1/me/sessions?${suffix}` : '/api/v1/me/sessions';
  },
  /** One of the caller's sessions, by its session, agent run or shell run id. */
  mySession: (id: string): string => `/api/v1/me/sessions/${encodeURIComponent(id)}`,
  /** Whether the session runner can take a session now. */
  runnerStatus: (): string => '/api/v1/runner/status',
  shiftFamilies: (): string => '/api/v1/shift/families',
  shiftTodos: (params?: Record<string, string | undefined>): string => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) qs.set(key, value);
    }
    const suffix = qs.toString();
    return suffix ? `/api/v1/shift/todos?${suffix}` : '/api/v1/shift/todos';
  },
  shiftTodoAction: (family: string, id: string): string =>
    `/api/v1/shift/todos/${encodeURIComponent(family)}/${encodeURIComponent(id)}/action`,
  shiftTodoPeople: (family: string, id: string): string =>
    `/api/v1/shift/todos/${encodeURIComponent(family)}/${encodeURIComponent(id)}/people`,
  /** A todo's comment thread: `GET` lists it, `POST` appends one. */
  shiftTodoComments: (family: string, id: string): string =>
    `/api/v1/shift/todos/${encodeURIComponent(family)}/${encodeURIComponent(id)}/comments`,
  shiftWorkers: (): string => '/api/v1/shift/workers',
  shiftWorkersHistory: (hours: number): string =>
    `/api/v1/shift/workers/history?hours=${hours}`,
  shiftShifts: (family?: string): string =>
    family
      ? `/api/v1/shift/shifts?family=${encodeURIComponent(family)}`
      : '/api/v1/shift/shifts',
  shiftOpenPr: (family: string): string =>
    `/api/v1/shift/shifts/${encodeURIComponent(family)}/pr`,
  /** Pipeline event log (admin-only). `kind` ending in `.` is a prefix match. */
  events: (params?: PipelineEventsQuery): string => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === '' || value === false) continue;
      qs.set(key, String(value));
    }
    const suffix = qs.toString();
    return suffix ? `/api/v1/events?${suffix}` : '/api/v1/events';
  },
  /** Event volume per bucket for the Activity band (admin-only; 404 on an
   *  older server, where the band is left out rather than shown broken). */
  eventsHistogram: (params?: PipelineHistogramQuery): string => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === '') continue;
      qs.set(key, String(value));
    }
    const suffix = qs.toString();
    return suffix ? `/api/v1/events/histogram?${suffix}` : '/api/v1/events/histogram';
  },
  /** Token usage: what each working slot is spending right now, today's
   *  totals and the tokens-per-bucket sparkline (admin-only; 404 on a server
   *  that predates the route, where the panel is left out). */
  usage: (params?: UsageQuery): string => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === '') continue;
      qs.set(key, String(value));
    }
    const suffix = qs.toString();
    return suffix ? `/api/v1/usage?${suffix}` : '/api/v1/usage';
  },
  /** "Needs you": what is waiting on a human right now (admin-only). */
  attention: (params?: { limit?: number; page?: number }): string => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.page) qs.set('page', String(params.page));
    const suffix = qs.toString();
    return suffix ? `/api/v1/attention?${suffix}` : '/api/v1/attention';
  },
  /** Hide attention items by id until a date (admin-only; `until: null` lists them again). */
  attentionAcks: (): string => '/api/v1/attention/acks',
  /** What each deploy repo pins versus its dependencies' main (admin-only). */
  pins: (): string => '/api/v1/pins',
  /** Every family that has reported a release board (admin-only). */
  releaseBoards: (): string => '/api/v1/release-board',
  /** One family's newest release board (admin-only; 404 until one is reported). */
  releaseBoard: (family: string): string =>
    `/api/v1/release-board/${encodeURIComponent(family)}`,
  /** Queue the deploy a stage's Promote names (deployer-only). */
  releaseBoardPromote: (family: string): string =>
    `/api/v1/release-board/${encodeURIComponent(family)}/promote`,

  /** How the jankurai/proof gate behaved over the last `days` days. */
  qualityGateOverview: (days: number): string =>
    `/api/v1/quality-gate/overview?days=${days}`,
  /** The heads one rule flagged over the same window. */
  qualityGateRule: (rule: string, days: number): string =>
    `/api/v1/quality-gate/rules/${encodeURIComponent(rule)}?days=${days}`,
  /** One scored head: its score and every finding on it. `repo` is `owner/name`. */
  qualityGateHead: (repo: string, sha: string): string =>
    `/api/v1/quality-gate/heads/${repo
      .split('/')
      .map(encodeURIComponent)
      .join('/')}/${encodeURIComponent(sha)}`,
  /** A repository's ingested scores on one branch, newest first. `id` is `owner/name`. */
  repoJankuraiScores: (id: string, branch: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/jankurai-scores?branch=${encodeURIComponent(branch)}`,
  /** Record that a finding looks wrong to the operator reading it (admin-only). */
  qualityGateDispute: (findingId: string): string =>
    `/api/v1/quality-gate/findings/${encodeURIComponent(findingId)}/dispute`,

  /** Report one incident (global admins and event reporters). */
  incidents: (): string => '/api/v1/incidents',

  /** Spend against what reached main: cost per merged change (admin-only). */
  yieldReport: (query: YieldQuery): string => {
    const qs = new URLSearchParams();
    if (query.family) qs.set('family', query.family);
    if (query.since) qs.set('since', query.since);
    if (query.until) qs.set('until', query.until);
    if (query.by) qs.set('by', query.by);
    const suffix = qs.toString();
    return suffix ? `/api/v1/yield?${suffix}` : '/api/v1/yield';
  },

  /** Delivery outcome scorecard, unknown-aware and admin-only. */
  scorecard: (query: ScorecardQuery): string => {
    const qs = new URLSearchParams();
    if (query.window) qs.set('window', query.window);
    if (query.family) qs.set('family', query.family);
    if (query.repo) qs.set('repo', query.repo);
    const suffix = qs.toString();
    return suffix ? `/api/v1/scorecard?${suffix}` : '/api/v1/scorecard';
  },

  /** Where work sits on the delivery line, over a window (admin-only). */
  flow: (query: FlowQuery): string => {
    const qs = new URLSearchParams();
    if (query.repo) qs.set('repo', query.repo);
    if (query.family) qs.set('family', query.family);
    if (query.days) qs.set('days', String(query.days));
    const suffix = qs.toString();
    return suffix ? `/api/v1/flow?${suffix}` : '/api/v1/flow';
  },

  /** Account agent enrollments. */
  bots: (): string => '/api/v1/bots',
  botGrants: (id: string): string => `/api/v1/bots/${encodeURIComponent(id)}/grants`,
  botGrant: (id: string, owner: string, repo: string): string =>
    `/api/v1/bots/${encodeURIComponent(id)}/grants/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  botTokensRevokeIssued: (): string => '/api/v1/bots/tokens/revoke-issued',
  orgs: (): string => '/api/v1/orgs',
  org: (org: string): string => `/api/v1/orgs/${encodeURIComponent(org)}`,
  orgOwner: (org: string, login: string): string =>
    `/api/v1/orgs/${encodeURIComponent(org)}/owners/${encodeURIComponent(login)}`,
  orgTeams: (org: string): string => `/api/v1/orgs/${encodeURIComponent(org)}/teams`,
  orgTeamMember: (org: string, team: string, login: string): string =>
    `/api/v1/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(team)}/members/${encodeURIComponent(login)}`,
  orgBots: (org: string): string => `/api/v1/orgs/${encodeURIComponent(org)}/bots`,
  botKeys: (id: string): string =>
    `/api/v1/bots/${encodeURIComponent(id)}/keys`,
  botSuspend: (id: string): string =>
    `/api/v1/bots/${encodeURIComponent(id)}/suspend`,
  botRevoke: (id: string): string =>
    `/api/v1/bots/${encodeURIComponent(id)}/revoke`,
  /** Agent tokens of one bot: list (GET) and issue (POST). */
  botTokens: (id: string): string =>
    `/api/v1/bots/${encodeURIComponent(id)}/tokens`,
  botTokenRevoke: (id: string, tokenId: string): string =>
    `/api/v1/bots/${encodeURIComponent(id)}/tokens/${encodeURIComponent(tokenId)}/revoke`,
  /** Reach is already clipped to this repository. */
  repoBots: (id: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/bots`,
  /** Every bot's activity in this repository, oldest first (writers only). */
  repoBotActivity: (id: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/bot-activity`,
} as const;

export type Endpoints = typeof endpoints;

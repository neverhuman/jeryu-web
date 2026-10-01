// endpoints.ts — typed URL builders (W-FE-03).
//
// Single source of truth for every API path so URL bugs surface at
// typecheck time. All paths are versioned (§35.1.1) under `/api/v1/`.

import type { RepoGraphInclude } from './types/controlPlane';
import type { PipelineEventsQuery } from './types/pipeline';

export const endpoints = {
  bootstrap: (): string => '/api/v1/bootstrap',
  authMe: (): string => '/api/v1/auth/me',
  authLogin: (): string => '/api/v1/auth/login',
  authSignup: (): string => '/api/v1/auth/signup',
  authLogout: (): string => '/api/v1/auth/logout',
  authPassword: (): string => '/api/v1/auth/password',
  authTokens: (): string => '/api/v1/auth/tokens',
  authToken: (id: string): string =>
    `/api/v1/auth/tokens/${encodeURIComponent(id)}`,
  adminUsers: (): string => '/api/v1/admin/users',
  adminResetPassword: (login: string): string =>
    `/api/v1/admin/users/${encodeURIComponent(login)}/reset-password`,
  adminRepoGrants: (owner: string, repo: string): string =>
    `/api/v1/admin/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/grants`,
  adminRepoGrant: (owner: string, repo: string, login: string): string =>
    `/api/v1/admin/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/grants/${encodeURIComponent(login)}`,

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
  readme: (id: string, ref?: string): string => {
    const base = `/api/v1/repos/${encodeURIComponent(id)}/readme`;
    return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
  },
  compare: (id: string, base: string, head: string): string => {
    const qs = new URLSearchParams({ base, head });
    return `/api/v1/repos/${encodeURIComponent(id)}/compare?${qs.toString()}`;
  },
  /** Newest tag reachable from `branch` (default branch when omitted). */
  releaseTag: (id: string, branch?: string): string => {
    const base = `/api/v1/repos/${encodeURIComponent(id)}/release-tag`;
    return branch ? `${base}?branch=${encodeURIComponent(branch)}` : base;
  },
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
  pullMerge: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/merge`,
  pullMergeAttempt: (id: string, prNumber: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/pulls/${encodeURIComponent(prNumber)}/merge-attempt`,
  settings: (id: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/settings`,
  settingsPreview: (id: string): string =>
    `/api/v1/repos/${encodeURIComponent(id)}/settings/preview`,

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
  /** "Needs you": what is waiting on a human right now (admin-only). */
  attention: (): string => '/api/v1/attention',
  /** What each deploy repo pins versus its dependencies' main (admin-only). */
  pins: (): string => '/api/v1/pins',
  /** Every family that has reported a release board (admin-only). */
  releaseBoards: (): string => '/api/v1/release-board',
  /** One family's newest release board (admin-only; 404 until one is reported). */
  releaseBoard: (family: string): string =>
    `/api/v1/release-board/${encodeURIComponent(family)}`,

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
  /** Record that a finding looks wrong to the operator reading it (admin-only). */
  qualityGateDispute: (findingId: string): string =>
    `/api/v1/quality-gate/findings/${encodeURIComponent(findingId)}/dispute`,
} as const;

export type Endpoints = typeof endpoints;

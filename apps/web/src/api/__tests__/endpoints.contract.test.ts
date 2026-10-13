// endpoints.contract.test.ts — pins the paths the client calls to a
// hand-maintained copy of the server's routes
// (src/test/fixtures/server-route-index.json). A client path that is not in
// that copy fails here. The copy is not generated from the server, so a rename
// that happens only on the server stays invisible until the copy is updated.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { endpoints, type Endpoints } from '../endpoints';

interface RouteIndexFixture {
  routes: string[];
}

const routeIndex = JSON.parse(
  readFileSync(join(process.cwd(), 'src/test/fixtures/server-route-index.json'), 'utf8'),
) as RouteIndexFixture;

const endpointSamples = {
  bootstrap: [],
  authMe: [],
  authLogin: [],
  authSignup: [],
  authSignupStart: [],
  authSignupPolicy: [],
  waitlistJoin: [],
  authLogout: [],
  authPassword: [],
  authEmail: [],
  authEmailVerify: [],
  authEmailVerifyResend: [],
  authPasswordForgot: [],
  authPasswordReset: [],
  authTokens: [],
  authToken: ['token-1'],
  adminUsers: [],
  adminUserKind: ['alex'],
  adminResetPassword: ['alex'],
  adminRepoGrants: ['acme', 'widget-api'],
  adminRepoGrant: ['acme', 'widget-api', 'alex'],
  siteSettings: [],
  adminSiteSettings: [],
  version: [],
  search: [{ q: 'gate', kind: ['repository'], limit: 10 }],
  repos: [],
  repo: ['repo-1'],
  refs: ['repo-1'],
  tree: ['repo-1', { ref: 'main', path: 'src' }],
  blob: ['repo-1', { ref: 'main', path: 'README.md', render: 'html' }],
  raw: ['repo-1', { ref: 'main', path: 'logo.png' }],
  readme: ['repo-1', 'main'],
  pages: ['repo-1', 'main'],
  blame: ['repo-1', { ref: 'main', path: 'README.md' }],
  commits: ['repo-1', { ref: 'main', path: 'src', limit: 20, page: 1 }],
  commit: ['repo-1', 'abc1234'],
  compare: ['repo-1', 'main', 'feature'],
  releaseTag: ['repo-1', 'main'],
  releasePins: [],
  pulls: ['repo-1', 'open', { limit: 20, page: 1 }],
  pull: ['repo-1', '7'],
  pullDiff: ['repo-1', '7'],
  pullChecks: ['repo-1', '7'],
  pullThreads: ['repo-1', '7'],
  pullReviews: ['repo-1', '7'],
  pullApprove: ['repo-1', '7'],
  pullReady: ['repo-1', '7'],
  pullDraft: ['repo-1', '7'],
  pullMerge: ['repo-1', '7'],
  pullMergeAttempt: ['repo-1', '7'],
  pullQueue: ['repo-1', '7'],
  repoMergeQueue: ['repo-1'],
  repoAutomation: ['repo-1'],
  ws: [],
  controlPlaneStatus: [200],
  controlPlaneRunners: [],
  controlPlaneRepoGraph: [{ include: ['depends_on'] }],
  repoEnvironments: ['acme', 'widget-api'],
  commitCheckRuns: ['acme', 'widget-api', 'main'],
  pullCommits: ['acme', 'widget-api', '7', { perPage: 20, page: 1 }],
  githubPull: ['acme', 'widget-api', '7'],
  githubIssueComments: ['acme', 'widget-api', '7'],
  branchProtection: ['acme', 'widget-api', 'main'],
  ecosystem: [],
  toolBuildClusters: [{ repo: 'acme/widget-api', limit: 20, includeIgnored: true }],
  fleetToolAdoption: [],
  toolRegistrySummary: [],
  toolFinderScan: [],
  toolFinderDashboard: [{ limit: 20, includeIgnored: true }],
  toolFinderPropose: ['cluster-1'],
  toolProposalDecision: ['tool-1'],
  toolBuildClusterFeedback: ['cluster-1'],
  repoAgentRuns: ['repo-1'],
  repoSessions: ['repo-1'],
  shiftFamilies: [],
  shiftTodos: [{ family: 'acme', status: 'open' }],
  shiftTodoAction: ['acme', '20261003-021037-4e604d'],
  shiftTodoPeople: ['acme', '20260101-000000-aaaaaa'],
  shiftWorkers: [],
  shiftWorkersHistory: [6],
  shiftShifts: ['acme'],
  shiftOpenPr: ['acme'],
  events: [{ family: 'acme', limit: 50 }],
  eventsHistogram: [{ family: 'acme', range: '6h' }],
  usage: [{ family: 'acme', range: '24h' }],
  attention: [],
  attentionAcks: [],
  pins: [],
  releaseBoards: [],
  releaseBoard: ['acme'],
  qualityGateOverview: [7],
  qualityGateRule: ['no-empty-state', 7],
  qualityGateHead: ['acme/widget-api', 'abc1234'],
  qualityGateDispute: ['finding-1'],
  yieldReport: [{ family: 'acme', since: '2026-10-01', until: '2026-10-10', by: 'experiment' }],
  bots: [],
  botGrants: ['bot-1'],
  botGrant: ['bot-1', 'acme', 'widgets'],
  botTokensRevokeIssued: [],
  orgs: [],
  org: ['acme'],
  orgOwner: ['acme', 'ada'],
  orgTeams: ['acme'],
  orgTeamMember: ['acme', 'stewards', 'ada'],
  orgBots: ['acme'],
  botKeys: ['bot-1'],
  botSuspend: ['bot-1'],
  botRevoke: ['bot-1'],
  botTokens: ['bot-1'],
  botTokenRevoke: ['bot-1', 'token-1'],
  repoBots: ['repo-1'],
  repoBotActivity: ['repo-1'],
  repoJankuraiScores: ['repo-1', 'main'],
  providerConnections: [],
  providerConnection: ['pc-1'],
  providerLogins: [],
  providerLogin: ['login-1'],
  mySessions: [{ state: 'running', repo: 'acme/widget-api', limit: 20 }],
  mySession: ['vm-ar-1'],
  runnerStatus: [],
} satisfies { [Name in keyof Endpoints]: Parameters<Endpoints[Name]> };

/** Every builder called with placeholder arguments. */
function allPaths(): string[] {
  return endpointCalls().map(({ path }) => path);
}

function endpointCalls(): Array<{ name: keyof Endpoints; path: string }> {
  return (Object.keys(endpointSamples) as Array<keyof Endpoints>).map((name) => {
    const build = endpoints[name] as (...args: unknown[]) => string;
    const args = endpointSamples[name] as unknown[];
    return { name, path: build(...args) };
  });
}

function pathnameOf(path: string): string {
  return new URL(path, 'https://forge.example').pathname;
}

function routeMatches(template: string, path: string): boolean {
  const routeSegments = template.split('/').filter(Boolean);
  const pathSegments = path.split('/').filter(Boolean);
  return (
    routeSegments.length === pathSegments.length &&
    routeSegments.every((segment, index) =>
      segment.startsWith('{') && segment.endsWith('}')
        ? pathSegments[index].length > 0
        : segment === pathSegments[index],
    )
  );
}

describe('endpoint contract', () => {
  it('keeps every builder under a versioned /api/ prefix', () => {
    for (const path of allPaths()) {
      expect(path).toMatch(/^\/api\/v\d+\//);
    }
  });

  it('reads the pipeline event log from /api/v1/events', () => {
    expect(endpoints.events()).toBe('/api/v1/events');
    expect(endpoints.events({ repo: 'jeryu/jeryu-web', pr: 35 })).toBe(
      '/api/v1/events?repo=jeryu%2Fjeryu-web&pr=35',
    );
    expect(endpoints.attention()).toBe('/api/v1/attention');
    expect(endpoints.attentionAcks()).toBe('/api/v1/attention/acks');
    expect(endpoints.pins()).toBe('/api/v1/pins');
  });

  it('reads release boards from /api/v1/release-board', () => {
    expect(endpoints.releaseBoards()).toBe('/api/v1/release-board');
    expect(endpoints.releaseBoard('acme')).toBe('/api/v1/release-board/acme');
    expect(endpoints.releaseBoard('a/b c')).toBe('/api/v1/release-board/a%2Fb%20c');
  });

  it('builds account and repository bot routes', () => {
    expect(endpoints.bots()).toBe('/api/v1/bots');
    expect(endpoints.botKeys('a/b')).toBe('/api/v1/bots/a%2Fb/keys');
    expect(endpoints.botSuspend('id')).toBe('/api/v1/bots/id/suspend');
    expect(endpoints.botRevoke('id')).toBe('/api/v1/bots/id/revoke');
    expect(endpoints.botTokens('id')).toBe('/api/v1/bots/id/tokens');
    expect(endpoints.botTokenRevoke('id', 't/1')).toBe('/api/v1/bots/id/tokens/t%2F1/revoke');
    expect(endpoints.repoBots('repo 1')).toBe('/api/v1/repos/repo%201/bots');
    expect(endpoints.repoBotActivity('repo-1')).toBe(
      '/api/v1/repos/repo-1/bot-activity',
    );
  });

  it('never calls /api/v1/activity, which the server does not serve', () => {
    for (const path of allPaths()) {
      expect(path).not.toMatch(/^\/api\/v1\/activity(?:[/?]|$)/);
    }
  });

  it('keeps every endpoint builder on a route in the checked-in index', () => {
    const serverRoutes = routeIndex.routes;
    expect(serverRoutes).not.toContain('/api/v1/repos/{id}/settings');
    for (const { name, path } of endpointCalls()) {
      const pathname = pathnameOf(path);
      expect(
        serverRoutes.some((template) => routeMatches(template, pathname)),
        `${String(name)} built ${pathname}, but the checked-in server route index does not list it`,
      ).toBe(true);
    }
  });
});

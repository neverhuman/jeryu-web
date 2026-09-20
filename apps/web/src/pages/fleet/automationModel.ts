// fleet/automationModel.ts — the words of the "Automation" rows on /runners.
//
// The forge's background timers (auto-pin, auto-stage) report through the
// runner heartbeat with the `automation` label. A row says which timer, on
// which host, what it last did, and when it was last heard from. Pure, so the
// page and its tests agree on the words.

import {
  RUNNER_SEEN_STALE_MS,
  shortSha,
  type PullRef,
  type RowTone,
  type RunnerNetworkNode
} from '../runnerNetworkModel';

/** "Auto-pin" for `xbabe0/auto-pin`; the recipe when the id has no suffix. */
export function automationName(node: RunnerNetworkNode): string {
  const suffix = node.runnerId.includes('/')
    ? (node.runnerId.split('/').at(-1) ?? '')
    : '';
  const raw = suffix || node.lastActivity?.recipe || node.runnerId;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** The host a timer runs on: the id's prefix, else its first label. */
export function automationHost(node: RunnerNetworkNode): string {
  const [host, ...rest] = node.runnerId.split('/');
  return rest.length > 0 && host ? host : (node.labels[0] ?? '');
}

/**
 * True once a timer has been silent past its threshold: the forge's
 * `offlineAfterSeconds` when it sends one (a five-minute timer is healthy at
 * four minutes), else the page's flat three minutes. A forge that already says
 * `offline` is believed.
 */
export function automationOffline(
  node: RunnerNetworkNode,
  nowMs: number
): boolean {
  if (node.availability === 'offline') return true;
  if (!node.lastUpdated) return true;
  const seen = new Date(node.lastUpdated).getTime();
  if (!Number.isFinite(seen)) return true;
  const afterMs = node.offlineAfterSeconds
    ? node.offlineAfterSeconds * 1000
    : RUNNER_SEEN_STALE_MS;
  return nowMs - seen > afterMs;
}

/** What a timer last did: `before` + the linked `link` + `after`. */
export interface AutomationDid {
  before: string;
  /** The words that carry the pull request link; null when there is none. */
  link: string | null;
  after: string;
  pull: PullRef | null;
  finishedAt: string;
  tone: RowTone;
}

/** `owner/name` -> `name`: the owner is the same on every row. */
function repoName(repo: string): string {
  return repo.split('/').at(-1) ?? repo;
}

/**
 * "opened jeryu-deploy#74", "staged 77dc331", "waiting for #71 to land",
 * "failed on ea04cac". Null when the timer has no history yet.
 */
export function automationDid(node: RunnerNetworkNode): AutomationDid | null {
  const last = node.lastActivity;
  if (!last) return null;
  const pull = last.pr === null ? null : { repo: last.repo, pr: last.pr };
  const sha = shortSha(last.sha);
  const base = { pull, finishedAt: last.finishedAt };
  const plain = (before: string, tone: RowTone): AutomationDid => ({
    ...base,
    pull: null,
    before,
    link: null,
    after: '',
    tone
  });
  switch (last.conclusion) {
    case 'opened':
      return pull
        ? {
            ...base,
            before: 'opened ',
            link: `${repoName(pull.repo)}#${pull.pr}`,
            after: '',
            tone: 'neutral'
          }
        : plain(`opened a pull request for ${sha}`, 'neutral');
    case 'staged':
      return plain(`staged ${sha}`, 'neutral');
    case 'waiting':
      return pull
        ? {
            ...base,
            before: 'waiting for ',
            link: `#${pull.pr}`,
            after: ' to land',
            tone: 'neutral'
          }
        : plain(`waiting for ${sha} to go green`, 'neutral');
    case 'failed':
      return plain(`failed on ${sha}`, 'danger');
    default:
      return plain(`${last.conclusion} ${sha}`, 'neutral');
  }
}

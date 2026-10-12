// presenceModel.ts — how an agent presence row reads and where it links.
//
// Pure: the Agents page and the family rail both draw presence rows, and the
// words and app paths for them are decided here once.

import type { AgentPresenceItem, PresenceSource, PresenceState } from '../../api/agentPresence';
import type { Tone } from '../../components/tone/tone';
import { pullRequestPath } from '../pullRoomModel';
import { repoRefOf, repoUrl } from '../repoBrowserModel';
import { todoHref } from '../shift/workPaths';

const SOURCE_LABEL: Record<PresenceSource, string> = {
  external: 'external',
  agent_run: 'jeryu run',
  queue_worker: 'queue worker',
  reviewer: 'reviewer',
  gate: 'gate',
};

export function sourceLabel(source: PresenceSource): string {
  return SOURCE_LABEL[source];
}

const STATE_TONE: Record<PresenceState, Tone> = {
  active: 'ok',
  idle: 'warn',
  stale: 'unknown',
  ended: 'unknown',
};

export function stateTone(state: PresenceState): Tone {
  return STATE_TONE[state];
}

/** `claude-code · model-x`, or the agent alone. */
export function agentLabel(item: Pick<AgentPresenceItem, 'agent' | 'model'>): string {
  return item.model ? `${item.agent} · ${item.model}` : item.agent;
}

/** What the row says the agent is doing: its title, else its branch. */
export function presenceHeadline(item: Pick<AgentPresenceItem, 'title' | 'branch'>): string | null {
  return item.title ?? item.branch;
}

export function costText(cost: number | null): string | null {
  return cost === null ? null : `$${cost.toFixed(2)}`;
}

export interface PullTarget {
  fullName: string;
  number: number;
}

/** `owner/name#12` → the repository and number; anything else is null. */
export function parsePullRef(ref: string | undefined): PullTarget | null {
  if (!ref) return null;
  const found = ref.trim().match(/^([^\s#/]+\/[^\s#]+)#(\d+)$/);
  if (!found) return null;
  const number = Number(found[2]);
  return Number.isSafeInteger(number) && number > 0 ? { fullName: found[1], number } : null;
}

/** The app's own pull request page for `owner/name#12` on `host`. */
export function presencePullHref(host: string, ref: string | undefined): string | null {
  const target = parsePullRef(ref);
  return target ? pullRequestPath(host, target.fullName, target.number) : null;
}

export function pullLinkLabel(ref: string | undefined, currentRepo: string): string | null {
  const target = parsePullRef(ref);
  if (!target) return null;
  return target.fullName === currentRepo
    ? `pull request #${target.number}`
    : `pull request ${target.fullName}#${target.number}`;
}

/** A todo is `family:id` or a bare id; its page is the Work page's todo route. */
export function presenceTodoHref(todo: string | undefined): string | null {
  if (!todo) return null;
  const colon = todo.indexOf(':');
  if (colon <= 0) return todoHref(todo);
  return todoHref(todo.slice(colon + 1), todo.slice(0, colon));
}

export function todoLabel(todo: string | undefined): string | null {
  if (!todo) return null;
  const colon = todo.indexOf(':');
  return `todo ${colon > 0 ? todo.slice(colon + 1) : todo}`;
}

/** A run's terminal, on the Agents tab of the repository it runs on. */
export function presenceRunHref(host: string, fullName: string, runId: string): string {
  return repoUrl(repoRefOf(host, fullName), 'agents', encodeURIComponent(runId));
}

/** The repository page a family-list row opens: the first repository it names. */
export function presenceRepoHref(host: string, item: Pick<AgentPresenceItem, 'repos' | 'links'>): string | null {
  const first = item.repos[0];
  if (!first || !first.includes('/')) return null;
  const run = item.links.agent_run;
  if (run) return presenceRunHref(host, first, run);
  return repoUrl(repoRefOf(host, first), 'agents');
}

/**
 * The collision sentence: who else is live on the same branch. Ids the list
 * cannot name (another page of results) are counted rather than dropped.
 */
export function collisionText(
  item: Pick<AgentPresenceItem, 'branch' | 'collides_with'>,
  byId: ReadonlyMap<string, AgentPresenceItem>
): string | null {
  if (item.collides_with.length === 0) return null;
  const names = item.collides_with.map((id) => {
    const other = byId.get(id);
    if (!other) return null;
    return other.operator ? `${other.agent} (${other.operator})` : other.agent;
  });
  const known = names.filter((name): name is string => name !== null);
  const unknown = names.length - known.length;
  const parts = [...known];
  if (unknown > 0) parts.push(`${unknown} more`);
  const where = item.branch ? `branch ${item.branch}` : 'the same branch';
  return `Collision: also live on ${where}: ${parts.join(', ')}.`;
}

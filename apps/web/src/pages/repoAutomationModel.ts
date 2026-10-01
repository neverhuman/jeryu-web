// repoAutomationModel.ts — how the repository page reads its automation.
//
// The server sends live state; every field here is optional because a server
// one version behind sends fewer, and nothing on this page may throw. The
// functions are pure so the wording is tested without a browser.

import type {
  AutomationActor,
  AutomationCheck,
  AutomationMirror,
  RepoAutomation,
} from '../api/types';

/** Tone of a row, shared by checks, actors and mirrors. */
export type AutomationTone = 'ok' | 'bad' | 'waiting';

/** Conclusions that mean the thing worked. */
const GOOD = ['success', 'approve', 'approved', 'deployed', 'neutral', 'skipped'];
/** Conclusions that mean a person has to look. */
const BAD = [
  'failure',
  'failed',
  'error',
  'timed_out',
  'action_required',
  'cancelled',
  'hold',
  'publication_rejected',
  'too_large',
  'interrupted',
];

export function conclusionTone(conclusion?: string | null): AutomationTone {
  if (!conclusion) return 'waiting';
  const word = conclusion.toLowerCase();
  if (GOOD.includes(word)) return 'ok';
  if (BAD.includes(word)) return 'bad';
  return 'waiting';
}

export function checkTone(check: AutomationCheck): AutomationTone {
  if (check.state === 'missing') return check.required ? 'bad' : 'waiting';
  return conclusionTone(check.lastConclusion);
}

/** What a check row says after its name. */
export function checkStatusText(check: AutomationCheck): string {
  if (check.state === 'missing') return 'never reported';
  return check.lastConclusion ?? 'no conclusion yet';
}

/** `Required` / `Not required`, the fact a reader is looking for first. */
export function requiredText(check: AutomationCheck): string {
  return check.required ? 'Required' : 'Not required';
}

/** The grant sentence next to an identity: "write grant ✓" or why not. */
export function grantText(actor: AutomationActor): string | null {
  const grant = actor.grant;
  if (!grant) return null;
  if (grant.present) {
    return `${grant.required} grant ✓${grant.held && grant.held !== grant.required ? ` (holds ${grant.held})` : ''}`;
  }
  return grant.warning ?? `${grant.required} grant missing`;
}

export function actorTone(actor: AutomationActor): AutomationTone {
  if (actor.grant && !actor.grant.present) return 'bad';
  if (actor.state === 'offline') return 'bad';
  if (actor.lastRun) return conclusionTone(actor.lastRun.conclusion);
  return 'ok';
}

/** One line for what an actor last did, or null when it has done nothing. */
export function lastRunText(actor: AutomationActor): string | null {
  const run = actor.lastRun;
  if (!run) return null;
  const parts = [run.conclusion];
  if (run.sha) parts.push(shortSha(run.sha));
  if (run.target) parts.push(`to ${run.target}`);
  if (typeof run.pr === 'number') parts.push(`#${run.pr}`);
  return parts.join(' ');
}

export function shortSha(sha: string): string {
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}

/** Actors in the order a reader asks about them. */
const ACTOR_ORDER = [
  'reviewer',
  'merger',
  'gate-runner',
  'jankurai-audit',
  'deployer',
  'automation'
];

export function orderedActors(actors: AutomationActor[]): AutomationActor[] {
  return [...actors].sort((a, b) => {
    const byKind = kindRank(a.kind) - kindRank(b.kind);
    return byKind !== 0 ? byKind : a.identity.localeCompare(b.identity);
  });
}

function kindRank(kind: string): number {
  const rank = ACTOR_ORDER.indexOf(kind);
  return rank === -1 ? ACTOR_ORDER.length : rank;
}

/** The human name of an actor kind, used as its row label. */
export function actorKindText(kind: string): string {
  switch (kind) {
    case 'reviewer':
      return 'Reviewer';
    case 'merger':
      return 'Merger';
    case 'gate-runner':
      return 'Gate runner';
    case 'deployer':
      return 'Deployer';
    case 'jankurai-audit':
      return 'Quality audit';
    default:
      return 'Automation';
  }
}

export function mirrorTone(mirror: AutomationMirror): AutomationTone {
  if (mirror.behind || mirror.lastError) return 'bad';
  if (mirror.state === 'in_sync') return 'ok';
  return 'waiting';
}

/** One sentence for a mirror row: where it is and how far behind. */
export function mirrorStatusText(mirror: AutomationMirror): string {
  switch (mirror.state) {
    case 'in_sync':
      return 'level with the forge';
    case 'behind':
      return 'behind the forge';
    case 'ahead':
      return 'holds commits the forge does not';
    case 'diverged':
      return 'diverged from the forge';
    default:
      return 'not read yet';
  }
}

/** What the section header says when there is nothing to list. */
export function emptyAutomationText(view: RepoAutomation): string {
  return `Nothing is registered to act on ${view.repo}. Checks, reviewers, mergers, runners and deployers appear here as soon as one reports.`;
}

export function hasAutomation(view: RepoAutomation): boolean {
  return view.checks.length > 0 || view.actors.length > 0;
}

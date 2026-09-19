// repoStatusModel.ts — what a repository's status means, and what to do about it.
//
// The list API says only how many current checks fail (`failing_checks`) and
// whether the GitHub mirror works (`mirror`). The names and reasons come from
// `GET /api/v3/repos/{owner}/{repo}/commits/{branch}/check-runs`, fetched when
// somebody opens a repository's status. Every field is optional: the server may
// send fewer, and nothing here may throw.

import type { RepositoryMirrorStatus } from '../api/types';

/** The check that records merge-to-GitHub mirror pushes. */
export const MIRROR_CHECK = 'jeryu/github-mirror';

/** Said wherever a failing mirror is explained: the table, and repo Settings. */
export const MIRROR_OPERATOR_SENTENCE =
  'The forge host cannot push to GitHub (missing SSH rewrite or deploy key on the server). An operator fixes it on the host; merges are not affected.';

export interface CheckRunOutput {
  title?: string | null;
  summary?: string | null;
}

export interface CheckRun {
  name?: string;
  conclusion?: string | null;
  output?: CheckRunOutput | null;
  details_url?: string | null;
  completed_at?: string | null;
  started_at?: string | null;
}

export interface CheckRunsResponse {
  check_runs?: CheckRun[];
}

export interface FailingCheck {
  name: string;
  title: string | null;
  /** The first lines of the check's own summary. */
  summary: string[];
  detailsUrl: string | null;
  whatToDo: string;
}

/** One plain sentence: the next step for a failing check, by its name. */
export function whatToDo(checkName: string): string {
  if (checkName === 'jankurai/proof') {
    return 'Raise the audit score to the floor: fix the listed caps or findings on the default branch, then push; the proof re-runs on the next push.';
  }
  if (checkName === MIRROR_CHECK) return MIRROR_OPERATOR_SENTENCE;
  if (checkName === 'pr-gate-runner' || checkName.endsWith('/required')) {
    return "The required gate is red on the default branch: open the newest pull request's pipeline panel or Activity for the log.";
  }
  return 'Open the check for its log.';
}

/** The first `limit` non-empty lines of a check summary, list markers removed. */
export function summaryLines(
  summary: string | null | undefined,
  limit = 4
): string[] {
  if (!summary) return [];
  return summary
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, limit)
    .map((line) => (line.length > 220 ? `${line.slice(0, 219)}…` : line));
}

function when(run: CheckRun): string {
  return run.completed_at ?? run.started_at ?? '';
}

/**
 * The failing checks of one commit, each name once (its newest run), in name
 * order. A check whose newest run passed is not failing, whatever came before.
 */
export function failingChecks(
  response: CheckRunsResponse | null | undefined
): FailingCheck[] {
  const newest = new Map<string, CheckRun>();
  for (const run of response?.check_runs ?? []) {
    if (!run.name) continue;
    const held = newest.get(run.name);
    if (!held || when(run) >= when(held)) newest.set(run.name, run);
  }
  return [...newest.entries()]
    .filter(([, run]) => run.conclusion === 'failure')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, run]) => ({
      name,
      title: run.output?.title?.trim() || null,
      summary: summaryLines(run.output?.summary),
      detailsUrl: run.details_url?.trim() || null,
      whatToDo: whatToDo(name)
    }));
}

/** A mirror that is configured and whose last push failed. */
export function mirrorFailing(
  mirror: RepositoryMirrorStatus | null | undefined
): boolean {
  return Boolean(mirror?.configured) && mirror?.last_attempt_ok === false;
}

/** "1 failing check" / "3 failing checks". */
export function failingLabel(count: number): string {
  return `${count} failing check${count === 1 ? '' : 's'}`;
}

/** Sort key for the Status column: failing checks first, then a failing mirror. */
export function attentionRank(repo: {
  failing_checks: number;
  mirror?: RepositoryMirrorStatus | null;
}): number {
  return repo.failing_checks * 2 + (mirrorFailing(repo.mirror) ? 1 : 0);
}

export interface MirrorFacts {
  configured: boolean;
  headline: string;
  lastAttempt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  failing: boolean;
}

/** The GitHub mirror of one repository, as facts for the Settings page. */
export function mirrorFacts(
  mirror: RepositoryMirrorStatus | null | undefined
): MirrorFacts {
  if (!mirror?.configured) {
    return {
      configured: false,
      headline: 'This repository is not mirrored to GitHub.',
      lastAttempt: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      failing: false
    };
  }
  const failing = mirror.last_attempt_ok === false;
  const outcome = mirror.last_attempt_at
    ? failing
      ? (mirror.last_attempt_conclusion ?? 'failure')
      : 'success'
    : null;
  return {
    configured: true,
    headline: failing
      ? 'Merges to the default branch are pushed to GitHub, and the last push failed.'
      : 'Merges to the default branch are pushed to GitHub.',
    lastAttempt: outcome,
    lastAttemptAt: mirror.last_attempt_at ?? null,
    lastSuccessAt: mirror.last_success_at ?? null,
    failing
  };
}

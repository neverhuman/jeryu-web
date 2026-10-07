// botModel.ts — labels and form reach for Grokbot and Musebot.
//
// Kind text comes from `kind`, never from `display_name`. The roster on a
// repository says "This repo" because that response is already clipped to it.

import type {
  BotKind,
  BotReach,
  BotRepoRef,
  BotStatus,
  BotTaskKind,
} from '../../api/types';

const TASK_WORD = 'Task';

export function kindLabel(kind: BotKind): string {
  if (kind === 'grok') return 'Grokbot';
  if (kind === 'muse') return 'Musebot';
  return kind;
}

export function statusLabel(status: BotStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'suspended') return 'Suspended';
  if (status === 'revoked') return 'Revoked';
  return status;
}

export function taskKindFieldLabel(): string {
  return `${TASK_WORD} kind`;
}

export function taskIdFieldLabel(): string {
  return `${TASK_WORD} id`;
}

export function oneTaskChoiceLabel(): string {
  return `One ${TASK_WORD.toLowerCase()}`;
}

/** `Task #17` for an issue or pull. A branch keeps its name. */
export function taskMark(taskId: string): string {
  return `${TASK_WORD} #${taskId}`;
}

export function textOrDash(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') return '—';
  return value;
}

/** Reach label on a repository roster: General, This repo, or Task #id / branch. */
export function repoRosterReachLabel(reach: BotReach): string {
  if (reach.mode === 'general') return 'General';
  if (reach.mode === 'repositories') return 'This repo';
  if (reach.mode === 'task') {
    return reach.task_kind === 'branch' ? reach.task_id : taskMark(reach.task_id);
  }
  return 'Unknown reach';
}

/** Reach summary on the account list, where more than this repository can apply. */
export function accountReachSummary(reach: BotReach): string {
  if (reach.mode === 'general') return 'General';
  if (reach.mode === 'repositories') {
    if (reach.repos.length === 0) return 'No repositories';
    return reach.repos.map((repo) => `${repo.owner}/${repo.name}`).join(', ');
  }
  if (reach.mode === 'task') {
    const repo = `${reach.repo.owner}/${reach.repo.name}`;
    const what = reach.task_kind === 'branch' ? reach.task_id : taskMark(reach.task_id);
    return `${repo} · ${what}`;
  }
  return 'Unknown reach';
}

export function addBotHref(owner: string, name: string): string {
  const params = new URLSearchParams({ repo: `${owner}/${name}` });
  return `/bots?${params.toString()}`;
}

export interface ParsedRepos {
  repos: BotRepoRef[];
  error: string | null;
}

/** One `owner/name` per line. Blank lines are skipped. */
export function parseRepoLines(text: string): ParsedRepos {
  const repos: BotRepoRef[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const slash = line.indexOf('/');
    const owner = slash > 0 ? line.slice(0, slash).trim() : '';
    const name = slash >= 0 ? line.slice(slash + 1).trim() : '';
    if (owner === '' || name === '' || name.includes('/')) {
      return {
        repos: [],
        error: `Use owner/name, one per line. ${line} is not owner/name.`,
      };
    }
    repos.push({ owner, name });
  }
  if (repos.length === 0) {
    return { repos: [], error: 'Name at least one repository as owner/name.' };
  }
  return { repos, error: null };
}

export function parseOwnerName(value: string | null): BotRepoRef | null {
  if (value === null || value.trim() === '') return null;
  const parsed = parseRepoLines(value);
  if (parsed.error !== null || parsed.repos.length !== 1) return null;
  return parsed.repos[0] ?? null;
}

export type ReachChoice = 'general' | 'repositories' | 'task';

export function isReachChoice(value: string): value is ReachChoice {
  return value === 'general' || value === 'repositories' || value === 'task';
}

export function isBotKind(value: string): value is BotKind {
  return value === 'grok' || value === 'muse';
}

export function isTaskKind(value: string): value is BotTaskKind {
  return value === 'issue' || value === 'pull' || value === 'branch';
}

export function reachFromChoice(input: {
  choice: ReachChoice;
  repoLines: string;
  taskOwner: string;
  taskName: string;
  taskKind: BotTaskKind;
  taskId: string;
}): { reach: BotReach; error: null } | { reach: null; error: string } {
  if (input.choice === 'general') {
    return { reach: { mode: 'general' }, error: null };
  }
  if (input.choice === 'repositories') {
    const parsed = parseRepoLines(input.repoLines);
    if (parsed.error) return { reach: null, error: parsed.error };
    return { reach: { mode: 'repositories', repos: parsed.repos }, error: null };
  }
  const owner = input.taskOwner.trim();
  const name = input.taskName.trim();
  const taskId = input.taskId.trim();
  if (owner === '' || name === '' || taskId === '') {
    return { reach: null, error: 'Name the repository and the id.' };
  }
  return {
    reach: {
      mode: 'task',
      repo: { owner, name },
      task_kind: input.taskKind,
      task_id: taskId,
    },
    error: null,
  };
}

export const GENERAL_REACH_NOTE =
  'General reach is live: later repository grants widen it and lost grants cut it off on the next call. Tightening reach does not scrub a transcript a Grokbot or Musebot already has.';

export const SETUP_WARNING =
  'Pasting the script puts the key in that Grokbot or Musebot transcript, and it is only as private as that computer. Every Grokbot on one account shares that computer, its files, and its credentials. ' +
  GENERAL_REACH_NOTE +
  ' The server returns this key only when you create or rotate one. Opening this page again cannot show it, and this page will not invent one.';

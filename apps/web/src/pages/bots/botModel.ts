// botModel.ts — labels and form reach for Grokbot and Musebot.
//
// Kind text comes from `kind`, never from `display_name`. The roster on a
// repository says "This repo" because that response is already clipped to it.

import type {
  BotAccessTokenSummary,
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
  const singleRepo = parsed.error === null && parsed.repos.length === 1;
  if (!singleRepo) {
    return null;
  }
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

// Agent tokens. A token acts for its bot: the owner's rights, cut down by the
// bot's reach. The server returns the token once, on create.

export const TOKEN_TTL_DEFAULT_DAYS = 90;
export const TOKEN_TTL_MIN_DAYS = 1;
export const TOKEN_TTL_MAX_DAYS = 365;
export const TOKEN_LABEL_MAX_CHARS = 80;

export const TOKEN_ONCE_WARNING =
  'Copy this token now. You will not see it again: the server never returns it after this, and this page forgets it when you dismiss this panel or leave.';

export const TOKEN_REACH_NOTE =
  'The token acts with your rights, cut down to what this Grokbot or Musebot can reach. Anyone holding it can use it until it expires or is revoked.';

export type AgentTokenStatus = 'active' | 'expired' | 'revoked';

/** Revoked wins over expired; an unreadable expiry counts expired. */
export function agentTokenStatus(
  token: Pick<BotAccessTokenSummary, 'expires_at' | 'revoked_at'>,
  now: number = Date.now()
): AgentTokenStatus {
  if (token.revoked_at !== null) return 'revoked';
  const expires = Date.parse(token.expires_at);
  if (Number.isNaN(expires) || expires <= now) return 'expired';
  return 'active';
}

export function agentTokenStatusLabel(status: AgentTokenStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'expired') return 'Expired';
  return 'Revoked';
}

/** A whole number of days from 1 to 365, or an error to show beside the field. */
export function parseTtlDays(
  raw: string
): { days: number; error: null } | { days: null; error: string } {
  const text = raw.trim();
  const days = Number(text);
  const whole = text !== '' && Number.isInteger(days);
  if (!whole || days < TOKEN_TTL_MIN_DAYS || days > TOKEN_TTL_MAX_DAYS) {
    return {
      days: null,
      error: `Days valid must be a whole number from ${TOKEN_TTL_MIN_DAYS} to ${TOKEN_TTL_MAX_DAYS}.`,
    };
  }
  return { days, error: null };
}

export interface AgentTokenSnippet {
  id: 'claude-code' | 'mcp-json' | 'gh-git';
  title: string;
  text: string;
}

/**
 * Ready-to-copy setup lines for one token. `origin` is the page's own origin,
 * so the lines name whichever forge served this page.
 */
export function agentTokenSnippets(origin: string, token: string): AgentTokenSnippet[] {
  const mcpUrl = `${origin}/mcp`;
  const header = `Authorization: Bearer ${token}`;
  const mcpJson = JSON.stringify({
    mcpServers: { jeryu: { url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } },
  });
  return [
    {
      id: 'claude-code',
      title: 'Claude Code',
      text: `claude mcp add --transport http jeryu ${mcpUrl} --header "${header}"`,
    },
    { id: 'mcp-json', title: 'MCP client JSON', text: mcpJson },
    { id: 'gh-git', title: 'gh and git', text: `GH_TOKEN=${token}` },
  ];
}

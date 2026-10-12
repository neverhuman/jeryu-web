// botModel.ts — labels and form reach for enrolled agents.
//
// Kind text comes from `kind`, never from `display_name`. The roster on a
// repository says "This repo" because that response is already clipped to it.
// A server older than this page may send a kind or a reach mode it does not
// know about, or one this page does not: every helper here answers with text
// for any value instead of throwing.

import type {
  BotAccessTokenSummary,
  BotKind,
  BotReach,
  BotRepoRef,
  BotStatus,
  BotTaskKind,
} from '../../api/types';

const TASK_WORD = 'Task';

/** grok reads Grokbot, muse reads Musebot, any other kind reads as itself. */
export function kindLabel(kind: BotKind | null | undefined): string {
  if (kind === 'grok') return 'Grokbot';
  if (kind === 'muse') return 'Musebot';
  if (typeof kind !== 'string' || kind.trim() === '') return 'Unknown';
  return kind;
}

/** The kind rule the server applies. An empty field is left out and the server uses "agent". */
export const KIND_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

/** Offered beside the kind field; any other kind that matches the pattern is fine. */
export const KIND_SUGGESTIONS: readonly string[] = ['grok', 'muse', 'claude', 'codex'];

export const KIND_DEFAULT_NOTE = 'Leave it empty for "agent".';

/** `kind: null` means leave the field out of the request. */
export function parseKind(
  raw: string
): { kind: string | null; error: null } | { kind: null; error: string } {
  const text = raw.trim();
  if (text === '') return { kind: null, error: null };
  if (!KIND_PATTERN.test(text)) {
    return {
      kind: null,
      error:
        'Kind starts with a lowercase letter, then up to 31 lowercase letters, digits, or hyphens.',
    };
  }
  return { kind: text, error: null };
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

const UNKNOWN_REACH = 'Unknown reach';

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function repoText(value: unknown): string {
  const repo = record(value);
  const owner = text(repo?.owner);
  const name = text(repo?.name);
  return owner !== '' && name !== '' ? `${owner}/${name}` : '';
}

/** Branch name, or `Task #id` for an issue or pull. */
function taskWhat(reach: Record<string, unknown>): string {
  const id = typeof reach.task_id === 'number' ? String(reach.task_id) : text(reach.task_id);
  return reach.task_kind === 'branch' ? id : taskMark(id);
}

/** Reach label on a repository roster: General, This repo, Whole owner, or Task #id / branch. */
export function repoRosterReachLabel(reach: BotReach | unknown): string {
  const value = record(reach);
  if (value?.mode === 'general') return 'General';
  if (value?.mode === 'repositories') return 'This repo';
  if (value?.mode === 'owners') return 'Whole owner';
  if (value?.mode === 'task') return taskWhat(value);
  return UNKNOWN_REACH;
}

/**
 * Reach on the account list, one line per repository or owner. An owners
 * reach reads `owner/*`. A mode this page does not know reads as its name.
 */
export function accountReachRows(reach: BotReach | unknown): string[] {
  const value = record(reach);
  const mode = value?.mode;
  if (value === null) return [UNKNOWN_REACH];
  if (mode === 'general') return ['General'];
  if (mode === 'repositories') {
    const rows = (Array.isArray(value.repos) ? value.repos : [])
      .map(repoText)
      .filter((row) => row !== '');
    return rows.length > 0 ? rows : ['No repositories'];
  }
  if (mode === 'owners') {
    const rows = (Array.isArray(value.owners) ? value.owners : [])
      .map(text)
      .filter((owner) => owner !== '')
      .map((owner) => `${owner}/*`);
    return rows.length > 0 ? rows : ['No owners'];
  }
  if (mode === 'task') {
    const repo = repoText(value.repo);
    const what = taskWhat(value);
    return [repo === '' ? what : `${repo} · ${what}`];
  }
  return typeof mode === 'string' && mode !== '' ? [`${UNKNOWN_REACH}: ${mode}`] : [UNKNOWN_REACH];
}

export function addBotHref(owner: string, name: string): string {
  const params = new URLSearchParams({ repo: `${owner}/${name}` });
  return `/bots?${params.toString()}`;
}

export interface ParsedRepos {
  repos: BotRepoRef[];
  error: string | null;
}

/** The server caps: 100 repositories, 20 owners. */
export const REACH_REPOS_MAX = 100;
export const REACH_OWNERS_MAX = 20;

export const REACH_LINES_LABEL = 'Repositories, one per line';

export const REACH_LINES_HINT =
  'Write owner/name for one repository, or owner/* for every repository of that owner you can reach, including ones added later. One agent takes whole owners or a list of repositories, not both.';

export const MIXED_REACH_ERROR =
  'A reach is either whole owners (owner/*) or a list of repositories (owner/name), not both. Use one kind of line, and add a second agent for the rest.';

type ReachLine = { owner: string; name: string | null };

/** `owner/name`, or `owner/*` (name null). Null when the line is neither. */
function parseReachLine(line: string): ReachLine | null {
  const slash = line.indexOf('/');
  const owner = slash > 0 ? line.slice(0, slash).trim() : '';
  const name = slash >= 0 ? line.slice(slash + 1).trim() : '';
  const bad = (part: string): boolean => part === '' || /[\s/*]/.test(part);
  if (bad(owner)) return null;
  if (name === '*') return { owner, name: null };
  if (bad(name)) return null;
  return { owner, name };
}

function reachLines(input: string): { lines: ReachLine[]; error: string | null } {
  const lines: ReachLine[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const parsed = parseReachLine(line);
    if (parsed === null) {
      return {
        lines: [],
        error: `Use owner/name or owner/*, one per line. ${line} is neither.`,
      };
    }
    lines.push(parsed);
  }
  if (lines.length === 0) {
    return {
      lines: [],
      error: 'Name at least one repository as owner/name, or a whole owner as owner/*.',
    };
  }
  return { lines, error: null };
}

/** One `owner/name` per line. Blank lines are skipped; `owner/*` is not a repository. */
export function parseRepoLines(input: string): ParsedRepos {
  const parsed = reachLines(input);
  if (parsed.error !== null) return { repos: [], error: parsed.error };
  const repos: BotRepoRef[] = [];
  for (const line of parsed.lines) {
    if (line.name === null) return { repos: [], error: `${line.owner}/* is a whole owner.` };
    repos.push({ owner: line.owner, name: line.name });
  }
  return { repos, error: null };
}

/**
 * The reach a block of lines asks for: all `owner/*` lines make an owners
 * reach, all `owner/name` lines a repositories reach. Mixed lines are refused,
 * because the API takes one reach mode per agent. Repeats are dropped.
 */
export function reachFromLines(
  input: string
): { reach: BotReach; error: null } | { reach: null; error: string } {
  const parsed = reachLines(input);
  if (parsed.error !== null) return { reach: null, error: parsed.error };
  const owners = parsed.lines.filter((line) => line.name === null);
  if (owners.length > 0 && owners.length < parsed.lines.length) {
    return { reach: null, error: MIXED_REACH_ERROR };
  }
  if (owners.length > 0) {
    const unique = [...new Set(owners.map((line) => line.owner))];
    if (unique.length > REACH_OWNERS_MAX) {
      return { reach: null, error: `Name at most ${REACH_OWNERS_MAX} owners.` };
    }
    return { reach: { mode: 'owners', owners: unique }, error: null };
  }
  const seen = new Set<string>();
  const repos: BotRepoRef[] = [];
  for (const line of parsed.lines) {
    const key = `${line.owner}/${line.name ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    repos.push({ owner: line.owner, name: line.name ?? '' });
  }
  if (repos.length > REACH_REPOS_MAX) {
    return { reach: null, error: `Name at most ${REACH_REPOS_MAX} repositories.` };
  }
  return { reach: { mode: 'repositories', repos }, error: null };
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
    return reachFromLines(input.repoLines);
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
  'General reach is live: later repository grants widen it and lost grants cut it off on the next call. Tightening reach does not scrub a transcript an agent already has.';

export const SETUP_WARNING =
  "Pasting the script puts the key in that agent's transcript, and it is only as private as that computer. Every Grokbot on one account shares that computer, its files, and its credentials. " +
  GENERAL_REACH_NOTE +
  ' The server returns this key only when you create or rotate one. Opening this page again cannot show it, and this page will not invent one.';

/** The agent setup page, Markdown served by the API's docs route. */
export const CONNECT_AGENT_DOC_HREF = '/api/v1/docs/connect-an-agent.md';

export const CONNECT_AGENT_DOC_NOTE =
  'Send this page and an agent token to an external agent to connect it.';

// Agent tokens. A token acts for its bot: the owner's rights, cut down by the
// bot's reach. The server returns the token once, on create.

export const TOKEN_TTL_DEFAULT_DAYS = 90;
export const TOKEN_TTL_MIN_DAYS = 1;
export const TOKEN_TTL_MAX_DAYS = 365;
export const TOKEN_LABEL_MAX_CHARS = 80;

export const TOKEN_ONCE_WARNING =
  'Copy this token now. You will not see it again: the server never returns it after this, and this page forgets it when you dismiss this panel or leave.';

export const TOKEN_REACH_NOTE =
  'The token acts with your rights, cut down to what this agent can reach. Anyone holding it can use it until it expires or is revoked.';

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

// pullCommitsModel.ts — the commits of a pull request, as the PR page reads them.
//
// The server answers `GET /api/v3/repos/{o}/{r}/pulls/{n}/commits` in the
// GitHub commit shape, oldest first. Everything a reviewer sees is derived
// here: the subject line, the message body, the trailers (a shift commit
// carries `Todo:` / `Worked-by:` / `Shift:`), and the day groups.

/** A commit's author or committer, as the server reports it. */
export interface PullCommitPerson {
  name?: string | null;
  email?: string | null;
  date?: string | null;
}

/** One commit of a pull request, in the GitHub commit shape. */
export interface PullCommit {
  sha: string;
  html_url?: string | null;
  url?: string | null;
  commit: {
    message: string;
    author?: PullCommitPerson | null;
    committer?: PullCommitPerson | null;
  };
  parents?: { sha: string }[] | null;
}

/** A `Key: value` line of the commit message's trailer block. */
export interface CommitTrailer {
  key: string;
  value: string;
}

export interface CommitMessage {
  /** The first line, always present (empty for an empty message). */
  subject: string;
  /** The body paragraphs below the subject, trailers removed. */
  paragraphs: string[];
  trailers: CommitTrailer[];
}

const TRAILER = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/;

/**
 * Splits a commit message into its subject, body paragraphs and trailers.
 *
 * Trailers are the `Key: value` lines of the LAST block of the message, as git
 * itself reads them, so a `Todo:` line inside prose is left in the body.
 */
export function parseCommitMessage(message: string): CommitMessage {
  const lines = message.replace(/\r\n/g, '\n').split('\n');
  const subject = (lines.shift() ?? '').trim();
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();

  // The trailing block: everything after the last blank line.
  const lastBlank = lines.lastIndexOf('');
  const tail = lines.slice(lastBlank + 1);
  const isTrailerBlock =
    tail.length > 0 && tail.every((line) => TRAILER.test(line.trim()));
  const bodyLines = isTrailerBlock ? lines.slice(0, Math.max(lastBlank, 0)) : lines;
  const trailers: CommitTrailer[] = isTrailerBlock
    ? tail.map((line) => {
        const match = TRAILER.exec(line.trim());
        return { key: match?.[1] ?? '', value: match?.[2]?.trim() ?? '' };
      })
    : [];

  const paragraphs = bodyLines
    .join('\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return { subject, paragraphs, trailers };
}

/** Whether a commit has anything to show below its subject line. */
export function hasCommitDetail(commit: PullCommit): boolean {
  const message = parseCommitMessage(commit.commit.message);
  return message.paragraphs.length > 0 || message.trailers.length > 0;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** The author's display name, falling back to the committer, then the email. */
export function commitAuthorName(commit: PullCommit): string {
  const author = commit.commit.author ?? commit.commit.committer ?? null;
  return author?.name ?? author?.email ?? 'unknown author';
}

/** When the commit was authored (the committer date when there is no author). */
export function commitDate(commit: PullCommit): string | null {
  return commit.commit.author?.date ?? commit.commit.committer?.date ?? null;
}

export interface CommitDay {
  /** `YYYY-MM-DD` of the commits below, or `''` when the date is unreadable. */
  day: string;
  /** The heading a reader sees, e.g. `Sep 28, 2026`. */
  label: string;
  commits: PullCommit[];
}

function dayKey(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const month = `${at.getMonth() + 1}`.padStart(2, '0');
  const day = `${at.getDate()}`.padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

function dayLabel(day: string, iso: string | null): string {
  if (day === '' || !iso) return 'Date unknown';
  const at = new Date(iso);
  try {
    return at.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return day;
  }
}

/**
 * Groups commits into consecutive day runs, keeping the server's order (oldest
 * first) inside and between the groups, as GitHub's Commits tab does.
 */
export function groupCommitsByDay(commits: PullCommit[]): CommitDay[] {
  const groups: CommitDay[] = [];
  for (const commit of commits) {
    const iso = commitDate(commit);
    const day = dayKey(iso);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.commits.push(commit);
      continue;
    }
    groups.push({ day, label: dayLabel(day, iso), commits: [commit] });
  }
  return groups;
}

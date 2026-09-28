// PullRequestCommits.tsx — the Commits section of the PR page.
//
// Lists the commits of a pull request oldest first, grouped by day like
// GitHub's Commits tab: short sha, subject, author and relative date, with the
// full message body and its trailers one click away. On a shift PR each commit
// is one todo's change, so the trailers (`Todo:`, `Worked-by:`, `Shift:`) are
// shown as key/value pairs rather than buried in prose.

import { ChevronDown, ChevronRight, GitCommitHorizontal } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { ErrorState, LoadingState } from '../components/state';
import { relativeTime } from '../components/repo/relativeTime';
import {
  commitAuthorName,
  commitDate,
  groupCommitsByDay,
  hasCommitDetail,
  parseCommitMessage,
  shortSha,
  type PullCommit,
} from './pullCommitsModel';

import './page.css';

export interface PullRequestCommitsProps {
  commits: PullCommit[] | undefined;
  isPending: boolean;
  error?: Error | null;
}

export function PullRequestCommits({
  commits,
  isPending,
  error,
}: PullRequestCommitsProps): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((sha: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sha)) next.delete(sha);
      else next.add(sha);
      return next;
    });
  }, []);

  const days = useMemo(() => groupCommitsByDay(commits ?? []), [commits]);
  const count = commits?.length ?? 0;

  return (
    <section className="pr-commits" data-testid="pr-commits" aria-label="Commits">
      <h2 className="pr-commits__title">
        <GitCommitHorizontal aria-hidden="true" size={14} />
        Commits
        {isPending || error ? null : (
          <span className="pr-commits__count" data-testid="pr-commits-count">
            {count}
          </span>
        )}
      </h2>

      {isPending ? (
        <LoadingState title="Loading commits…" variant="skeleton" rows={3} />
      ) : error ? (
        <ErrorState title="Could not load commits" error={error} />
      ) : count === 0 ? (
        <p className="pr-commits__empty" data-testid="pr-commits-empty">
          This pull request has no commits.
        </p>
      ) : (
        days.map((day) => (
          <div className="pr-commits__day" key={`${day.day}-${day.commits[0]?.sha}`}>
            <h3 className="pr-commits__day-label">{day.label}</h3>
            <ul className="pr-commits__list">
              {day.commits.map((commit) => (
                <CommitRow
                  key={commit.sha}
                  commit={commit}
                  isOpen={expanded.has(commit.sha)}
                  onToggle={toggle}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function CommitRow({
  commit,
  isOpen,
  onToggle,
}: {
  commit: PullCommit;
  isOpen: boolean;
  onToggle: (sha: string) => void;
}): JSX.Element {
  const message = parseCommitMessage(commit.commit.message);
  const detailed = hasCommitDetail(commit);
  const at = commitDate(commit);
  const sha = shortSha(commit.sha);
  const bodyId = `pr-commit-body-${commit.sha}`;

  return (
    <li className="pr-commits__item" data-testid="pr-commit">
      <div className="pr-commits__row">
        {detailed ? (
          <button
            type="button"
            className="pr-commits__toggle"
            aria-expanded={isOpen}
            aria-controls={bodyId}
            onClick={() => onToggle(commit.sha)}
          >
            {isOpen ? (
              <ChevronDown aria-hidden="true" size={12} />
            ) : (
              <ChevronRight aria-hidden="true" size={12} />
            )}
            <span className="pr-commits__subject">{message.subject}</span>
          </button>
        ) : (
          <span className="pr-commits__subject">{message.subject}</span>
        )}
        {commit.html_url ? (
          <a className="pr-commits__sha" href={commit.html_url} title={commit.sha}>
            <code>{sha}</code>
          </a>
        ) : (
          <code className="pr-commits__sha" title={commit.sha}>
            {sha}
          </code>
        )}
        <span className="pr-commits__meta">
          {commitAuthorName(commit)}
          {at ? (
            <>
              <span aria-hidden="true"> · </span>
              <time dateTime={at} title={at}>
                {relativeTime(at)}
              </time>
            </>
          ) : null}
        </span>
      </div>
      {detailed && isOpen ? (
        <div className="pr-commits__body" id={bodyId}>
          {message.paragraphs.map((paragraph, index) => (
            <p className="pr-commits__paragraph" key={`${commit.sha}-p${index}`}>
              {paragraph}
            </p>
          ))}
          {message.trailers.length > 0 ? (
            <dl className="pr-commits__trailers" data-testid="pr-commit-trailers">
              {message.trailers.map((trailer, index) => (
                <div
                  className="pr-commits__trailer"
                  key={`${commit.sha}-t${index}-${trailer.key}`}
                >
                  <dt>{trailer.key}</dt>
                  <dd>{trailer.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

// PullConversationTimeline.tsx — the pull request as one story, oldest first:
// the description, each push, every review and thread, and the pipeline's runs,
// in the order they happened (`conversationTimelineModel`).
//
// A run that finished with nothing else going on is one line. A run that
// overlapped something is a start line and an end line, and a lane in the
// gutter on the left joins the two past whatever happened between; a run still
// going spins at its start line and keeps its lane open to the bottom. Runs that
// repeat the same result on the same head fold into one line that opens.
//
// The pipeline read is admin-only; for anyone else the story is the pushes,
// reviews and threads, with no runs in it.

import { AlertTriangle, Check, CircleDot, GitCommitHorizontal, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PipelineEvent, PullRequestReview, ReviewThread } from '../api/types';
import { MarkdownSource } from '../components/browser';
import { ReviewEntry, ThreadCard, useReviewAnchors } from '../components/merge';
import { FindingHrefContext } from '../components/merge/ReviewFindingsTable';
import type { FindingLocation } from '../components/merge/reviewFindingsModel';
import { absoluteText, clockText, rfc3339Seconds } from '../format/when';
import { When } from '../format/When';
import { useAuth } from '../hooks/useAuth';
import { usePipelineEvents } from '../hooks/usePipeline';
import { activityHref, eventLabel, eventTone, formatSeconds, summaryText } from './activity/activityModel';
import { RUNNING_TICK_MS, elapsedSeconds, elapsedText } from './activity/runningModel';
import {
  buildTimeline,
  runOutcome,
  type LaneMark,
  type TimelineEntry,
  type TimelineRun,
} from './conversationTimelineModel';
import type { PullCommit } from './pullCommitsModel';
import { shortSha } from './shift/shiftModel';

import './PullConversationTimeline.css';

/** One read covers the life of nearly every pull request; the rest is on Activity. */
const TIMELINE_EVENTS = 200;
const IDLE_TICK_MS = 60_000;

export interface PullConversationTimelineProps {
  author: string;
  description: string | null;
  headSha: string;
  commits: readonly PullCommit[];
  reviews: readonly PullRequestReview[];
  threads: readonly ReviewThread[];
  /** `owner/name` and the number, for the pipeline read. */
  repoFullName: string;
  prNumber: string;
  threadHref: (thread: ReviewThread) => string | null;
  findingHref: (location: FindingLocation) => string;
}

export function PullConversationTimeline({
  author,
  description,
  headSha,
  commits,
  reviews,
  threads,
  repoFullName,
  prNumber,
  threadHref,
  findingHref,
}: PullConversationTimelineProps): JSX.Element {
  const { user } = useAuth();
  const pr = Number(prNumber);
  const feed = usePipelineEvents(
    { repo: repoFullName, pr, limit: TIMELINE_EVENTS },
    { enabled: user?.role === 'admin' && Number.isInteger(pr), refetchInterval: 15_000 }
  );
  const events = feed.data?.events ?? NO_EVENTS;
  const [now, setNow] = useState(() => Date.now());

  const timeline = useMemo(
    () => buildTimeline({ author, description, headSha, commits, reviews, threads, events, nowMs: now }),
    [author, description, headSha, commits, reviews, threads, events, now]
  );

  // The clock only ticks fast while something is running: elapsed timers move.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), timeline.running ? RUNNING_TICK_MS : IDLE_TICK_MS);
    return () => window.clearInterval(id);
  }, [timeline.running]);

  const { opened, target } = useReviewAnchors(reviews);

  return (
    <FindingHrefContext.Provider value={findingHref}>
      <section className="pr-timeline" aria-label="Timeline" data-testid="pr-timeline">
        {feed.data?.has_more ? (
          <p className="pr-timeline__more">
            Older pipeline events are on{' '}
            <Link to={activityHref({ repo: repoFullName, pr })}>Activity</Link>.
          </p>
        ) : null}
        <ol
          className="pr-timeline__list"
          style={{ ['--pr-timeline-lanes' as string]: timeline.laneCount }}
        >
          {timeline.entries.map((entry) => (
            <li
              key={entry.key}
              className={`pr-timeline__row pr-timeline__row--${entry.kind}`}
              data-testid={`pr-timeline-${entry.kind}`}
            >
              <Gutter lanes={entry.lanes} />
              <div className="pr-timeline__body">
                <EntryBody
                  entry={entry}
                  now={now}
                  openReviews={opened}
                  targetReview={target}
                  threadHref={threadHref}
                />
              </div>
            </li>
          ))}
        </ol>
      </section>
    </FindingHrefContext.Provider>
  );
}

const NO_EVENTS: PipelineEvent[] = [];

function Gutter({ lanes }: { lanes: LaneMark[] }): JSX.Element | null {
  if (lanes.length === 0) return null;
  return (
    <span className="pr-timeline__gutter" aria-hidden="true">
      {lanes.map((mark, lane) => (
        <span key={lane} className={`pr-timeline__lane pr-timeline__lane--${mark}`} />
      ))}
    </span>
  );
}

function EntryBody({
  entry,
  now,
  openReviews,
  targetReview,
  threadHref,
}: {
  entry: TimelineEntry;
  now: number;
  openReviews: Set<string>;
  targetReview: string | null;
  threadHref: (thread: ReviewThread) => string | null;
}): JSX.Element {
  switch (entry.kind) {
    case 'opened':
      return (
        <div className="pr-timeline__opened">
          <p className="pr-timeline__line">
            <strong>{entry.author}</strong> opened this pull request <Clock at={entry.at} />
          </p>
          {entry.description ? (
            <section
              className="pr-conversation__description"
              aria-label="Description"
              data-testid="pr-description"
            >
              {/* Written in Markdown, as every forge reads it. */}
              <MarkdownSource markdown={entry.description} />
            </section>
          ) : null}
        </div>
      );
    case 'day':
      return <h3 className="pr-timeline__day">{entry.label}</h3>;
    case 'commit':
      return (
        <p className="pr-timeline__line pr-timeline__commit">
          <GitCommitHorizontal aria-hidden="true" size={14} />
          <code title={entry.sha}>{shortSha(entry.sha)}</code>
          <span className="pr-timeline__subject">{entry.subject}</span>
          {entry.count > 1 ? (
            <span className="pr-timeline__muted">and {entry.count - 1} earlier</span>
          ) : null}
          {entry.current ? <span className="pr-timeline__pill">head</span> : null}
          <Clock at={entry.at} />
        </p>
      );
    case 'review':
      return (
        <ul className="pr-timeline__card review-list__items">
          <ReviewEntry
            review={entry.review}
            open={openReviews.has(entry.review.id)}
            target={entry.review.id === targetReview}
          />
        </ul>
      );
    case 'thread':
      return (
        <ThreadCard
          as="div"
          thread={entry.thread}
          href={threadHref(entry.thread)}
          id={entry.firstUnresolved ? 'pr-threads' : undefined}
        />
      );
    case 'run':
      return <RunLine run={entry.run} part={entry.part} now={now} />;
    case 'runs':
      return <FoldedRuns runs={entry.runs} now={now} />;
    case 'event':
      return <EventLine event={entry.event} />;
  }
}

function Clock({ at }: { at: number }): JSX.Element {
  return (
    <time className="pr-timeline__clock" dateTime={rfc3339Seconds(at) ?? undefined} title={absoluteText(at)}>
      {clockText(at)}
    </time>
  );
}

function ToneIcon({ tone }: { tone: string }): JSX.Element {
  if (tone === 'ok') return <Check aria-hidden="true" size={14} className="pr-timeline__icon--ok" />;
  if (tone === 'failed') return <X aria-hidden="true" size={14} className="pr-timeline__icon--failed" />;
  if (tone === 'human' || tone === 'warn') {
    return <AlertTriangle aria-hidden="true" size={14} className="pr-timeline__icon--warn" />;
  }
  return <CircleDot aria-hidden="true" size={14} className="pr-timeline__icon--quiet" />;
}

function runSeconds(run: TimelineRun): number | null {
  if (run.finish?.seconds !== null && run.finish?.seconds !== undefined) return run.finish.seconds;
  if (!run.finish) return null;
  const start = Date.parse(run.start.ts);
  const end = Date.parse(run.finish.ts);
  return Number.isNaN(start) || Number.isNaN(end) ? null : Math.max(0, (end - start) / 1000);
}

function RunLine({ run, part, now }: { run: TimelineRun; part: 'whole' | 'start' | 'end'; now: number }): JSX.Element {
  const start = run.start;
  if (part === 'start' || run.state !== 'finished' || !run.finish) {
    const running = run.state === 'running';
    return (
      <p
        className={`pr-timeline__line pr-timeline__run${running ? ' pr-timeline__run--running' : ''}`}
        data-state={run.state}
      >
        {running ? (
          <Loader2 aria-hidden="true" size={14} className="pr-timeline__spinner" />
        ) : (
          <CircleDot aria-hidden="true" size={14} className="pr-timeline__icon--quiet" />
        )}
        <strong>{eventLabel(start)}</strong>
        {start.actor ? <span className="pr-timeline__muted">{start.actor}</span> : null}
        {start.sha ? <code>{shortSha(start.sha)}</code> : null}
        {running ? (
          <span className="pr-timeline__muted" role="status">
            running {elapsedText(elapsedSeconds(start.ts, now))}
          </span>
        ) : run.state === 'lost' ? (
          <span className="pr-timeline__muted">no result recorded</span>
        ) : null}
        <Clock at={Date.parse(start.ts)} />
      </p>
    );
  }
  return <FinishLine run={run} />;
}

function FinishLine({ run }: { run: TimelineRun }): JSX.Element {
  const finish = run.finish as PipelineEvent;
  const tone = eventTone(finish);
  const seconds = formatSeconds(runSeconds(run));
  return (
    <div className={`pr-timeline__run pr-timeline__run--${tone}`} data-state="finished">
      <p className="pr-timeline__line">
        <ToneIcon tone={tone} />
        <strong>{eventLabel(finish)}</strong>
        <span className="pr-timeline__summary">{summaryText(finish)}</span>
        {seconds ? <span className="pr-timeline__muted">{seconds}</span> : null}
        {finish.log_url ? <a href={finish.log_url}>Log</a> : null}
        <Clock at={Date.parse(finish.ts)} />
      </p>
      <EventDetail event={finish} />
    </div>
  );
}

function FoldedRuns({ runs, now }: { runs: TimelineRun[]; now: number }): JSX.Element {
  const last = runs[runs.length - 1];
  const finish = last.finish as PipelineEvent;
  const tone = runOutcome(last);
  const sha = last.start.sha;
  return (
    <details className={`pr-timeline__fold pr-timeline__run--${tone}`}>
      <summary className="pr-timeline__line">
        <ToneIcon tone={tone} />
        <strong>
          {eventLabel(finish)} {runs.length}×
        </strong>
        {sha ? (
          <span className="pr-timeline__muted">
            on <code>{shortSha(sha)}</code>
          </span>
        ) : null}
        <span className="pr-timeline__muted">
          last <When at={finish.ts} />
        </span>
        <Clock at={Date.parse(finish.ts)} />
      </summary>
      <ol className="pr-timeline__fold-list">
        {runs.map((run) => (
          <li key={run.start.seq}>
            <RunLine run={run} part="whole" now={now} />
          </li>
        ))}
      </ol>
    </details>
  );
}

function EventLine({ event }: { event: PipelineEvent }): JSX.Element {
  const tone = eventTone(event);
  return (
    <div className={`pr-timeline__event pr-timeline__run--${tone}`}>
      <p className="pr-timeline__line">
        <ToneIcon tone={tone} />
        <strong>{eventLabel(event)}</strong>
        <span className="pr-timeline__summary">{summaryText(event)}</span>
        {event.needs_human ? <span className="pr-timeline__pill pr-timeline__pill--human">needs you</span> : null}
        {event.log_url ? <a href={event.log_url}>Log</a> : null}
        <Clock at={Date.parse(event.ts)} />
      </p>
      <EventDetail event={event} />
    </div>
  );
}

/** Why it happened and the log's tail, one click away; nothing when there is neither. */
function EventDetail({ event }: { event: PipelineEvent }): JSX.Element | null {
  if (!event.reason && !event.log_tail) return null;
  return (
    <details className="pr-timeline__detail">
      <summary>{event.log_tail ? 'Log tail' : 'Why'}</summary>
      {event.reason ? <p>{event.reason}</p> : null}
      {event.log_tail ? <pre>{event.log_tail}</pre> : null}
    </details>
  );
}

// PullPipelineEvents.tsx — the pipeline's view of one pull request, on the PR
// page: gates starting and finishing (with their log tails), reviews, the
// merge queue and the merge, from `GET /api/v1/events?repo=&pr=`.
//
// The read is admin-only and absent on older servers; in both cases the panel
// is simply not shown, so the cockpit never gains an error box it cannot fix.

import { Link } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { usePipelineEvents } from '../../hooks/usePipeline';
import { activityHref, foldEchoes, resolvedSeqs } from './activityModel';
import { EventRow } from './EventRow';

import './Activity.css';

const PANEL_EVENTS = 30;

export function PullPipelineEvents({ repo, pr }: { repo: string; pr: string }): JSX.Element | null {
  const { user } = useAuth();
  const prNumber = Number(pr);
  const feed = usePipelineEvents(
    { repo, pr: prNumber, limit: PANEL_EVENTS },
    { enabled: user?.role === 'admin' && Number.isInteger(prNumber), refetchInterval: 15_000 }
  );
  if (!feed.isSuccess) return null;
  const events = foldEchoes(feed.data.events);
  const resolved = resolvedSeqs(events);

  return (
    <section className="pull-events" aria-label="Pipeline events" data-testid="pull-pipeline-events">
      <header className="pull-events__header">
        <h3 className="pull-events__title">Pipeline</h3>
        <Link to={activityHref({ repo, pr: prNumber })}>All activity</Link>
      </header>
      {events.length === 0 ? (
        <p className="pull-events__empty">
          No gate, review or queue events recorded for this pull request yet.
        </p>
      ) : (
        <ol className="activity__list pull-events__list" aria-label="Pipeline events for this pull request">
          {events.map((event) => (
            <EventRow key={event.seq} event={event} resolved={resolved.has(event.seq)} />
          ))}
        </ol>
      )}
    </section>
  );
}

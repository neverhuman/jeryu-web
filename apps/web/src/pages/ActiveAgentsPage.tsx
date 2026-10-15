import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ChangeEvent, FormEvent } from 'react';

import { fetchAllAgentPresence, type PresenceRow } from '../api/agentPresence';
import { PageHeader, queryFreshness } from '../components/pageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/state';
import { useForgeHost } from '../hooks/useForgeHost';
import { usePageTitle } from '../hooks/usePageTitle';
import { useServerNow } from '../hooks/useServerNow';
import { AgentCards } from './agents/AgentCards';
import { PresenceList } from './agents/PresenceList';
import { presenceRepoHref } from './agents/presenceModel';
import { TimelineAxis } from './agents/PresenceTimeline';
import { SPAN_LABEL, TIMELINE_SPANS, spanOf, timelineWindow, type TimelineSpan } from './agents/presenceTimelineModel';
import './page.css';
import './ActiveAgentsPage.css';

const FIELDS = [['q', 'Search'], ['host', 'Server'], ['operator', 'Operator'], ['family', 'Family'], ['repo', 'Repository']] as const;
const FILTERS = ['q', 'host', 'operator', 'family', 'repo', 'agent', 'source', 'state'] as const;
const OPEN_RUNS = new Set<string>();
const LIMIT = 50;
/** How the page draws agents; kept in the address, never sent to the server. */
const VIEW_KEYS = ['view', 'span'] as const;
type AgentsView = 'list' | 'cards';

export function ActiveAgentsPage(): JSX.Element {
  usePageTitle('Active agents');
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const forgeHost = useForgeHost();
  const requestedPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const view: AgentsView = params.get('view') === 'cards' ? 'cards' : 'list';
  const span = spanOf(params.get('span'));
  const request = new URLSearchParams();
  for (const key of FILTERS) {
    const value = params.get(key)?.trim();
    if (value) request.set(key, value);
  }
  if (!request.has('state')) request.set('state', 'live');
  request.set('limit', String(LIMIT));
  request.set('page', String(page));
  const query = useQuery({
    queryKey: ['active-agents', request.toString()],
    queryFn: ({ signal }) => fetchAllAgentPresence(request, signal),
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 1,
  });
  const now = useServerNow(null, query.dataUpdatedAt, true, 30_000);
  const rows: PresenceRow[] = (query.data?.items ?? []).map((item) => ({ item, run: null }));
  const timeline = timelineWindow(span, now);
  /** A fresh address that keeps the reader's view and timeline span. */
  function keepView(): URLSearchParams {
    const next = new URLSearchParams();
    for (const key of VIEW_KEYS) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    return next;
  }
  function setView(key: 'view' | 'span', value: AgentsView | TimelineSpan, fallback: string): void {
    const updated = new URLSearchParams(params);
    if (value === fallback) updated.delete(key);
    else updated.set(key, value);
    setParams(updated, { replace: true });
  }
  /** A choice from a list applies at once; typed filters apply on Enter or the button. */
  function applyChoice(event: ChangeEvent<HTMLSelectElement>): void {
    event.currentTarget.form?.requestSubmit();
  }
  function filter(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = keepView();
    for (const key of FILTERS) {
      const value = String(data.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    setParams(next);
  }
  function move(next: number): void {
    const updated = new URLSearchParams(params);
    updated.set('page', String(next));
    setParams(updated);
  }
  function openRun(row: PresenceRow): void {
    const href = presenceRepoHref(forgeHost(row.item.repos[0]), row.item);
    if (href) void navigate(href);
  }
  return (
    <div className="page active-agents" data-testid="active-agents-page">
      <PageHeader title="Active agents" freshness={queryFreshness(query)}
        subtitle="Agents running across repositories and servers. Live includes active and idle sessions." />
      <form key={params.toString()} className="active-agents__filters" onSubmit={filter} aria-label="Filter active agents">
        {FIELDS.map(([key, label]) => <label key={key}>{label}<input name={key} defaultValue={params.get(key) ?? ''} /></label>)}
        <label>Harness<select name="agent" defaultValue={params.get('agent') ?? ''} onChange={applyChoice}>
          <option value="">All harnesses</option>
          <option value="claude-code">Claude</option><option value="codex">Codex</option>
          <option value="cursor">Cursor</option><option value="grok">Grok</option><option value="agy">AGY</option>
        </select></label>
        <label>Source<select name="source" defaultValue={params.get('source') ?? ''} onChange={applyChoice}>
          <option value="">All sources</option><option value="external">CLI sessions</option>
          <option value="agent_run">Jeryu runs</option><option value="queue_worker">Queue workers</option>
          <option value="reviewer">Reviewers</option><option value="gate">Gates</option>
        </select></label>
        <label>State<select name="state" defaultValue={params.get('state') ?? 'live'} onChange={applyChoice}>
          <option value="live">Live</option><option value="active">Active</option><option value="idle">Idle</option>
          <option value="stale">Stale</option><option value="ended">Ended</option><option value="all">All states</option>
        </select></label>
        <button type="submit">Apply filters</button>
        <button type="button" onClick={() => setParams(keepView())}>Clear filters</button>
      </form>
      <div className="active-agents__view">
        <div className="active-agents__toggle" role="group" aria-label="Show agents as">
          {(['list', 'cards'] as const).map((option) => (
            <button key={option} type="button" aria-pressed={view === option} onClick={() => setView('view', option, 'list')}
              data-testid={`agents-view-${option}`}>
              {option === 'list' ? 'List' : 'Cards'}
            </button>
          ))}
        </div>
        <label className="active-agents__span">Timeline
          <select value={span} onChange={(event) => setView('span', spanOf(event.target.value), '24h')} data-testid="agents-timeline-span">
            {TIMELINE_SPANS.map((option) => <option key={option} value={option}>{SPAN_LABEL[option]}</option>)}
          </select>
        </label>
      </div>
      {query.isPending ? <LoadingState variant="message" title="Loading active agents." /> : query.isError ? (
        <ErrorState title="Could not load active agents." error={query.error} onRetry={() => void query.refetch()} />
      ) : <>
        <p role="status">{query.data.total} matching {query.data.total === 1 ? 'agent' : 'agents'}</p>
        {!rows.length ? <EmptyState title="No agents match these filters." description="Try another server, repository, or state." />
          : view === 'cards' ? <AgentCards items={rows.map((row) => row.item)} hostForRepo={forgeHost} now={now} timeline={timeline} />
          : <>
            <TimelineAxis window={timeline} />
            <PresenceList rows={rows} host={forgeHost()} hostForRepo={forgeHost} repo="" now={now}
              openRuns={OPEN_RUNS} onOpenRun={openRun} avatars timeline={timeline} />
          </>}
        <nav className="active-agents__paging" aria-label="Agent pages">
          <button type="button" disabled={page === 1} onClick={() => move(page - 1)}>Previous</button>
          <span>Page {page}</span>
          <button type="button" disabled={page * LIMIT >= query.data.total} onClick={() => move(page + 1)}>Next</button>
        </nav>
      </>}
    </div>
  );
}

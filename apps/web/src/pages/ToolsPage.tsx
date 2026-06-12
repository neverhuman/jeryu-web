// ToolsPage.tsx — the /tools control surface behind the golden jeryu-tool box.
//
// Left rail: every registry tool ranked by LOC saved (realized + anticipated),
// from the same summary endpoint the golden box reads. Main area: the
// system-wide duplicate-code dashboard — pattern families over the persisted
// cross-repo scan, each expandable into member clusters with exact file spans,
// plus per-cluster Ignore (durable feedback) and Propose (files a registry
// proposal + build task) actions. The "Run live scan" button starts a
// server-side scan of every split family; progress streams in real time over
// the `tool_finder.scan` WebSocket scope into the progress panel.

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  Hammer,
  Layers,
  Radar,
  Sparkles,
  Wrench,
} from 'lucide-react';

import { EmptyState, ErrorState, LoadingState } from '../components/state';
import {
  useIgnoreCluster,
  useProposeCluster,
  useToolFinderDashboard,
  useToolFinderScan,
} from '../hooks/useToolFinder';
import { useToolRegistry } from '../hooks/useToolRegistry';
import type {
  ToolFinderCluster,
  ToolFinderPatternFamily,
  ToolFinderScanStatus,
  ToolRegistryEntry,
  WebEvent,
} from '../api/types';
import './page.css';
import './ToolsPage.css';

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function formatScannedAt(millis: string | null): string {
  if (!millis || !/^[0-9]+$/.test(millis)) return 'never';
  const date = new Date(Number(millis));
  if (Number.isNaN(date.getTime())) return 'never';
  return date.toLocaleString();
}

const CATEGORY_LABELS: Record<string, string> = {
  'tool-candidate': 'tool candidate',
  'managed-scaffold': 'managed scaffold',
  'config-pattern': 'config pattern',
  'test-pattern': 'test pattern',
};

function categoryPillClass(category: string): string {
  switch (category) {
    case 'tool-candidate':
      return 'page__pill page__pill--success';
    case 'managed-scaffold':
      return 'page__pill page__pill--warning';
    default:
      return 'page__pill';
  }
}

/** One registry tool in the left rail, ranked by total LOC saved. */
function RailTool({ tool }: { tool: ToolRegistryEntry }): JSX.Element {
  const total = tool.loc_saved + tool.loc_saved_estimate;
  return (
    <li className="tools-rail__tool" data-testid={`rail-tool-${tool.id}`}>
      <div className="tools-rail__tool-head">
        <span className="tools-rail__tool-name">{tool.name}</span>
        <span
          className="tools-rail__tool-loc"
          title={`${formatCount(tool.loc_saved)} realized + ${formatCount(tool.loc_saved_estimate)} anticipated LOC saved`}
        >
          {formatCount(total)} LOC
        </span>
      </div>
      <div className="tools-rail__tool-meta">
        <span className="page__pill">{tool.kind}</span>
        <span className={`page__pill tools-rail__status--${tool.status}`}>
          {tool.status}
        </span>
      </div>
    </li>
  );
}

/** Ranked registry rail (all tools, by realized + anticipated LOC saved). */
function RegistryRail(): JSX.Element {
  const { data, isPending, isError, error } = useToolRegistry();
  const ranked = useMemo(() => {
    const tools = data?.tools ?? [];
    return [...tools].sort(
      (a, b) =>
        b.loc_saved + b.loc_saved_estimate - (a.loc_saved + a.loc_saved_estimate)
    );
  }, [data]);

  return (
    <aside className="tools-rail" aria-label="Registry tools by LOC saved">
      <h2 className="page__section-title">
        <Wrench size={13} aria-hidden="true" /> Registry tools
        {data ? ` · ${formatCount(data.tool_count)}` : ''}
      </h2>
      {data ? (
        <p className="tools-rail__totals">
          {formatCount(data.realized_loc_saved)} LOC saved
          {data.anticipated_loc_saved > 0
            ? ` · +${formatCount(data.anticipated_loc_saved)} anticipated`
            : ''}
        </p>
      ) : null}
      {isPending ? (
        <LoadingState title="Loading registry…" variant="message" />
      ) : isError ? (
        <ErrorState title="Could not load the registry." error={error} />
      ) : ranked.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No registered tools yet."
          description="Propose a cluster from the dashboard to file the first one."
        />
      ) : (
        <ul className="tools-rail__list">
          {ranked.map((tool) => (
            <RailTool key={tool.id} tool={tool} />
          ))}
        </ul>
      )}
    </aside>
  );
}

/** Live scan progress: phase, repo counter bar, and the event feed. */
function ScanProgressPanel({
  status,
  feed,
}: {
  status: ToolFinderScanStatus;
  feed: WebEvent[];
}): JSX.Element {
  const fraction =
    status.repos_total > 0 ? status.repos_done / status.repos_total : 0;
  return (
    <section
      className="tools-scan page__card"
      data-testid="scan-progress-panel"
      aria-live="polite"
    >
      <div className="tools-scan__head">
        <span className={`page__pill tools-scan__phase--${status.phase}`}>
          {status.phase}
        </span>
        <span className="tools-scan__counts">
          {status.repos_done}/{status.repos_total} repos ·{' '}
          {formatCount(status.files_scanned)} files ·{' '}
          {formatCount(status.clusters_found)} clusters
        </span>
        {status.current_repo ? (
          <span className="tools-scan__repo">{status.current_repo}</span>
        ) : null}
      </div>
      <div
        className="tools-scan__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={status.repos_total}
        aria-valuenow={status.repos_done}
      >
        <div
          className="tools-scan__bar-fill"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
      {status.error ? (
        <p className="tools-scan__error">{status.error}</p>
      ) : null}
      <ul className="tools-scan__feed">
        {feed.slice(0, 6).map((event) => (
          <li key={String(event.seq)} className="tools-scan__feed-item">
            {event.summary}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One member cluster: preview, occurrences, and the Ignore/Propose actions. */
function ClusterCard({ cluster }: { cluster: ToolFinderCluster }): JSX.Element {
  const ignore = useIgnoreCluster();
  const propose = useProposeCluster();
  const [receipt, setReceipt] = useState<string | null>(null);

  return (
    <div className="tools-cluster" data-testid={`cluster-${cluster.cluster_id}`}>
      <div className="tools-cluster__head">
        <code className="tools-cluster__id">{cluster.cluster_id}</code>
        <span className="page__pill">{cluster.language}</span>
        <span className={categoryPillClass(cluster.category)}>
          {CATEGORY_LABELS[cluster.category] ?? cluster.category}
        </span>
        <span className="tools-cluster__loc">
          ~{formatCount(cluster.anticipated_loc_saved)} LOC saved
        </span>
        <span className="tools-cluster__spans">
          {cluster.repo_count} repos · {cluster.occurrence_count} occurrences ·{' '}
          {cluster.file_count} files
        </span>
      </div>
      <p className="tools-cluster__insight">{cluster.insight}</p>
      <ul className="tools-cluster__occurrences">
        {cluster.occurrences.map((occ) => (
          <li key={`${occ.repo_id}:${occ.path}:${occ.start_line}`}>
            <span className="tools-cluster__occ-repo">{occ.repo_id}</span>{' '}
            <code>
              {occ.path}:{occ.start_line}-{occ.end_line}
            </code>
            {occ.is_test ? <span className="page__pill">test</span> : null}
          </li>
        ))}
      </ul>
      <details className="tools-cluster__preview">
        <summary>Normalized window</summary>
        <pre>{cluster.normalized_preview}</pre>
      </details>
      <div className="tools-cluster__actions">
        <button
          type="button"
          className="tools-button"
          disabled={propose.isPending}
          onClick={() => {
            propose.mutate(
              { clusterId: cluster.cluster_id },
              {
                onSuccess: (result) => setReceipt(result.message),
                onError: (error) => setReceipt(error.message),
              }
            );
          }}
        >
          <Hammer size={13} aria-hidden="true" /> Propose tool
        </button>
        <button
          type="button"
          className="tools-button tools-button--quiet"
          disabled={ignore.isPending || cluster.ignored}
          onClick={() => {
            const reason = window.prompt(
              'Why is this cluster not a tool-build lead?'
            );
            if (reason && reason.trim()) {
              ignore.mutate({ clusterId: cluster.cluster_id, reason: reason.trim() });
            }
          }}
        >
          <EyeOff size={13} aria-hidden="true" /> Ignore
        </button>
        <span className="tools-cluster__suggestion">
          → {cluster.suggested_kind}: {cluster.suggested_name}
        </span>
      </div>
      {receipt ? <p className="tools-cluster__receipt">{receipt}</p> : null}
    </div>
  );
}

/** A pattern family card: the dashboard's top-level unit. */
function PatternFamilyCard({
  family,
}: {
  family: ToolFinderPatternFamily;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <article
      className="page__card tools-family"
      data-testid={`family-${family.family_id}`}
    >
      <button
        type="button"
        className="tools-family__toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? (
          <ChevronDown size={14} aria-hidden="true" />
        ) : (
          <ChevronRight size={14} aria-hidden="true" />
        )}
        <span className="tools-family__label">{family.label}</span>
        <span className={categoryPillClass(family.category)}>
          {CATEGORY_LABELS[family.category] ?? family.category}
        </span>
        <span className="page__pill">{family.language}</span>
        <span className="tools-family__loc">
          ~{formatCount(family.anticipated_loc_saved)} LOC saved
        </span>
      </button>
      <p className="tools-family__meta">
        {family.clusters.length} cluster
        {family.clusters.length === 1 ? '' : 's'} · {family.repos.length} repos ·{' '}
        {family.occurrence_count} occurrences · {family.file_count} files
      </p>
      <p className="tools-family__repos">{family.repos.join(', ')}</p>
      {expanded ? (
        <div className="tools-family__clusters">
          {family.clusters.map((cluster) => (
            <ClusterCard key={cluster.cluster_id} cluster={cluster} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function ToolsPage(): JSX.Element {
  const dashboard = useToolFinderDashboard();
  const scan = useToolFinderScan();
  const showProgress =
    scan.isRunning ||
    scan.status?.phase === 'failed' ||
    (scan.status?.phase === 'completed' && scan.feed.length > 0);

  return (
    <div className="page page--wide" data-testid="tools-page">
      <header className="page__header tools-header">
        <div className="tools-header__row">
          <h1 className="page__title">
            <Layers size={20} aria-hidden="true" /> Tools
          </h1>
          <div className="tools-header__scan">
            {dashboard.data ? (
              <span className="tools-header__meta">
                last scan: {formatScannedAt(dashboard.data.scan.scanned_at)} ·{' '}
                {formatCount(dashboard.data.cluster_count)} clusters in{' '}
                {formatCount(dashboard.data.family_count)} families · ~
                {formatCount(dashboard.data.candidate_loc_saved)} candidate LOC
              </span>
            ) : null}
            <button
              type="button"
              className="tools-button tools-button--primary"
              data-testid="run-scan-button"
              disabled={scan.isRunning || scan.isStarting}
              onClick={scan.start}
            >
              <Radar size={14} aria-hidden="true" />
              {scan.isRunning ? 'Scanning…' : 'Run live scan'}
            </button>
          </div>
        </div>
        <p className="page__subtitle">
          Cross-repo duplicate-code pattern families across every split family
          on this host — the strongest candidates for central tool builds,
          ranked by the lines a shared tool would save.
        </p>
        {scan.startError ? (
          <p className="tools-scan__error">{scan.startError.message}</p>
        ) : null}
      </header>

      {showProgress && scan.status ? (
        <ScanProgressPanel status={scan.status} feed={scan.feed} />
      ) : null}

      <div className="tools-body">
        <RegistryRail />
        <section className="tools-dashboard" aria-label="Pattern families">
          {dashboard.isPending ? (
            <LoadingState title="Loading the duplicate-code dashboard…" variant="message" />
          ) : dashboard.isError ? (
            <ErrorState
              title="Could not load the dashboard."
              error={dashboard.error}
            />
          ) : dashboard.data.families.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No cross-repo clusters yet."
              description="Run a live scan to mine every split family for duplicated code worth extracting into shared tools."
            />
          ) : (
            <div className="tools-dashboard__families">
              {dashboard.data.families.map((family) => (
                <PatternFamilyCard key={family.family_id} family={family} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

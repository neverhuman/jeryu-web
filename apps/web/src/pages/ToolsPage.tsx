// ToolsPage.tsx — Shared tools → Findings (`/shared-tools/findings`).
//
// The system-wide duplicate-code dashboard — pattern families over the persisted
// cross-repo scan, each expandable into member clusters with exact file spans,
// plus per-cluster Ignore (durable feedback) and Propose (files a registry
// proposal + build task) actions. The "Run live scan" button starts a
// server-side scan of every split family (the server also re-runs it on a
// schedule); progress streams in real time over
// the `tool_finder.scan` WebSocket scope into the progress panel.

import { Radar, Sparkles } from 'lucide-react';

import { EmptyState, ErrorState, LoadingState } from '../components/state';
import {
  useToolFinderDashboard,
  useToolFinderScan,
} from '../hooks/useToolFinder';
import {
  PatternFamilyCard,
  ScanProgressPanel,
  formatCount,
  formatScannedAt,
} from './tools';
import './page.css';
import './ToolsPage.css';
import { SharedToolsTabs } from './sharedTools/SharedToolsTabs';

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
          <h1 className="page__title">Shared tools</h1>
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
          Duplicated code across every split family, ranked by the lines a
          shared tool would save. Propose a cluster to send it to Proposals;
          the scan re-runs on its own every day.
        </p>
        {scan.startError ? (
          <p className="tools-scan__error">{scan.startError.message}</p>
        ) : null}
      </header>
      <SharedToolsTabs />

      {showProgress && scan.status ? (
        <ScanProgressPanel status={scan.status} feed={scan.feed} />
      ) : null}

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
  );
}

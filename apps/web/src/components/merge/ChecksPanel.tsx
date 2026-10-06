// ChecksPanel.tsx — list of CI status checks (W-FE-11).
//
// Each row shows the check name, a status badge (success / failing /
// pending / skipped / cancelled / neutral), and whether the merge waits for
// it: `required`, or the advisory label that says why it does not (e.g.
// `advisory - shadow mode` for `jankurai/proof`). Every row expands in place
// to the check's title, its full output summary, that advisory reason, and a
// link to the human page behind it — the Quality gate view for
// `jankurai/proof`, the gate run log for a commit status. So a red check is
// two clicks from its reason, without leaving the pull request page.
//
// The panel header doubles as a summary
// (e.g. "3 passing · 1 failing · 0 pending").
//
// A pending check shows how its run is going (CiProgress): against the
// forge's estimate when a gate runner reports it, otherwise as elapsed time
// since its `pending` post. The clock is the forge's, from `server_time`.
//
// A check the forge names by UUID ("Attempt 428377c2-6190-…") is shown with
// the id shortened; the whole id stays in the row's `title` and in the link
// to the run, so it is still readable and still copyable.

import { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleDashed,
  CircleOff,
  ExternalLink,
  Loader2,
  type LucideIcon,
} from 'lucide-react';

import type { PullRequestCheck, PullRequestChecks } from '../../api/types';
import { useServerNow } from '../../hooks/useServerNow';
import { CiProgress } from '../ciProgress/CiProgress';
import type { DurationEstimate } from '../ciProgress/ciProgressModel';
import { fullIdTitle, shortenIds } from '../identifiers/shortId';

import './merge.css';

type Tone =
  | 'success'
  | 'failing'
  | 'pending'
  | 'skipped'
  | 'cancelled'
  | 'neutral';

function toneFor(check: PullRequestCheck): Tone {
  const status = check.status?.toLowerCase() ?? '';
  if (status === 'success' || status === 'passing') return 'success';
  if (status === 'failure' || status === 'failing' || status === 'error')
    return 'failing';
  if (status === 'pending' || status === 'running' || status === 'queued')
    return 'pending';
  if (status === 'skipped') return 'skipped';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  return 'neutral';
}

const TONE_ICONS: Record<Tone, LucideIcon> = {
  success: CheckCircle2,
  failing: CircleAlert,
  pending: Loader2,
  skipped: CircleOff,
  cancelled: CircleDashed,
  neutral: Circle,
};

const TONE_LABELS: Record<Tone, string> = {
  success: 'passing',
  failing: 'failing',
  pending: 'pending',
  skipped: 'skipped',
  cancelled: 'cancelled',
  neutral: 'neutral',
};

/**
 * The status word shown next to every check. A check whose status is not one
 * of the known tones keeps the word the forge reported, and a check with no
 * status at all says so, so no row is left with a bare icon.
 */
export function checkStatusWord(check: PullRequestCheck, notRequired = false): string {
  const tone = toneFor(check);
  if (notRequired) {
    // Say WHY it does not block, not just that it does not.
    return `failing, ${check.advisory?.label ?? 'not required'}`;
  }
  if (tone !== 'neutral') return TONE_LABELS[tone];
  const raw = check.status?.trim();
  return raw ? raw.toLowerCase() : 'no status reported';
}

/**
 * Whether `url` is a page a person can read. A raw `/api/` route serves JSON
 * and plain `http://` is not a link this app hands to a reader, so neither is
 * offered as the check's details page — the server sends `web_url` for that.
 */
export function isReadablePageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith('/')) return !trimmed.startsWith('/api/');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return !parsed.pathname.startsWith('/api/') && parsed.pathname !== '/api';
}

/**
 * The page a row links to: the server's human `web_url`, falling back to
 * `details_url` only when that is itself readable.
 */
export function checkPageUrl(check: PullRequestCheck): string | null {
  for (const candidate of [check.web_url, check.details_url]) {
    if (typeof candidate === 'string' && isReadablePageUrl(candidate)) {
      return candidate.trim();
    }
  }
  return null;
}

/** What the row says about whether the merge waits for this check. */
function requirementNote(check: PullRequestCheck): string | null {
  if (check.required === true) return 'required to merge';
  if (check.advisory) return check.advisory.label;
  if (check.required === false) return 'not required to merge';
  return null;
}

export interface ChecksPanelProps {
  checks: PullRequestChecks | null;
  isLoading?: boolean;
  /**
   * False when the merge does not wait for the failing checks (the passport
   * passes, or the pull request is already merged or closed): they are shown
   * in a neutral tone with a note instead of as red blockers.
   */
  failuresBlockMerge?: boolean;
  /** When `checks` was fetched, to line the page's clock up with `server_time`. */
  receivedAtMs?: number;
  className?: string;
}

/** When a pending check's run started and what it should take, or null. */
export function pendingRun(
  check: PullRequestCheck
): { startedAt: string; estimate: DurationEstimate | null } | null {
  if (toneFor(check) !== 'pending') return null;
  const running = check.running;
  if (running) {
    const estimate =
      running.typical_seconds !== null && running.slow_seconds !== null
        ? {
            typicalSeconds: running.typical_seconds,
            slowSeconds: running.slow_seconds,
            samples: running.samples,
          }
        : null;
    return { startedAt: running.started_at, estimate };
  }
  return check.started_at ? { startedAt: check.started_at, estimate: null } : null;
}

export function ChecksPanel({
  checks,
  isLoading = false,
  failuresBlockMerge = true,
  receivedAtMs = 0,
  className,
}: ChecksPanelProps): JSX.Element {
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const anyRunning = (checks?.checks ?? []).some((check) => pendingRun(check) !== null);
  const nowMs = useServerNow(checks?.server_time, receivedAtMs, anyRunning);

  if (isLoading) {
    return (
      <section
        className={`checks-panel ${className ?? ''}`.trim()}
        aria-label="Status checks"
      >
        <header className="checks-panel__header">
          <h3 className="checks-panel__title">Checks</h3>
          <p className="checks-panel__summary">Loading…</p>
        </header>
      </section>
    );
  }

  const list = checks?.checks ?? [];
  const toggle = (id: string): void =>
    setExpanded((open) =>
      open.includes(id) ? open.filter((each) => each !== id) : [...open, id]
    );

  return (
    <section
      className={`checks-panel ${className ?? ''}`.trim()}
      aria-label="Status checks"
    >
      <header className="checks-panel__header">
        <h3 className="checks-panel__title">Checks</h3>
        {checks ? (
          <p className="checks-panel__summary">
            <span className="checks-panel__count checks-panel__count--success">
              {checks.passing} passing
            </span>
            <span aria-hidden="true"> · </span>
            <span
              className={`checks-panel__count checks-panel__count--${
                failuresBlockMerge ? 'failing' : 'skipped'
              }`}
            >
              {checks.failing} failing
              {!failuresBlockMerge && checks.failing > 0
                ? ' (advisory — open a row for why)'
                : ''}
            </span>
            <span aria-hidden="true"> · </span>
            <span className="checks-panel__count checks-panel__count--pending">
              {checks.pending} pending
            </span>
            {checks.skipped > 0 ? (
              <>
                <span aria-hidden="true"> · </span>
                <span className="checks-panel__count checks-panel__count--skipped">
                  {checks.skipped} skipped
                </span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="checks-panel__summary">No checks reported.</p>
        )}
      </header>

      {list.length === 0 ? (
        <p className="checks-panel__empty">No checks have run on this head.</p>
      ) : (
        <ul className="checks-panel__list">
          {list.map((check) => {
            const rawTone = toneFor(check);
            // A required check stays red even when the merge is already
            // settled: only a check the merge does not wait for is calmed.
            const notRequired =
              rawTone === 'failing' && !failuresBlockMerge && check.required !== true;
            const tone: Tone = notRequired ? 'neutral' : rawTone;
            const Icon = TONE_ICONS[rawTone];
            const statusWord = checkStatusWord(check, notRequired);
            const note = requirementNote(check);
            const pageUrl = checkPageUrl(check);
            const isOpen = expanded.includes(check.id);
            const bodyId = `check-detail-${check.id}`;
            const Chevron = isOpen ? ChevronDown : ChevronRight;
            const run = pendingRun(check);
            return (
              <li
                key={check.id}
                className="checks-panel__item"
                data-tone={tone}
                data-testid={`check-row-${check.name}`}
              >
                <div className="checks-panel__row">
                  <span
                    className={`checks-panel__badge checks-panel__badge--${tone}`}
                    aria-hidden="true"
                  >
                    <Icon
                      aria-hidden="true"
                      size={14}
                      className={
                        rawTone === 'pending' ? 'checks-panel__spin' : undefined
                      }
                    />
                  </span>
                  <button
                    type="button"
                    className="checks-panel__toggle"
                    aria-expanded={isOpen}
                    aria-controls={bodyId}
                    onClick={() => toggle(check.id)}
                  >
                    <Chevron aria-hidden="true" size={12} />
                    <span
                      className="checks-panel__name"
                      title={fullIdTitle(check.name)}
                    >
                      {shortenIds(check.name)}{' '}
                      <span
                        className={`checks-panel__status checks-panel__status--${tone}`}
                      >
                        {statusWord}
                      </span>
                    </span>
                  </button>
                  {note ? (
                    <span
                      className={`checks-panel__requirement checks-panel__requirement--${
                        check.required === true ? 'required' : 'advisory'
                      }`}
                    >
                      {note}
                    </span>
                  ) : null}
                </div>
                {run ? (
                  <div className="checks-panel__progress">
                    <CiProgress
                      startedAt={run.startedAt}
                      estimate={run.estimate}
                      nowMs={nowMs}
                      testId={`check-progress-${check.name}`}
                    />
                  </div>
                ) : null}
                <div
                  id={bodyId}
                  className="checks-panel__detail"
                  hidden={!isOpen}
                >
                  {check.title ? (
                    <div className="checks-panel__detail-title">
                      {check.title}
                    </div>
                  ) : null}
                  {check.description ? (
                    <div
                      className="checks-panel__description"
                      title={fullIdTitle(check.description)}
                    >
                      {shortenIds(check.description)}
                    </div>
                  ) : (
                    <div className="checks-panel__description">
                      This check reported no summary.
                    </div>
                  )}
                  {check.advisory ? (
                    <div className="checks-panel__description">
                      {check.advisory.reason}
                      {check.advisory.url ? (
                        <>
                          {' '}
                          <a
                            className="checks-panel__page-link"
                            href={check.advisory.url}
                          >
                            Why it is not required
                          </a>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {pageUrl ? (
                    <a
                      className="checks-panel__page-link"
                      href={pageUrl}
                      {...(pageUrl.startsWith('/')
                        ? {}
                        : { target: '_blank', rel: 'noopener noreferrer' })}
                    >
                      {check.kind === 'status'
                        ? `Open the ${check.name} run log`
                        : `Open the ${check.name} report`}
                      <ExternalLink aria-hidden="true" size={12} />
                    </a>
                  ) : (
                    <div className="checks-panel__description">
                      This check reported no page to open.
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// YieldAdhoc.tsx — "Ad-hoc agent sessions" on the Yield page: what agent
// sessions people ran by hand cost, outside the todo queue. It sits after the
// breakdown and says plainly that none of it is in cost per merged change.
// Three numbers, a table cut by family, repository, agent or model (a
// repository links to its page), and a small bar per week.

import { Link } from 'react-router-dom';

import type { YieldAdhoc, YieldAdhocBy } from '../../api/types';
import { useForgeHost } from '../../hooks/useForgeHost';
import { repoRefOf, repoUrl } from '../repoBrowserModel';
import {
  ADHOC_BYS,
  adhocGroups,
  adhocRemainder,
  adhocShare,
  adhocState,
  adhocSummary,
  adhocTiles,
  adhocWeekBars,
  adhocWeekSummary,
} from './adhocModel';
import { ScrollTable } from './ScrollTable';
import { formatUsd } from './yieldModel';

export function YieldAdhocSection({
  adhoc,
  days,
  by,
  onBy,
}: {
  adhoc: YieldAdhoc;
  days: number;
  by: YieldAdhocBy;
  onBy: (by: YieldAdhocBy) => void;
}): JSX.Element {
  const quiet = adhocState(adhoc) === 'quiet';
  return (
    <section className="page__section" aria-labelledby="yield-adhoc" data-testid="yield-adhoc">
      <div className="yield__section-head">
        <h2 className="page__section-title" id="yield-adhoc">
          Ad-hoc agent sessions
        </h2>
        {quiet ? null : (
          <div className="yield__segmented" role="group" aria-label="Break ad-hoc spend down by">
            {ADHOC_BYS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="yield__segment"
                aria-pressed={option.id === by}
                onClick={() => onBy(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="yield__summary" data-testid="yield-adhoc-note">
        Sessions people ran by hand, outside the todo queue. Their spend is counted here only: it is
        not in cost per merged change, yield, or any figure above.
      </p>
      {quiet ? (
        <p className="yield__summary" data-testid="yield-adhoc-none">
          No ad-hoc agent session reported spend in this window.
        </p>
      ) : (
        <>
          <p className="yield__summary" data-testid="yield-adhoc-summary">
            {adhocSummary(adhoc, days)}
          </p>
          <div className="yield__tiles">
            {adhocTiles(adhoc).map((tile) => (
              <article key={tile.id} className="yield__tile" data-testid={`yield-adhoc-tile-${tile.id}`}>
                <div className="yield__tile-label">{tile.label}</div>
                <div className="yield__tile-value">{tile.value}</div>
                <div className="yield__tile-detail">{tile.detail}</div>
              </article>
            ))}
          </div>
          <AdhocTable adhoc={adhoc} by={by} />
          <AdhocWeeks adhoc={adhoc} />
        </>
      )}
    </section>
  );
}

function AdhocTable({ adhoc, by }: { adhoc: YieldAdhoc; by: YieldAdhocBy }): JSX.Element {
  const forgeHost = useForgeHost();
  const cut = ADHOC_BYS.find((option) => option.id === by)?.label ?? by;
  const rows = adhocGroups(adhoc, by);
  const remainder = adhocRemainder(adhoc, by);
  return (
    <ScrollTable label={`Ad-hoc spend by ${cut.toLowerCase()}`}>
      <table className="yield__table" data-testid="yield-adhoc-table">
        <thead>
          <tr>
            <th scope="col">{cut}</th>
            <th scope="col" className="yield__num">
              Sessions
            </th>
            <th scope="col" className="yield__num">
              Share
            </th>
            <th scope="col" className="yield__num">
              Spend
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.group} data-testid={`yield-adhoc-group-${row.group}`}>
              <th scope="row">
                {by === 'repo' && row.group.includes('/') ? (
                  <Link to={repoUrl(repoRefOf(forgeHost(row.group), row.group))}>{row.group}</Link>
                ) : (
                  row.group
                )}
                {by === 'repo' && row.family ? <span className="yield__sub">{row.family}</span> : null}
              </th>
              <td className="yield__num">{row.sessions}</td>
              <td className="yield__num">{adhocShare(row, adhoc)}</td>
              <td className="yield__num">{formatUsd(row.usd)}</td>
            </tr>
          ))}
          {remainder ? (
            <tr data-testid="yield-adhoc-remainder">
              <th scope="row" className="yield__muted">
                {remainder.label}
              </th>
              <td className="yield__num">—</td>
              <td className="yield__num">{adhocShare(remainder, adhoc)}</td>
              <td className="yield__num">{formatUsd(remainder.usd)}</td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr data-testid="yield-adhoc-total">
            <th scope="row">All</th>
            <td className="yield__num">{adhoc.sessions}</td>
            <td className="yield__num">{rows.length > 0 || remainder ? '100%' : '—'}</td>
            <td className="yield__num">{formatUsd(adhoc.total_usd)}</td>
          </tr>
        </tfoot>
      </table>
    </ScrollTable>
  );
}

/** One bar per week, HTML so the labels keep the page's size on a phone. */
function AdhocWeeks({ adhoc }: { adhoc: YieldAdhoc }): JSX.Element | null {
  const bars = adhocWeekBars(adhoc.weekly);
  if (bars.length === 0) return null;
  const first = bars[0];
  const last = bars[bars.length - 1];
  return (
    <div className="yield-adhoc__weeks" data-testid="yield-adhoc-weeks">
      <div className="yield-funnel__label">By week</div>
      <div className="yield-adhoc__bars" role="img" aria-label={adhocWeekSummary(bars)}>
        {bars.map((bar) => (
          <div key={bar.week} className="yield-adhoc__bar-slot" title={bar.title}>
            <div className="yield-adhoc__bar" style={{ height: `${Math.max(2, bar.fraction * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="yield-chart__x" aria-hidden="true">
        <span>{first.week}</span>
        {last.week !== first.week ? <span>{last.week}</span> : null}
      </div>
    </div>
  );
}

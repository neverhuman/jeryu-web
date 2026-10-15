import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FlowReport } from '../../api/types';
import { safeFlowHref } from './flowModel';

const LABELS: Record<string, string> = {
  needs_disposition: 'Needs disposition',
  replacement_recorded: 'Replacement recorded',
  abandoned_recorded: 'Abandoned · reason recorded',
};
export function FlowClosures({ report, station, onInspect }: {
  report: FlowReport; station: string | null; onInspect: (lot: string, station: string) => void;
}) {
  const [segment, setSegment] = useState('attention');
  const [local, setLocal] = useState(false);
  const [page, setPage] = useState(0);
  const all = report.closures ?? [];
  const lots = new Set(all.map(i => i.lot_id));
  const attention = new Set(all.filter(i => i.needs_attention).map(i => i.lot_id));
  const rows = all.filter(i => (!local || !station || i.station === station) && (segment === 'all' || (segment === 'attention' ? i.needs_attention : i.disposition === segment)));
  const offset = Math.min(page * 50, Math.max(0, Math.ceil(rows.length / 50) - 1) * 50);
  return <section className="flow-closures" data-testid="flow-closures" aria-label="Closed work and disposition">
    <h2>Closed work · {report.closures === undefined ? 'coverage unknown' : `${lots.size} items · ${attention.size} need attention`}</h2>
    <details><summary>Inspect closed work</summary>
    <p>Closed is a lifecycle state, not proof of delivery. These records are excluded from active station counts. Merged pull requests continue through release; history remains visible. Daily history and Scorecard retain their recorded events.</p>
    {report.closures === undefined ? <p>Closure reconciliation is unavailable on this server version; station counts may include closed work.</p> : <>
      <div className="flow-detail__filter">
        <label>Disposition <select value={segment} onChange={e => { setSegment(e.target.value); setPage(0); }}>
          <option value="attention">Needs attention</option><option value="all">All closed work</option>
          <option value="replacement_recorded">Replacement recorded</option><option value="abandoned_recorded">Abandonment recorded</option>
        </select></label>
        {station && <label><input type="checkbox" checked={local} onChange={e => { setLocal(e.target.checked); setPage(0); }} /> Only {station}</label>}
      </div>
      <p>{rows.length} station records match. An item can appear at more than one station.</p>
      <ol className="flow-evidence">
        {rows.slice(offset, offset + 50).map((item, i) => <li key={`${item.lot_id}-${item.station}-${i}`}>
          <div className="flow-evidence__head"><strong>{LABELS[item.disposition] ?? 'Disposition unknown'}</strong><span>Closed {item.kind === 'todo' ? 'todo' : 'pull request'} · last recorded at {item.station}</span></div>
          <Link to={safeFlowHref(item.href) ?? '/flow'}>{item.lot_id}</Link> · {item.title}
          {item.replacement && <p>Reported replacement: <Link to={safeFlowHref(item.replacement.href) ?? '/flow'}>{item.replacement.label}</Link> · {item.replacement.state}. Replacement is not proof of delivery.</p>}
          {item.needs_attention && <p>Work remains unresolved here. Confirm its replacement, deliberately abandon it with a reason, or recover the unfinished work.</p>}
          <details><summary>Recorded explanation</summary><p className="flow-closures__explanation">{item.explanation || 'No explanation recorded in the pull request description or todo note.'}</p><p>Excerpt from the current record, up to 2,000 characters. Follow the item link for its full discussion and evidence.</p></details>
          <button onClick={() => onInspect(item.lot_id, item.station)}>Inspect history</button>
        </li>)}
      </ol>
      {rows.length === 0 && <p>No closed work matches these filters.</p>}
      {rows.length > 50 && <div className="flow__segmented"><button disabled={offset === 0} onClick={() => setPage(Math.max(0, offset / 50 - 1))}>Previous 50</button><button disabled={offset + 50 >= rows.length} onClick={() => setPage(offset / 50 + 1)}>Next 50</button></div>}
      <details><summary>How to record a disposition</summary><p>In the pull request description or todo note, record a replacement as <code>Superseded-by: owner/repo#123</code>. For an intentional abandonment, record <code>Flow-disposition: abandoned</code> and a separate <code>Flow-reason: …</code> line. These are reported decisions, not verification that commits shipped. Similar titles and branch names are never treated as proof.</p></details>
    </>}
    </details>
    {Boolean(report.lifecycle_problems?.length) && <p role="status">Lifecycle coverage is incomplete: {report.lifecycle_problems?.join('; ')}. Unreadable items retain their recorded station state.</p>}
  </section>;
}

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { LineageGraph } from '../../api/types/delivery';
import { When } from '../../format/When';
import { listRowProps, LIST_OPEN_PROP, useListKeys } from '../../hooks/useListKeys';
import { commitPath } from '../repoCommitsModel';
import { graphLayout } from './model';

export function CommitGraph({ graph, provider, initialShown = 50 }: { graph: LineageGraph; provider: string; initialShown?: number }) {
  const [shown, setShown] = useState(initialShown);
  const [params, setParams] = useSearchParams();
  const selected = params.get('commit');
  const layout = graphLayout(graph);
  const commits = graph.commits.slice(0, shown);
  const chosen = graph.commits.find(commit => commit.sha === selected);
  const width = Math.max(40, layout.columns * 18 + 16);
  const keys = useListKeys<HTMLUListElement>();
  const x = (lane: number) => 16 + lane * 18;
  const y = (row: number) => 22 + row * 44;
  return <>
    <div className="lineage-graph" style={{ '--rail-width': `${width}px` } as React.CSSProperties}>
      <svg width={width} height={commits.length * 44} aria-hidden="true" className="lineage-graph__rails">
        {layout.edges.filter(edge => edge.from < commits.length).map(edge => {
          const to = edge.to === null || edge.to >= commits.length ? commits.length * 44 : y(edge.to);
          return <path key={`${edge.child}:${edge.parent}`} d={`M${x(edge.fromLane)},${y(edge.from)} C${x(edge.fromLane)},${(y(edge.from) + to) / 2} ${x(edge.toLane)},${(y(edge.from) + to) / 2} ${x(edge.toLane)},${to}`} fill="none" className={edge.to === null || edge.to >= commits.length ? 'lineage-edge lineage-edge--missing' : 'lineage-edge'} />;
        })}
        {commits.map((commit, index) => <circle key={commit.sha} cx={x(layout.lane.get(commit.sha) ?? 0)} cy={y(index)} r={commit.sha === graph.default_sha ? 5 : 3} className={layout.lane.get(commit.sha) === 0 ? 'lineage-dot lineage-dot--main' : 'lineage-dot'} />)}
      </svg>
      <ul ref={keys} className="lineage-graph__commits" aria-label="Commit ancestry">
        {commits.map(commit => <li {...listRowProps} data-list-key={commit.sha} key={commit.sha} className={selected === commit.sha ? 'lineage-graph__row lineage-graph__row--selected' : 'lineage-graph__row'}>
          <button {...LIST_OPEN_PROP} type="button" aria-pressed={selected === commit.sha} onClick={() => { const next = new URLSearchParams(params); next.set('commit', commit.sha); setParams(next, { replace: true }); }}>
            <span className="lineage-graph__subject">{commit.summary}</span>
            {commit.sha === graph.default_sha && <span className="page__pill">{graph.default_branch}</span>}
            {graph.branches.filter(branch => branch.sha === commit.sha).map(branch => <span className="page__pill" key={branch.name}>{branch.name}</span>)}
            <code>{commit.sha.slice(0, 7)}</code>
          </button>
        </li>)}
      </ul>
    </div>
    {graph.commits.length > shown && <button type="button" onClick={() => setShown(count => count + 50)}>Show more commits</button>}
    {selected && !chosen && <p className="delivery-muted" role="status">This commit is outside the recent graph. <Link to={commitPath(provider, graph.repository, selected)}>Open the selected commit</Link>.</p>}
    {chosen && <aside className="lineage-selection" aria-label="Selected commit">
      <strong>{chosen.summary}</strong><p>{chosen.author} · <When at={chosen.committed_at} /></p>
      <Link to={commitPath(provider, graph.repository, chosen.sha)}>Open commit and diff</Link>
      <details><summary>Parent commits</summary>{chosen.parents.length ? chosen.parents.map(parent => <p key={parent}><Link to={commitPath(provider, graph.repository, parent)}><code>{parent.slice(0, 12)}</code></Link></p>) : <p>Root commit</p>}</details>
    </aside>}
    {(graph.truncated || graph.missing_parents.length > 0 || graph.shallow) && <p className="delivery-muted" role="status">Recent ancestry only{graph.shallow ? ' · shallow source' : ''}. Dashed edges continue beyond the loaded history.</p>}
  </>;
}

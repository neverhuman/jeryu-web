import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { ExternalWorkSnapshot } from '../../api/types';
import { absoluteText, relativeText } from '../../format/when';
import { LIST_OPEN_PROP, listRowProps, useListKeys } from '../../hooks/useListKeys';
import { todoHref } from '../shift/workPaths';
import { currentExternalBranches, EXTERNAL_STATE_LABELS, snapshotIsStale } from './externalWorkModel';

import './ExternalWork.css';

export function ExternalBranches({ snapshot }: { snapshot: ExternalWorkSnapshot }): JSX.Element {
  const rows = useListKeys<HTMLElement>();
  const [all, setAll] = useState(false);
  const current = currentExternalBranches(snapshot);
  const branches = all ? snapshot.branches : current;
  return <section className="external-work" aria-label={`External branches for ${snapshot.family}`} ref={rows} data-testid="external-branches">
    <header className="external-work__header"><div>
      <h2>{snapshot.source_repo} · {snapshot.provider} origin</h2>
      <p>{current.length} open or unreviewed branches · {snapshot.branches.length} origin branches observed</p>
    </div><time dateTime={snapshot.branch_observed_at} title={absoluteText(snapshot.branch_observed_at)}>
      Observed {relativeText(snapshot.branch_observed_at)}{snapshotIsStale(snapshot.branch_observed_at) ? ' · refresh needed' : ''}
    </time></header>
    <p>Branch heads and pull requests come from <a href={snapshot.source_url} target="_blank" rel="noreferrer">{snapshot.provider}</a>. External observations do not establish forge checks or releases.</p>
    <label className="external-work__filter"><input type="checkbox" checked={all} onChange={(event) => setAll(event.target.checked)} /> Include merged and closed branches</label>
    {branches.length ? <div className="table-scroll"><table className="external-work__table" aria-label="External origin branches">
      <thead><tr><th scope="col">Branch</th><th scope="col">Head</th><th scope="col">State</th><th scope="col">Compared with {snapshot.default_branch}</th><th scope="col">Todo / pull request</th></tr></thead>
      <tbody>{branches.map((branch) => <tr key={branch.name} {...listRowProps} data-list-key={branch.name}>
        <td><a {...LIST_OPEN_PROP} href={branch.url} target="_blank" rel="noreferrer">{branch.name}</a></td>
        <td><code title={branch.head_sha}>{branch.head_sha.slice(0, 12)}</code></td>
        <td>{EXTERNAL_STATE_LABELS[branch.state] ?? branch.state}</td>
        <td>{branch.ahead_by === null ? 'Unknown' : `${branch.ahead_by} ahead · ${branch.behind_by ?? '?'} behind`}</td>
        <td>{branch.task_id ? <div><Link to={todoHref(branch.task_id, snapshot.family)}>{snapshot.tasks.find((task) => task.todo_id === branch.task_id)?.task_id ?? branch.task_id}</Link></div> : null}
          {branch.pull_request ? <a href={branch.pull_request.url} target="_blank" rel="noreferrer">#{branch.pull_request.number} · {branch.pull_request.state.toLowerCase()}</a> : 'No pull request observed'}</td>
      </tr>)}</tbody>
    </table></div> : <p>No open or unreviewed origin branches in this snapshot.</p>}
    <p>Squash-merged branches can still compare ahead of main. Their pull request state is shown separately.</p>
    {snapshot.problems.length > 0 ? <p role="status">Observation gaps: {snapshot.problems.join('; ')}</p> : null}
  </section>;
}

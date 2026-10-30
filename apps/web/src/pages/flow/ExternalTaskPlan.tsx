import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { ExternalPlanTask, ExternalWorkSnapshot } from '../../api/types';
import { absoluteText, relativeText } from '../../format/when';
import { LIST_OPEN_PROP, listRowProps, useListKeys } from '../../hooks/useListKeys';
import { todoHref } from '../shift/workPaths';
import { EXTERNAL_STATE_LABELS, orderedPlanTasks, snapshotIsStale } from './externalWorkModel';

import './ExternalWork.css';

export function ExternalTaskPlan({ snapshot }: { snapshot: ExternalWorkSnapshot }): JSX.Element {
  const rows = useListKeys<HTMLElement>();
  const [onlyHuman, setOnlyHuman] = useState(false);
  const human = snapshot.tasks.filter((task) => task.state === 'needs_human').length;
  const waiting = snapshot.tasks.filter((task) => task.state === 'waiting_dependency').length;
  const merged = snapshot.tasks.filter((task) => task.merged).length;
  const names = new Map(snapshot.tasks.map((task) => [task.todo_id, task.task_id]));
  return (
    <section className="external-work" aria-label={`Execution plan for ${snapshot.family}`} ref={rows} data-testid="external-task-plan">
      <header className="external-work__header">
        <div><h2>{snapshot.family} · Execution plan</h2>
          <p>{snapshot.tasks.length} todos · {merged} merged · {human} need a person · {waiting} waiting on prerequisites</p>
        </div>
        <time dateTime={snapshot.task_observed_at} title={absoluteText(snapshot.task_observed_at)}>
          Observed {relativeText(snapshot.task_observed_at)}{snapshotIsStale(snapshot.task_observed_at) ? ' · refresh needed' : ''}
        </time>
      </header>
      <p>Waves preserve execution order. Milestones have separate exit criteria; merged work does not establish qualification.</p>
      <p><small title={absoluteText(snapshot.branch_observed_at)}>Origin pull requests observed {relativeText(snapshot.branch_observed_at)}.</small></p>
      <label className="external-work__filter"><input type="checkbox" checked={onlyHuman} onChange={(event) => setOnlyHuman(event.target.checked)} /> Only needs human</label>
      {snapshot.phases.map((phase) => {
        const members = snapshot.tasks.filter((task) => task.phase_id === phase.id);
        if (members.length === 0) return null;
        const visible = onlyHuman ? members.filter((task) => task.state === 'needs_human') : members;
        if (visible.length === 0) return null;
        return <details className="external-work__phase" key={phase.id} open={phase.id === 'W0' || onlyHuman}>
          <summary><strong>{phase.label}</strong><span>{members.filter((task) => task.merged).length}/{members.length} merged</span></summary>
          <p>{phase.description}</p>
          <div className="table-scroll"><table className="external-work__table" aria-label={`${phase.label} todos`}>
            <thead><tr><th scope="col">Todo</th><th scope="col">State</th><th scope="col">What it waits on</th><th scope="col">Pull request</th></tr></thead>
            <tbody>{orderedPlanTasks(visible).map(({ task, depth }) => <PlanRow key={task.todo_id} task={task} depth={depth} family={snapshot.family} names={names} />)}</tbody>
          </table></div>
        </details>;
      })}
      <details className="external-work__milestones"><summary>Milestones and exit criteria</summary>
        <ul>{snapshot.milestones.map((milestone) => {
          const members = snapshot.tasks.filter((task) => milestone.task_ids.includes(task.todo_id));
          return <li key={milestone.id}><strong>{milestone.id} · {milestone.label}</strong> — {members.filter((task) => task.merged).length}/{members.length} linked todos merged; exit criteria unassessed</li>;
        })}</ul>
      </details>
      {snapshot.problems.length > 0 ? <p role="status">Observation gaps: {snapshot.problems.join('; ')}</p> : null}
    </section>
  );
}

function PlanRow({ task, depth, family, names }: { task: ExternalPlanTask; depth: number; family: string; names: Map<string, string> }): JSX.Element {
  const held = task.state === 'needs_human' || task.state === 'blocked';
  return <tr {...listRowProps} data-list-key={task.todo_id} className={held ? 'external-work__held' : undefined}>
    <td className={depth > 0 ? 'external-work__followup' : undefined}>
      <Link {...LIST_OPEN_PROP} to={todoHref(task.todo_id, family)}>{depth > 0 ? '↳ ' : ''}{task.task_id}</Link>
      {task.critical_path ? <span title="Critical path"> ★</span> : null}
      <div>{task.title.replace(/^\[[^\]]+\]\s*/, '')}</div>
      {task.parent_id ? <small>Follow-up of <Link to={todoHref(task.parent_id, family)}>{names.get(task.parent_id) ?? task.parent_id}</Link></small> : null}
    </td>
    <td><strong>{EXTERNAL_STATE_LABELS[task.state] ?? task.state}</strong></td>
    <td>{task.reason}<div>{task.pending_dependencies.map((id, index) => <span key={id}>{index > 0 ? ', ' : ''}<Link to={todoHref(id, family)}>{names.get(id) ?? id}</Link></span>)}</div></td>
    <td>{task.pull_requests.length ? task.pull_requests.map((pr) => <div key={pr.url}><a href={pr.url} target="_blank" rel="noreferrer">#{pr.number}</a> · {pr.state.toLowerCase()}</div>) : '—'}</td>
  </tr>;
}

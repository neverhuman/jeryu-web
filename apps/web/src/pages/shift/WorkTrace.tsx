// WorkTrace.tsx — the stage rail: twelve stages with one of them current.
//
// Shown on a todo's own page and on a pull request page, from the same
// `workTraceModel` facts, so both read the same position for the same change.
// The rail is a list, not a picture: a screen reader gets the position from the
// label ("stage 4 of 12: Worked") and each stage says where it stands.

import { Link } from 'react-router-dom';

import type { WorkStage, WorkStageKey } from './workTraceModel';
import { workTraceSummary } from './workTraceModel';

import './Shift.css';

const STATE_WORD: Record<WorkStage['state'], string> = {
  done: 'done',
  current: 'now',
  pending: 'not yet',
};

export function WorkTrace({
  stages,
  subject,
  hrefs = {},
  testId = 'work-trace',
}: {
  stages: WorkStage[];
  /** What the rail is about, for its accessible name: a todo id, `acme/web#7`. */
  subject: string;
  /** In-app pages behind a stage, where one exists: the PR the work is on. */
  hrefs?: Partial<Record<WorkStageKey, string>>;
  testId?: string;
}): JSX.Element {
  return (
    <ol
      className="work-trace"
      aria-label={`Work trace of ${subject}: ${workTraceSummary(stages)}`}
      data-testid={testId}
    >
      {stages.map((stage) => (
        <li
          key={stage.key}
          className={`work-trace__stage is-${stage.state}${
            stage.needsHuman ? ' needs-human' : ''
          }`}
          data-testid={`work-trace-stage-${stage.key}`}
          data-state={stage.state}
          aria-current={stage.state === 'current' ? 'step' : undefined}
        >
          {hrefs[stage.key] ? (
            <Link className="work-trace__label" to={hrefs[stage.key] ?? ''}>
              {stage.label}
            </Link>
          ) : (
            <span className="work-trace__label">{stage.label}</span>
          )}
          <span className="sr-only"> {STATE_WORD[stage.state]}</span>
        </li>
      ))}
    </ol>
  );
}

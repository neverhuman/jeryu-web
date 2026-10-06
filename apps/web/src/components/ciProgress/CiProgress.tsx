// CiProgress.tsx — a running gate or review: a bar with words.
//
// With an estimate the bar fills toward the usual time and the words say
// about how long is left; past the usual time the bar stays full and turns
// amber ("2m longer than usual"), and past nearly every recent pass it turns
// red ("much slower than usual"). With no estimate yet the bar shimmers and
// the words give elapsed time only. Reduced motion stills the shimmer and the
// fill (app.css); the words carry everything on their own.

import { ciProgress, usableEstimate, type DurationEstimate } from './ciProgressModel';

import './ciProgress.css';

export interface CiProgressProps {
  /** RFC3339 start of the pass, on the forge's clock. */
  startedAt: string;
  estimate?: Partial<DurationEstimate> | null;
  /** The forge's "now" (see useServerNow). */
  nowMs: number;
  /**
   * `bar` puts the words under the bar; `inline` sits in a line of text;
   * `compact` is a short bar and the headline, with the rest in its tooltip.
   */
  variant?: 'bar' | 'inline' | 'compact';
  testId?: string;
}

export function CiProgress({
  startedAt,
  estimate,
  nowMs,
  variant = 'bar',
  testId
}: CiProgressProps): JSX.Element | null {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return null;
  const progress = ciProgress(started, nowMs, usableEstimate(estimate));
  const percent = progress.fraction === null ? null : Math.round(progress.fraction * 100);
  return (
    <span
      className={`ci-progress ci-progress--${variant} ci-progress--${progress.phase}`}
      data-testid={testId}
      data-phase={progress.phase}
      title={variant === 'compact' ? `Gate running: ${progress.label}` : undefined}
    >
      <span
        className="ci-progress__track"
        role="progressbar"
        aria-label="Time left in this run"
        aria-valuemin={percent === null ? undefined : 0}
        aria-valuemax={percent === null ? undefined : 100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={progress.label}
      >
        <span
          className="ci-progress__fill"
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </span>
      <span className="ci-progress__words">
        <span className="ci-progress__headline">{progress.headline}</span>
        {variant === 'compact' ? null : (
          <span className="ci-progress__detail">{progress.detail}</span>
        )}
      </span>
    </span>
  );
}

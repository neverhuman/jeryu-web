// ciProgressModel.ts — what a running gate or review should say about itself.
//
// The forge sends when a pass started and, once three passes of the same
// recipe on the same repository have finished, how long they usually take
// (`typicalSeconds`, the median) and how long a slow one takes
// (`slowSeconds`, the 90th percentile). From those and the clock this says
// one of four things:
//
//   measuring  no estimate yet           "4m 10s so far"
//   on-track   inside the usual time     "about 3m left"
//   over       past usual, not past slow "2m longer than usual"
//   slow       past nearly every pass    "much slower than usual"
//
// Estimates are given in whole minutes, rounded up: a precise countdown that
// misses teaches the reader to ignore it. Elapsed time is exact.

import { durationWords, minutesWords } from '../../format/duration';

export interface DurationEstimate {
  typicalSeconds: number;
  slowSeconds: number;
  samples: number;
}

export type CiProgressPhase = 'measuring' | 'on-track' | 'over' | 'slow';

export interface CiProgressView {
  phase: CiProgressPhase;
  elapsedSeconds: number;
  /** How full the bar is, 0 to 1; null while there is no estimate to measure against. */
  fraction: number | null;
  /** The short line: "about 3m left". */
  headline: string;
  /** The context under it: "4m 10s so far · usually 7m". */
  detail: string;
  /** Both, as one sentence for assistive technology. */
  label: string;
}

/** A usable estimate, or null for an absent, empty or nonsensical one. */
export function usableEstimate(
  estimate: Partial<DurationEstimate> | null | undefined
): DurationEstimate | null {
  if (!estimate) return null;
  const { typicalSeconds, slowSeconds, samples } = estimate;
  if (
    typeof typicalSeconds !== 'number' ||
    typeof slowSeconds !== 'number' ||
    !(typicalSeconds > 0) ||
    !(slowSeconds >= typicalSeconds)
  ) {
    return null;
  }
  return { typicalSeconds, slowSeconds, samples: samples ?? 0 };
}

export function ciProgress(
  startedAtMs: number,
  nowMs: number,
  estimate: DurationEstimate | null
): CiProgressView {
  const elapsedSeconds = Math.max(0, (nowMs - startedAtMs) / 1000);
  const soFar = `${durationWords(elapsedSeconds)} so far`;
  if (!estimate) {
    return view('measuring', elapsedSeconds, null, soFar, 'no estimate yet');
  }
  const { typicalSeconds, slowSeconds } = estimate;
  const usually = `usually ${minutesWords(typicalSeconds)}`;
  if (elapsedSeconds < typicalSeconds) {
    const left = typicalSeconds - elapsedSeconds;
    const headline = left < 60 ? 'under a minute left' : `about ${minutesWords(left)} left`;
    return view(
      'on-track',
      elapsedSeconds,
      elapsedSeconds / typicalSeconds,
      headline,
      `${soFar} · ${usually}`
    );
  }
  if (elapsedSeconds < slowThreshold(estimate)) {
    return view(
      'over',
      elapsedSeconds,
      1,
      `${minutesWords(elapsedSeconds - typicalSeconds)} longer than usual`,
      `${soFar} · ${usually}`
    );
  }
  return view(
    'slow',
    elapsedSeconds,
    1,
    'much slower than usual',
    `${soFar} · ${usually}, slow ones ${minutesWords(slowSeconds)}`
  );
}

/**
 * When a pass stops being merely over and becomes slow: past the slow figure,
 * and at least half again the usual time, so a recipe whose passes all take
 * about the same is not called slow seconds after it runs over.
 */
function slowThreshold({ typicalSeconds, slowSeconds }: DurationEstimate): number {
  return Math.max(slowSeconds, typicalSeconds * 1.5);
}

function view(
  phase: CiProgressPhase,
  elapsedSeconds: number,
  fraction: number | null,
  headline: string,
  detail: string
): CiProgressView {
  return {
    phase,
    elapsedSeconds,
    fraction: fraction === null ? null : Math.min(1, Math.max(0, fraction)),
    headline,
    detail,
    label: `${headline}, ${detail}`
  };
}

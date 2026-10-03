// tone.ts — the one place a state turns into a colour.
//
// Colour on this site carries one promise: red means a person is needed.
// Everything else a pipeline does — a gate that fell over, a score under its
// threshold, a mirror push that did not land — an agent picks up on its own,
// so it is told apart by an orange outline rather than by red. The five tones:
//
//   * `human`   — nothing moves until a person acts (red).
//   * `failed`  — something went wrong and the pipeline owns it (orange outline).
//   * `warn`    — in flight, shaky, or worth a look (amber).
//   * `ok`      — finished clean (green).
//   * `unknown` — nothing is known yet (neutral, never a colour).
//
// A call site names its tone and asks for a class; the modifier is always
// `<block>--<tone>`, so the CSS of each block carries at most these five.

import './tone.css';

export type Tone = 'human' | 'failed' | 'warn' | 'ok' | 'unknown';

/** Every tone, in order of how much it asks of the reader. */
export const TONES: readonly Tone[] = ['human', 'failed', 'warn', 'ok', 'unknown'] as const;

/** The block and its tone modifier: `activity-row activity-row--failed`. */
export function toneClass(block: string, tone: Tone): string {
  return `${block} ${block}--${tone}`;
}

/** The tone modifier alone, for a block whose base class is already there. */
export function toneModifier(block: string, tone: Tone): string {
  return `${block}--${tone}`;
}

/** `page__pill` and its tone. The unknown tone is the plain pill. */
export function pillClass(tone: Tone): string {
  if (tone === 'unknown') return 'page__pill';
  if (tone === 'warn') return 'page__pill page__pill--warning';
  if (tone === 'ok') return 'page__pill page__pill--success';
  return toneClass('page__pill', tone);
}

/** A score against the threshold it has to clear. No score is not a failure. */
export function scoreTone(score: number | null | undefined, threshold: number): Tone {
  if (score === null || score === undefined || !Number.isFinite(score)) return 'unknown';
  return score >= threshold ? 'ok' : 'failed';
}

/** Whether a tone is the one red is reserved for. */
export function needsHumanTone(tone: Tone): boolean {
  return tone === 'human';
}

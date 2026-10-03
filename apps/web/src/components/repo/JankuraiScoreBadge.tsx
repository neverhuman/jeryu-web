// JankuraiScoreBadge.tsx — jankurai audit score pill for repo surfaces.
//
// The backend ships the newest default-branch audit on `RepositorySummary`
// (`jankurai_score` / `jankurai_decision` / `jankurai_scored_at`, all
// TS-optional). The pill points at problems, so a passing score is muted
// and everything needing action is coloured. Four states:
//   * score >= 85           → ok (muted, nothing to do)
//   * score <  85           → failed (the gate's own problem, not a person's)
//   * no score + a decision → "audit failed" in the same tone (the tool ran
//                              but could not score the tree, e.g. `tool-failed`)
//   * no score, no decision → unknown pill reading "--" (no audit ingested
//                              yet); the dash keeps the column aligned with
//                              scored rows while title/aria-label say
//                              "no score"
//
// The title/aria-label carry the numeric score plus a relative "scored
// <when>" so the pill stays compact while hover/AT get the full context.

import { Gauge } from 'lucide-react';

import { relativeText } from '../../format/when';
import { scoreTone, toneClass, type Tone } from '../tone/tone';
import './repo.css';

/** Stand-in for the number on unscored rows, so the pill stays the same shape. */
const NO_SCORE_TEXT = '--';

/** Scores at or above this are rendered muted, as needing no action. */
export const JANKURAI_GOOD_THRESHOLD = 85;

export interface JankuraiScoreBadgeProps {
  score?: number | null;
  decision?: string | null;
  scoredAt?: string | null;
}



function scoredSuffix(scoredAt: string | null | undefined): string {
  return scoredAt ? ` · scored ${relativeText(scoredAt)}` : '';
}

function resolve(
  score: number | null | undefined,
  decision: string | null | undefined,
  scoredAt: string | null | undefined
): { tone: Tone; text: string; detail: string } {
  if (score === null || score === undefined) {
    if (decision !== null && decision !== undefined) {
      return {
        tone: 'failed',
        text: 'audit failed',
        detail: `jankurai audit failed (${decision})${scoredSuffix(scoredAt)}`,
      };
    }
    return {
      tone: 'unknown',
      text: NO_SCORE_TEXT,
      detail: 'no score · no jankurai audit recorded for this repository.',
    };
  }
  return {
    tone: scoreTone(score, JANKURAI_GOOD_THRESHOLD),
    text: String(score),
    detail: `jankurai score ${score}${scoredSuffix(scoredAt)}`,
  };
}

export function JankuraiScoreBadge({
  score,
  decision,
  scoredAt,
}: JankuraiScoreBadgeProps): JSX.Element {
  const { tone, text, detail } = resolve(score, decision, scoredAt);
  return (
    <span
      className={toneClass('repo-score-badge', tone)}
      role="status"
      title={detail}
      aria-label={detail}
    >
      <Gauge size={12} aria-hidden="true" />
      {text}
    </span>
  );
}

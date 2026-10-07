// sourceModel.ts — which tool reported a row, as a mark the eye can sort by.
//
// Every event names its reporter in `source`, and until now that name only
// appeared in the facts under an opened row. On a feed that mixes an agent
// finishing a todo, a gate failing and a release going out, the words alone
// read the same; a small icon in front of the label pill does not. So each
// known source gets one icon and one group — the agents doing the work, the
// gates judging it, the steps that ship it — and the group is what carries the
// colour, so three glances separate three kinds of row rather than seven.
//
// A source this table does not know still gets a mark, a neutral one: the rows
// stay aligned and a new reporter is visible the day it starts reporting,
// without anyone having to name it here first.

import {
  CircleDot,
  Hammer,
  ListChecks,
  PackageCheck,
  Pin,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

/** What a source does, which is what the mark is coloured by. */
export type SourceGroup = 'agent' | 'gate' | 'release' | 'forge' | 'other';

export interface SourceMark {
  /** The icon to draw before the label pill. */
  Icon: LucideIcon;
  /** What the group is called: the colour, and what a test can read. */
  group: SourceGroup;
  /** The whole mark in words, for `title` and `aria-label`. */
  title: string;
}

const MARKS: Record<string, { Icon: LucideIcon; group: SourceGroup }> = {
  todoq: { Icon: ListChecks, group: 'agent' },
  'pr-gate': { Icon: ShieldCheck, group: 'gate' },
  'pr-redteam': { Icon: ShieldAlert, group: 'gate' },
  'auto-stage': { Icon: PackageCheck, group: 'release' },
  'auto-pin': { Icon: Pin, group: 'release' },
  deploy: { Icon: Rocket, group: 'release' },
  forge: { Icon: Hammer, group: 'forge' },
};

/** Every source this table knows, in one list: what the Source filter can
 *  suggest, so a reader does not have to guess the reporter's name. */
export const KNOWN_SOURCES: readonly string[] = Object.keys(MARKS).sort();

/**
 * The mark for one `event.source`. The name is said in the title exactly as
 * the event gave it: the icon is the shortcut, the name is the answer. The
 * wording stays short and starts with "Source", so the mark's accessible name
 * cannot be mistaken for one of the page's filter fields.
 */
export function sourceMark(source: string): SourceMark {
  const name = source.trim();
  const known = MARKS[name];
  return {
    Icon: known?.Icon ?? CircleDot,
    group: known?.group ?? 'other',
    title: `Source: ${name || 'unnamed'}`,
  };
}

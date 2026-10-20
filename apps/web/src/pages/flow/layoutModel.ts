// layoutModel.ts — what Flow's Layout mode decides, kept pure so it is tested
// without a browser: each station's runners in words, reporting capacity
// against the capacity the site expects, and the card's tone.
//
// A station with no reporting tool, or fewer than expected, is red: a person
// has to restore it. A runner whose last beat failed is the pipeline's to
// repair (orange outline). Expected capacity is site configuration; when it is
// not set the page says so and never invents a number.

import type { FlowLayout, FlowLayoutStation, FlowLayoutTool, FlowReport } from '../../api/types';
import type { Tone } from '../../components/tone/tone';
import { relativeText } from '../../format/when';

export interface LayoutToolRow {
  runnerId: string;
  host: string;
  online: boolean;
  busy: boolean;
  /** `online · busy`, `offline · idle`. */
  state: string;
  lastSeen: string;
  code: string;
  failing: boolean;
  failureReason: string | null;
}

export interface LayoutCard {
  id: string;
  label: string;
  tone: Tone;
  tools: LayoutToolRow[];
  /** `2 of 4 expected reporting`, `1 reporting, expected capacity not set`. */
  capacity: string;
  /** Why the card is red or orange, in words; empty when nothing is wrong. */
  problems: string[];
}

/** The code a runner reports: version first, else a short commit, else none. */
export function codeWords(tool: FlowLayoutTool): string {
  const code = tool.code;
  if (!code) return 'code unknown';
  const commit = code.commit ? code.commit.slice(0, 7) : '';
  if (code.version && commit) return `${code.version} (${commit})`;
  return code.version || commit || 'code unknown';
}

export function toolRow(tool: FlowLayoutTool, now: Date): LayoutToolRow {
  const online = tool.online === 'online';
  const busy = tool.load === 'busy';
  return {
    runnerId: tool.runnerId,
    host: tool.host || 'unknown host',
    online,
    busy,
    state: `${online ? 'online' : 'offline'} · ${busy ? 'busy' : 'idle'}`,
    lastSeen: relativeText(tool.lastSeen, now),
    code: codeWords(tool),
    failing: tool.failing === true,
    failureReason: tool.failing ? (tool.failureReason ?? 'its last run failed') : null,
  };
}

/** Reporting tools against expected capacity, in one phrase. */
export function layoutCapacityWords(station: FlowLayoutStation): string {
  const reporting =
    station.capacity?.reporting ?? station.tools.filter((tool) => tool.online === 'online').length;
  const expected = station.capacity?.expected;
  if (typeof expected !== 'number') {
    return `${reporting} reporting, expected capacity not set`;
  }
  return `${reporting} of ${expected} expected reporting`;
}

const PROBLEM_WORDS: Record<string, string> = {
  no_reporting_tool: 'No tool is reporting for this station.',
  fewer_than_expected: 'Fewer tools are reporting than the site expects.',
  tool_failing: 'A tool’s last run failed.',
  expected_capacity_invalid: 'The expected capacity setting is not a number.',
};

/**
 * The warnings the server raised, or, for a server that sends none, the same
 * two the page can read off the numbers (nothing reporting, fewer than expected).
 */
function warningKeys(station: FlowLayoutStation): Set<string> {
  const online = station.tools.filter((tool) => tool.online === 'online').length;
  const reporting = station.capacity?.reporting ?? online;
  const warnings = new Set(station.warnings ?? []);
  if (reporting === 0) warnings.add('no_reporting_tool');
  const expected = station.capacity?.expected;
  if (typeof expected === 'number' && reporting < expected) warnings.add('fewer_than_expected');
  return warnings;
}

export function layoutProblems(station: FlowLayoutStation): string[] {
  return [...warningKeys(station)].map((warning) => PROBLEM_WORDS[warning] ?? warning);
}

export function layoutTone(station: FlowLayoutStation): Tone {
  const warnings = warningKeys(station);
  if (warnings.has('no_reporting_tool') || warnings.has('fewer_than_expected')) return 'human';
  if (warnings.has('tool_failing')) return 'failed';
  return station.tools.length > 0 ? 'ok' : 'unknown';
}

/** One card per station in route order; the live report supplies names and order. */
export function layoutCards(layout: FlowLayout, report: FlowReport | undefined, now: Date): LayoutCard[] {
  const known = new Map((report?.stations ?? []).map((station) => [station.id, station]));
  return layout.stations
    .map((station, index) => ({ station, order: station.order ?? known.get(station.id)?.order ?? index + 1 }))
    .sort((a, b) => a.order - b.order)
    .map(({ station }) => ({
      id: station.id,
      label: station.label ?? known.get(station.id)?.label ?? station.id,
      tone: layoutTone(station),
      tools: station.tools.map((tool) => toolRow(tool, now)),
      capacity: layoutCapacityWords(station),
      problems: layoutProblems(station),
    }));
}

/** Stations that need a person: nothing reporting, or fewer than expected. */
export function redStations(cards: LayoutCard[]): LayoutCard[] {
  return cards.filter((card) => card.tone === 'human');
}

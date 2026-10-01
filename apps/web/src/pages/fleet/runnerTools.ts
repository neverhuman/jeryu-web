// fleet/runnerTools.ts — what EVALUATES a pull request on a runner, as opposed
// to the runner's own scripts (its `code`). A runner may report `tools`: the
// scorer and the scanners it runs a gate with. The scorer is jankurai; a gate
// host can carry two copies of it, the governed binary that repositories pin
// (`jankurai@governed`) and whatever `jankurai` is first on PATH. The governed
// one is what scores, so it is named first; the PATH copy is shown only when
// it is a different build, because then a check run by hand would disagree.
//
// Everything here is pure; the rows and the header line read their words from it.

import type { RunnerTool } from '../../api/types';

/** The name a runner gives the scorer on its PATH. */
export const SCORER = 'jankurai';

/** The name a runner gives the governed scorer that repositories pin. */
export const GOVERNED_SCORER = `${SCORER}@governed`;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A runner's tools, keeping each well-formed entry once. Absent or not a list
 * reads as none; an entry without a name is dropped, not guessed at.
 */
export function toolsFromRaw(value: unknown): RunnerTool[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tools: RunnerTool[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const name = text(record?.name);
    if (!record || !name || seen.has(name)) continue;
    seen.add(name);
    const tool: RunnerTool = { name };
    const version = text(record.version);
    const sha256 = text(record.sha256).toLowerCase();
    if (version) tool.version = version;
    if (sha256) tool.sha256 = sha256;
    tools.push(tool);
  }
  return tools;
}

/** The seven hex characters people read aloud. */
export function shortHash(sha: string): string {
  return sha.slice(0, 7);
}

/** "1.6.11 (b05c03b)", "1.6.11", "(b05c03b)", or "" when the tool says neither. */
export function buildWords(tool: RunnerTool): string {
  const hash = tool.sha256 ? `(${shortHash(tool.sha256)})` : '';
  return [tool.version ?? '', hash].filter(Boolean).join(' ');
}

/** What identifies one build of a tool: its hash, else its version. */
function buildKey(tool: RunnerTool): string {
  return tool.sha256 ?? (tool.version ? `v ${tool.version}` : '');
}

/** The scorer a runner scores with: the governed copy when it has one. */
export function scorerOf(tools: readonly RunnerTool[]): RunnerTool | null {
  return (
    tools.find((tool) => tool.name === GOVERNED_SCORER) ??
    tools.find((tool) => tool.name === SCORER) ??
    null
  );
}

export interface EvaluatesLine {
  /** "jankurai (governed)" or "jankurai"; null when no scorer is reported. */
  scorer: string | null;
  /** "1.6.11 (b05c03b)" of the scorer. */
  scorerBuild: string;
  /** The PATH copy's build when it is not the governed build; else null. */
  pathCopy: string | null;
  /** Tools other than the scorer. */
  others: number;
}

/** What a runner evaluates with, for the line under its code; null when it reports no tools. */
export function evaluatesLine(tools: readonly RunnerTool[]): EvaluatesLine | null {
  if (tools.length === 0) return null;
  const governed = tools.find((tool) => tool.name === GOVERNED_SCORER) ?? null;
  const onPath = tools.find((tool) => tool.name === SCORER) ?? null;
  const scorer = governed ?? onPath;
  const others = tools.filter(
    (tool) => tool.name !== GOVERNED_SCORER && tool.name !== SCORER
  ).length;
  const pathDiffers =
    governed !== null &&
    onPath !== null &&
    buildKey(governed) !== '' &&
    buildKey(onPath) !== '' &&
    buildKey(governed) !== buildKey(onPath);
  return {
    scorer: scorer ? (governed ? `${SCORER} (governed)` : SCORER) : null,
    scorerBuild: scorer ? buildWords(scorer) : '',
    pathCopy: pathDiffers && onPath ? buildWords(onPath) : null,
    others,
  };
}

/** "+8 tools", "+1 tool", or "" for none. */
export function otherToolsWords(count: number): string {
  if (count <= 0) return '';
  return `+${count} tool${count === 1 ? '' : 's'}`;
}

/**
 * Runners whose scorer build differs from the one most runners in the list
 * use. Only a clear majority counts, as for a runner's own code: two runners
 * on two builds mark neither.
 */
export function scorerOutliers(
  nodes: readonly { runnerId: string; tools?: readonly RunnerTool[] }[]
): Set<string> {
  const keyed = nodes.flatMap((node) => {
    const scorer = scorerOf(node.tools ?? []);
    const key = scorer ? buildKey(scorer) : '';
    return key ? [{ id: node.runnerId, key }] : [];
  });
  const counts = new Map<string, number>();
  for (const { key } of keyed) counts.set(key, (counts.get(key) ?? 0) + 1);
  const outliers = new Set<string>();
  if (counts.size < 2) return outliers;
  const [top, next] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!top || !next || top[1] === next[1]) return outliers;
  for (const { id, key } of keyed) if (key !== top[0]) outliers.add(id);
  return outliers;
}

export interface ScorerSummary {
  text: string;
  /** True when the gates score with more than one build. */
  mixed: boolean;
}

/**
 * The header's line about what scores the gates: "Gates evaluate with
 * jankurai 1.6.11 (b05c03b)", or "Gates evaluate with 2 jankurai builds:
 * b05c03b ×4, 9e6b885 ×2". Null when no gate reports a scorer.
 */
export function scorerSummary(
  nodes: readonly { tools?: readonly RunnerTool[] }[]
): ScorerSummary | null {
  const builds = new Map<string, { tool: RunnerTool; count: number }>();
  for (const node of nodes) {
    const scorer = scorerOf(node.tools ?? []);
    if (!scorer) continue;
    const key = buildKey(scorer) || 'unknown';
    const entry = builds.get(key);
    if (entry) entry.count += 1;
    else builds.set(key, { tool: scorer, count: 1 });
  }
  if (builds.size === 0) return null;
  const ranked = [...builds.values()].sort((a, b) => b.count - a.count);
  const [only] = ranked;
  if (ranked.length === 1 && only) {
    const words = buildWords(only.tool);
    return {
      text: `Gates evaluate with ${SCORER}${words ? ` ${words}` : ''}`,
      mixed: false,
    };
  }
  const parts = ranked.map(({ tool, count }) => {
    const label = tool.sha256 ? shortHash(tool.sha256) : (tool.version ?? 'unknown build');
    return `${label} ×${count}`;
  });
  return {
    text: `Gates evaluate with ${ranked.length} ${SCORER} builds: ${parts.join(', ')}`,
    mixed: true,
  };
}

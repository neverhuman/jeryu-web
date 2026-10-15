// agentBotModel.ts — the seeded look of an agent's robot avatar.
//
// Pure. Harness picks the silhouette and brand color, the agent's type picks
// its gear, its id seeds every personality trait, and its status picks the
// motion. The same inputs always give the same bot, so a bot never changes
// unless its variant is bumped. AgentBot.tsx draws what this decides.
//
// Design reference: apps/web/design/agent-avatars-v4/README.md.

import type { AgentPresenceItem, PresenceSource, PresenceState } from '../../api/agentPresence';

export type BotHarness = 'Claude' | 'Codex' | 'Agy' | 'GPT' | 'Gemini';
export type BotStatus = 'working' | 'thinking' | 'idle' | 'error' | 'done';
export type BotType = 'worker' | 'adhoc';
export type HeadShape = 'capsule' | 'box' | 'orb' | 'dome' | 'hex';
export type BodyShape = 'capsule' | 'box' | 'orb' | 'bell' | 'slim';
export type Locomotion = 'legs' | 'treads' | 'hover' | 'wheel' | 'stilts';

export interface BotAgent {
  /** Seeds the personality; a presence id or any stable agent id. */
  id: string;
  /** Harness name as reported (`claude-code`, `codex`, `cursor`, …). */
  harness: string;
  type: BotType;
  status: BotStatus;
  /** Bump to reroll the look while keeping the id. */
  variant?: number;
}

export interface Archetype {
  label: string;
  head: HeadShape;
  body: BodyShape;
  loco: Locomotion;
  earX: readonly [number, number];
}

export const HARNESSES: readonly BotHarness[] = ['Claude', 'Codex', 'Agy', 'GPT', 'Gemini'];

export const ARCHETYPES: Record<BotHarness, Archetype> = {
  Claude: { label: 'Capsule', head: 'capsule', body: 'capsule', loco: 'legs', earX: [30, 90] },
  Codex: { label: 'Block', head: 'box', body: 'box', loco: 'treads', earX: [28, 92] },
  Agy: { label: 'Orb', head: 'orb', body: 'orb', loco: 'hover', earX: [28, 92] },
  GPT: { label: 'Dome', head: 'dome', body: 'bell', loco: 'wheel', earX: [26, 94] },
  Gemini: { label: 'Prism', head: 'hex', body: 'slim', loco: 'stilts', earX: [31, 89] },
};

/** Brand hue and saturation per harness; unknown harnesses get a stable hashed hue. */
const BRAND: Partial<Record<BotHarness, { h: number; s: number }>> = {
  Claude: { h: 15, s: 63 },
  GPT: { h: 165, s: 82 },
  Codex: { h: 165, s: 82 },
  Gemini: { h: 222, s: 82 },
};

/** Reported harness names that belong to a known archetype. */
const HARNESS_ALIASES: Record<string, BotHarness> = {
  claude: 'Claude',
  'claude-code': 'Claude',
  codex: 'Codex',
  'codex-cli': 'Codex',
  agy: 'Agy',
  gpt: 'GPT',
  chatgpt: 'GPT',
  openai: 'GPT',
  gemini: 'Gemini',
  'gemini-cli': 'Gemini',
};

/** FNV-1a, 32 bit. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A seeded mulberry32 stream in [0, 1). */
export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The known harness a reported name belongs to, or null. The name is remote
 * data, so only the alias table's own keys count: `__proto__` or
 * `constructor` must not resolve through the prototype chain.
 */
export function knownHarness(harness: string): BotHarness | null {
  const key = harness.trim().toLowerCase();
  if (Object.hasOwn(HARNESS_ALIASES, key)) return HARNESS_ALIASES[key];
  return HARNESSES.find((name) => name.toLowerCase() === key) ?? null;
}

/** Known harnesses keep their silhouette; others get a stable hashed one. */
export function archetypeOf(harness: string): Archetype {
  const known = knownHarness(harness);
  const hashed = ARCHETYPES[HARNESSES[hash(`harness:${harness}`) % HARNESSES.length]];
  return (known && ARCHETYPES[known]) || hashed;
}

export interface Palette {
  hue: number;
  known: boolean;
  shellA: string;
  shellB: string;
  shellC: string;
  accent: string;
  line: string;
  dark: string;
  glow: string;
}

export function paletteOf(harness: string): Palette {
  const known = knownHarness(harness);
  const brand = (known && BRAND[known]) || { h: hash(`brand:${harness}`) % 360, s: 72 };
  const { h, s } = brand;
  const k = s / 78;
  return {
    hue: h,
    known: Boolean(known && BRAND[known]),
    shellA: `hsl(${h},${Math.round(55 * k)}%,94%)`,
    shellB: `hsl(${h},${Math.round(32 * k)}%,76%)`,
    shellC: `hsl(${h},${Math.round(26 * k)}%,56%)`,
    accent: `hsl(${h},${s}%,58%)`,
    line: `hsl(${h},${Math.round(30 * k)}%,32%)`,
    dark: `hsl(${h},${Math.round(24 * k)}%,17%)`,
    glow: `hsl(${h},100%,74%)`,
  };
}

export interface Traits {
  /** 0–3: rounded, wide, slit, twin lenses. */
  visor: number;
  /** 0–4: dots, ovals, arcs, bars, rings. */
  eyes: number;
  /** 0–2: none, flat, smile (only under visors 0–1). */
  mouth: number;
  /** 0–4: single, twin, zigzag, hook, spike. */
  antenna: number;
  /** 0–2: round, tall, fin. */
  ear: number;
  /** 0–4: diamond, ring, bolt, lines, dots. */
  mark: number;
  /** 0–2: none, slash, stripes. */
  decal: number;
  /** 0–3: none, shoulder pad, scarf, monocle. */
  acc: number;
  /** 0 shell-colored limbs, 1 dark limbs. */
  limbs: number;
  /** 0–3: arm angles. */
  pose: number;
  /** Gaze: -5 left, 0 ahead, 5 right. */
  look: -5 | 0 | 5;
  /** Seconds the idle animations are offset by, so a fleet never moves in step. */
  delay: number;
}

const LOOKS: readonly (-5 | 0 | 5)[] = [-5, 0, 5];

/** Every personality pick, in a fixed order, from the agent's id and variant. */
export function traitsOf(agent: Pick<BotAgent, 'id' | 'variant'>): Traits {
  const r = rng(`${agent.id}:${agent.variant ?? 0}`);
  const pick = (n: number): number => Math.floor(r() * n);
  return {
    visor: pick(4),
    eyes: pick(5),
    mouth: pick(3),
    antenna: pick(5),
    ear: pick(3),
    mark: pick(5),
    decal: pick(3),
    acc: pick(4),
    limbs: pick(2),
    pose: pick(4),
    look: LOOKS[pick(3)],
    delay: Number((r() * 4).toFixed(2)),
  };
}

/** One string per distinct look, for counting unique bots. */
export function signatureOf(agent: BotAgent): string {
  const t = traitsOf(agent);
  const picks = [t.visor, t.eyes, t.mouth, t.antenna, t.ear, t.mark, t.decal, t.acc, t.limbs, t.pose, t.look];
  return [archetypeOf(agent.harness).label, paletteOf(agent.harness).hue, agent.type, ...picks].join('|');
}

const TYPE_OF_SOURCE: Record<PresenceSource, BotType> = {
  external: 'adhoc',
  agent_run: 'worker',
  queue_worker: 'worker',
  reviewer: 'worker',
  gate: 'worker',
};

const STATUS_OF_STATE: Record<PresenceState, BotStatus> = {
  active: 'working',
  idle: 'idle',
  stale: 'idle',
  ended: 'done',
};

/** The bot for a presence row: its harness, gear from its source, motion from its state. */
export function botOfPresence(item: Pick<AgentPresenceItem, 'id' | 'agent' | 'source' | 'state'>): BotAgent {
  return { id: item.id, harness: item.agent, type: TYPE_OF_SOURCE[item.source], status: STATUS_OF_STATE[item.state] };
}

export const BOT_STATUS_LABEL: Record<BotStatus, string> = {
  working: 'working',
  thinking: 'thinking',
  idle: 'idle',
  error: 'error',
  done: 'done',
};

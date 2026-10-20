// navDestinations.ts — the one list of destinations the shell knows.
//
// A destination's label, path, icon, badge and shortcut live here once. The
// left nav renders it (`LeftNav`), the command palette and `/search` offer it
// (`useShellCommands`), and the keyboard binds it (`NavShortcuts`), so a new
// page or a renamed one is a single edit instead of three that drift.
//
// A destination whose read the server allows only an administrator carries
// `adminOnly`, and then the nav, the palette and the keyboard all leave it out
// for every other role: one flag, three surfaces, no link into a refusal.
//
// Shortcut letters follow the label: `g n` Needs you, `g w` Work, `g q`
// Quality gate. `aliases` keeps a destination's earlier combo working for one
// release after the letter moved; aliases stay out of the help overlay.

import {
  Activity,
  BookOpen,
  Bot,
  Brain,
  ClipboardList,
  Flame,
  Coins,
  Cog,
  FolderGit2,
  Gauge,
  GitMerge,
  Layers,
  LifeBuoy,
  Rocket,
  Route,
  ServerCog,
  Share2,
  ShieldCheck,
  Siren,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';

import { DEPENDENCIES_PATH } from '../pages/DependenciesPage';
import { FLOW_PATH } from '../pages/flow/flowModel';
import { HELP_PATH } from '../pages/helpPath';
import { IN_FLIGHT_PATH } from '../pages/pullRoomModel';
import { NEEDS_YOU_PATH } from './HomeRedirect';
import { SESSIONS_PATH } from '../pages/SessionsPage';
import { WIKI_PATH } from '../pages/wiki/wikiModel';
import { WORK_PATH } from '../pages/shift/workPaths';
import { REPORT_INCIDENT_PATH } from '../pages/incidents/incidentModel';
import { YIELD_PATH } from '../pages/yield/yieldModel';
import { SCORECARD_PATH } from '../pages/scorecard';
import type { AttentionArea } from '../pages/needsYou/needsYouModel';

/**
 * Where a destination is rendered:
 *   `primary` — the daily nav, in the order the work flows;
 *   `wiki`    — below the primary list, only when an administrator set one;
 *   `system`  — inside the "System" disclosure: how the machinery is doing;
 *   `account` — reached from the top-right account control, not the nav.
 */
export type NavGroup = 'primary' | 'wiki' | 'system' | 'account';

export interface NavDestination {
  /** Stable id, also the id of this destination's palette command. */
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Lucide icon name for surfaces that resolve icons by name (the palette). */
  paletteIcon: string;
  /**
   * `attention`: every critical + action row from `/api/v1/attention`. An area:
   * only the rows whose cause lives on that page, so each page says what on it
   * is waiting on a person.
   */
  badge?: 'attention' | AttentionArea;
  /** The chord that goes here. Unique across the registry. */
  shortcut: string;
  /** Earlier chords, still bound, deliberately absent from the help overlay. */
  aliases?: string[];
  /** Extra words the palette and `/search` match on. */
  keywords: string[];
  /**
   * One line of "use this when…": the question this page answers, said on the
   * page itself (see `UseThisWhen`) and on Help. Every `system` destination
   * carries one — those pages are read when something is off, by somebody who
   * has to pick the right one first.
   */
  useWhen?: string;
  /** Hidden from the nav and the palette unless the viewer is an administrator. */
  adminOnly?: boolean;
  group: NavGroup;
  /** True when a longer path below this one is its own destination. */
  end?: boolean;
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  {
    id: 'nav.needs-you',
    label: 'Needs you',
    path: NEEDS_YOU_PATH,
    icon: Siren,
    paletteIcon: 'siren',
    badge: 'attention',
    shortcut: 'g n',
    aliases: ['g d'],
    keywords: ['needs you', 'attention', 'inbox', 'blocked', 'waiting', 'home', 'dashboard'],
    // `/api/v1/attention` is admin-only: another role would land on a denial.
    adminOnly: true,
    group: 'primary',
  },
  {
    id: 'nav.activity',
    label: 'Activity',
    path: '/activity',
    icon: Activity,
    paletteIcon: 'activity',
    shortcut: 'g a',
    keywords: ['activity', 'events', 'log', 'feed', 'live', 'pipeline', 'notifications', 'alerts'],
    // The pipeline event feed is admin-only, as is the dock that shows it.
    adminOnly: true,
    group: 'primary',
  },
  {
    // Where the work is on the delivery line: the stations, their waits, the
    // loops back and the one station that holds the most waiting.
    id: 'nav.flow',
    label: 'Flow',
    path: FLOW_PATH,
    icon: Route,
    paletteIcon: 'route',
    shortcut: 'g f',
    keywords: [
      'flow',
      'line',
      'station',
      'wip',
      'queue time',
      'cycle time',
      'bottleneck',
      'rework',
      'hold',
      'x-factor',
    ],
    useWhen:
      'Use this when work is slow and nobody knows where it sits: inspect the next decision, responsible service, and recorded history.',
    // `/api/v1/flow` is admin-only, like the event log it is projected from.
    adminOnly: true,
    group: 'primary',
  },
  {
    id: 'nav.work',
    label: 'Work',
    path: WORK_PATH,
    icon: ClipboardList,
    paletteIcon: 'clipboard-list',
    badge: 'work',
    shortcut: 'g w',
    keywords: [
      'work',
      'shift',
      'queue',
      'todo',
      'todoq',
      'tasks',
      'workers',
      'slots',
      'nightshift',
      'dayshift',
      'bulletshift',
    ],
    // The shift queue and its workers are admin-only reads.
    adminOnly: true,
    group: 'primary',
  },
  {
    // Every change between claimed work and release: shift work not yet a pull
    // request, open pull requests, and what waits for a release. A repository's
    // own pull requests are its Pull requests tab.
    id: 'nav.in-flight',
    label: 'In flight',
    path: IN_FLIGHT_PATH,
    icon: GitMerge,
    paletteIcon: 'git-merge',
    badge: 'pulls',
    shortcut: 'g p',
    aliases: ['g m'],
    keywords: ['in flight', 'pr', 'pull', 'merge', 'review', 'pull room', 'pull requests'],
    group: 'primary',
  },
  {
    id: 'nav.releases',
    label: 'Releases',
    path: '/releases',
    icon: Rocket,
    paletteIcon: 'rocket',
    badge: 'releases',
    shortcut: 'g l',
    keywords: [
      'release',
      'deploy',
      'production',
      'environment',
      'rollback',
      'staged',
      'unshipped',
      'pin',
    ],
    group: 'primary',
  },
  {
    id: 'nav.repos',
    label: 'Repositories',
    path: '/repos',
    icon: FolderGit2,
    paletteIcon: 'folder',
    shortcut: 'g r',
    keywords: ['repos', 'repository', 'projects'],
    group: 'primary',
  },
  {
    id: 'nav.wiki',
    label: 'Wiki',
    path: WIKI_PATH,
    icon: BookOpen,
    paletteIcon: 'book-open',
    shortcut: 'g k',
    keywords: ['wiki', 'handbook', 'docs', 'documentation', 'runbook', 'pages'],
    group: 'wiki',
  },
  {
    // The presence API is authenticated and filters scopes per reader; private
    // metadata is reporter/admin-only, so the inventory itself is not admin-only.
    id: 'nav.active-agents',
    shortcut: 'g v',
    label: 'Active agents',
    path: '/agents',
    icon: Bot,
    paletteIcon: 'bot',
    keywords: ['active agents', 'sessions', 'claude', 'codex', 'cursor', 'grok', 'agy', 'host', 'worktree'],
    useWhen: 'Use this when you need to find running agents and locate their sessions and checkouts.',
    group: 'system',
  },
  {
    id: 'nav.runners',
    label: 'Runners',
    path: '/runners',
    icon: ServerCog,
    paletteIcon: 'server-cog',
    badge: 'system',
    shortcut: 'g u',
    // `runners` is the page's name; the rest is what a reader might type for it.
    keywords: ['runners', 'workers', 'utilization', 'saturation', 'health'],
    useWhen:
      'Use this when work is queued and nothing is running: it says which pool has slots left.',
    group: 'system',
  },
  {
    id: 'nav.intelligence',
    label: 'Intelligence',
    path: '/intelligence',
    icon: Brain,
    paletteIcon: 'brain',
    shortcut: 'g i',
    keywords: ['jmcp', 'control-plane', 'priority', 'graph'],
    useWhen:
      'Use this when you want one snapshot of the whole forge: what it knows, and how fresh.',
    group: 'system',
    // Dependencies lives under /intelligence and is its own destination.
    end: true,
  },
  {
    id: 'nav.dependencies',
    label: 'Dependencies',
    path: DEPENDENCIES_PATH,
    icon: Share2,
    paletteIcon: 'share-2',
    shortcut: 'g e',
    keywords: ['dependencies', 'dependents', 'graph', 'crates', 'packages', 'split', 'bump'],
    useWhen:
      'Use this when a bump has to travel: it shows which repositories a change reaches, and in which order.',
    group: 'system',
  },
  {
    id: 'nav.quality-gate',
    label: 'Quality gate',
    path: '/quality-gate',
    icon: ShieldCheck,
    paletteIcon: 'shield-check',
    shortcut: 'g q',
    keywords: ['quality', 'gate', 'jankurai', 'proof', 'score', 'findings', 'dispute'],
    useWhen:
      'Use this when a score surprises you: it shows what the gate would have blocked, and who disagreed.',
    group: 'system',
  },
  {
    id: 'nav.scorecard',
    label: 'Scorecard',
    path: SCORECARD_PATH,
    icon: Gauge,
    paletteIcon: 'gauge',
    shortcut: 'g c',
    keywords: ['scorecard', 'outcomes', 'delivery', 'lead time', 'failure', 'recovery'],
    useWhen:
      'Use this when you want delivery outcomes: speed, quality, recovery, economics and unknown measurement sources.',
    adminOnly: true,
    group: 'system',
  },
  {
    id: 'nav.yield',
    label: 'Yield',
    path: YIELD_PATH,
    icon: Coins,
    paletteIcon: 'coins',
    shortcut: 'g y',
    keywords: ['yield', 'cost', 'spend', 'efficiency', 'tokens', 'usd', 'experiment', 'first pass'],
    useWhen:
      'Use this when you want to know what a merged change costs: spend against what reached main, by model, agent and experiment arm.',
    // `/api/v1/yield` is admin-only, like the pipeline event feed it is read from.
    adminOnly: true,
    group: 'system',
  },
  {
    id: 'nav.report-incident',
    label: 'Report incident',
    path: REPORT_INCIDENT_PATH,
    icon: Flame,
    paletteIcon: 'flame',
    shortcut: 'g j',
    keywords: ['incident', 'outage', 'report', 'ledger', 'restore', 'failure', 'major'],
    useWhen:
      'Use this when something is broken in production and the incident ledger should know: say what is wrong, and add what caused and restored it.',
    // `POST /api/v1/incidents` takes global admins and event reporters.
    adminOnly: true,
    group: 'system',
  },
  {
    id: 'nav.shared-tools',
    label: 'Shared tools',
    path: '/shared-tools',
    icon: Layers,
    paletteIcon: 'layers',
    shortcut: 'g t',
    keywords: [
      'shared',
      'code',
      'tools',
      'duplicate',
      'finder',
      'loc',
      'proposals',
      'approve',
      'adoption',
    ],
    useWhen:
      'Use this when the same code keeps being written twice: it names the clusters and who has adopted the shared tool.',
    group: 'system',
  },
  {
    // Reached from the account menu and the palette, like Settings: it is about
    // using the app rather than about the forge's work.
    id: 'nav.help',
    label: 'Help',
    path: HELP_PATH,
    icon: LifeBuoy,
    paletteIcon: 'life-buoy',
    shortcut: 'g h',
    keywords: ['help', 'docs', 'documentation', 'how to', 'getting started', 'guide', 'support'],
    group: 'account',
  },
  {
    // The nav calls this page Settings; the palette says the same name.
    id: 'nav.settings',
    label: 'Settings',
    path: '/settings',
    icon: Cog,
    paletteIcon: 'cog',
    shortcut: 'g s',
    keywords: ['settings', 'admin', 'preferences', 'account'],
    group: 'account',
  },
  {
    id: 'nav.bots',
    label: 'Agents',
    path: '/bots',
    icon: Bot,
    paletteIcon: 'bot',
    shortcut: 'g b',
    keywords: ['agents', 'agent', 'tokens', 'grokbot', 'musebot', 'enrollment', 'reach', 'grok', 'muse'],
    group: 'account',
  },
  {
    // Your own agent sessions, across repositories; each repository's Agents
    // tab, where sessions start, links here too.
    id: 'nav.sessions',
    label: 'Sessions',
    path: SESSIONS_PATH,
    icon: SquareTerminal,
    paletteIcon: 'square-terminal',
    shortcut: 'g o',
    keywords: ['sessions', 'agents', 'vm', 'firecracker', 'claude', 'codex', 'grok', 'terminal'],
    group: 'account',
  },
];

/** The destinations of one group, minus the ones this viewer may not see. */
export function navGroup(group: NavGroup, isAdmin: boolean): NavDestination[] {
  return visibleDestinations(NAV_DESTINATIONS, isAdmin).filter((d) => d.group === group);
}

/** Every destination this viewer may see: `adminOnly` ones only for admins. */
export function visibleDestinations(
  destinations: readonly NavDestination[],
  isAdmin: boolean
): NavDestination[] {
  return destinations.filter((d) => isAdmin || !d.adminOnly);
}

/** One destination by id, or null when nothing in the registry has it. */
export function destinationById(id: string): NavDestination | null {
  return NAV_DESTINATIONS.find((destination) => destination.id === id) ?? null;
}

/** What the palette calls this destination, and the overlay with it. */
export function navCommandTitle(destination: NavDestination): string {
  return `Go to ${destination.label}`;
}

// navDestinations.ts — the one list of destinations the shell knows.
//
// A destination's label, path, icon, badge and shortcut live here once. The
// left nav renders it (`LeftNav`), the command palette and `/search` offer it
// (`useShellCommands`), and the keyboard binds it (`NavShortcuts`), so a new
// page or a renamed one is a single edit instead of three that drift.
//
// Shortcut letters follow the label: `g n` Needs you, `g w` Work, `g q`
// Quality gate. `aliases` keeps a destination's earlier combo working for one
// release after the letter moved; aliases stay out of the help overlay.

import {
  Activity,
  BookOpen,
  Brain,
  ClipboardList,
  Cog,
  FolderGit2,
  GitMerge,
  Layers,
  Rocket,
  ServerCog,
  Share2,
  ShieldCheck,
  Siren,
  type LucideIcon,
} from 'lucide-react';

import { DEPENDENCIES_PATH } from '../pages/DependenciesPage';
import { IN_FLIGHT_PATH } from '../pages/pullRoomModel';
import { NEEDS_YOU_PATH } from './HomeRedirect';
import { WIKI_PATH } from '../pages/wiki/wikiModel';
import { WORK_PATH } from '../pages/shift/workPaths';
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
    id: 'nav.runners',
    label: 'Runners',
    path: '/runners',
    icon: ServerCog,
    paletteIcon: 'server-cog',
    badge: 'system',
    shortcut: 'g u',
    aliases: ['g f'],
    keywords: ['fleet', 'runners', 'utilization', 'saturation', 'health'],
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
      'fleet',
    ],
    group: 'system',
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

/** What the palette calls this destination, and the overlay with it. */
export function navCommandTitle(destination: NavDestination): string {
  return `Go to ${destination.label}`;
}

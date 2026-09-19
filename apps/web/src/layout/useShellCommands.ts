// useShellCommands.ts — register the baseline navigation commands.

import { useEffect } from 'react';

import { useCommandStore, type Command } from '../stores/commandStore';
import { usePreferencesStore } from '../stores/preferencesStore';

export function useShellCommands(): void {
  const register = useCommandStore((s) => s.register);
  const unregister = useCommandStore((s) => s.unregister);
  const setTheme = usePreferencesStore((s) => s.setTheme);

  useEffect(() => {
    const commands: Command[] = [
      {
        id: 'nav.needs-you',
        title: 'Go to Needs you',
        keywords: ['needs you', 'attention', 'inbox', 'blocked', 'waiting', 'home', 'dashboard'],
        icon: 'home',
        target: { kind: 'route', path: '/needs-you' },
        shortcut: 'g d',
      },
      {
        id: 'nav.repos',
        title: 'Go to Repositories',
        keywords: ['repos', 'repository', 'projects'],
        icon: 'folder',
        target: { kind: 'route', path: '/repos' },
        shortcut: 'g r',
      },
      {
        id: 'nav.work',
        title: 'Go to Work',
        keywords: ['work', 'tracker', 'issues', 'tasks', 'bugs'],
        icon: 'clipboard-list',
        target: { kind: 'route', path: '/work' },
        shortcut: 'g w',
      },
      {
        id: 'nav.shift-queue',
        title: 'Go to Shift queue',
        keywords: ['shift', 'queue', 'todo', 'todoq', 'nightshift', 'bulletshift'],
        icon: 'clipboard-list',
        target: { kind: 'route', path: '/work/shift' },
      },
      {
        id: 'nav.shift-add',
        title: 'Add shift todos',
        keywords: ['shift', 'todo', 'file', 'add', 'nightshift', 'bulletshift'],
        icon: 'clipboard-list',
        target: { kind: 'route', path: '/work/shift/new' },
      },
      {
        id: 'nav.shift-workers',
        title: 'Go to Shift workers',
        keywords: ['shift', 'workers', 'slots', 'heartbeat', 'capacity', 'timeline'],
        icon: 'server-cog',
        target: { kind: 'route', path: '/work/shift/workers' },
      },
      {
        id: 'nav.activity',
        title: 'Go to Activity',
        keywords: ['activity', 'events', 'log', 'feed', 'live', 'pipeline', 'notifications', 'alerts'],
        icon: 'activity',
        target: { kind: 'route', path: '/activity' },
        shortcut: 'g a',
      },
      {
        id: 'nav.activity-wall',
        title: 'Open the Activity wall',
        keywords: ['wall', 'demo', 'activity', 'live', 'big screen'],
        icon: 'activity',
        target: { kind: 'route', path: '/activity?wall=1' },
      },
      {
        id: 'nav.releases',
        title: 'Go to Releases',
        keywords: ['release', 'deploy', 'production', 'environment', 'rollback', 'staged'],
        icon: 'rocket',
        target: { kind: 'route', path: '/releases' },
        shortcut: 'g l',
      },
      {
        id: 'nav.unreleased',
        title: 'Go to Unreleased',
        keywords: ['unreleased', 'unshipped', 'merged', 'pending release'],
        icon: 'package-open',
        target: { kind: 'route', path: '/unreleased' },
        shortcut: 'g u',
      },
      {
        id: 'nav.pull-room',
        title: 'Go to Pull Room',
        keywords: ['pr', 'pull', 'merge', 'review'],
        icon: 'git-merge',
        target: { kind: 'route', path: '/pull-room' },
        shortcut: 'g m',
      },
      {
        id: 'nav.fleet',
        title: 'Go to Runners',
        keywords: ['fleet', 'runners', 'utilization', 'saturation', 'health'],
        icon: 'server-cog',
        target: { kind: 'route', path: '/runners' },
        shortcut: 'g f',
      },
      {
        id: 'nav.intelligence',
        title: 'Go to Intelligence',
        keywords: ['jmcp', 'control-plane', 'priority', 'graph'],
        icon: 'activity',
        target: { kind: 'route', path: '/intelligence' },
        shortcut: 'g i',
      },
      {
        id: 'nav.tools',
        title: 'Go to Shared tools',
        keywords: ['shared', 'code', 'tools', 'duplicate', 'finder', 'loc', 'proposals', 'approve', 'adoption', 'fleet'],
        icon: 'layers',
        target: { kind: 'route', path: '/shared-tools' },
        shortcut: 'g t',
      },
      {
        id: 'nav.search',
        title: 'Search…',
        keywords: ['search', 'find', 'lookup', 'global'],
        icon: 'search',
        target: { kind: 'route', path: '/search' },
        shortcut: '/',
      },
      {
        id: 'nav.settings',
        title: 'Go to Admin Settings',
        keywords: ['settings', 'admin', 'preferences'],
        icon: 'cog',
        target: { kind: 'route', path: '/settings' },
        shortcut: 'g s',
      },
      {
        id: 'theme.light',
        title: 'Theme: Light',
        keywords: ['theme', 'appearance', 'light'],
        icon: 'sun',
        target: { kind: 'action', actionId: 'pref.theme.light' },
        run: () => setTheme('light'),
      },
      {
        id: 'theme.dark',
        title: 'Theme: Dark',
        keywords: ['theme', 'appearance', 'dark'],
        icon: 'moon',
        target: { kind: 'action', actionId: 'pref.theme.dark' },
        run: () => setTheme('dark'),
      },
      {
        id: 'theme.high-contrast',
        title: 'Theme: High contrast',
        keywords: ['theme', 'a11y', 'contrast'],
        icon: 'circle-dashed',
        target: { kind: 'action', actionId: 'pref.theme.high-contrast' },
        run: () => setTheme('high-contrast'),
      },
      {
        id: 'theme.system',
        title: 'Theme: System',
        keywords: ['theme', 'auto', 'system'],
        icon: 'monitor',
        target: { kind: 'action', actionId: 'pref.theme.system' },
        run: () => setTheme('system'),
      },
    ];
    register(commands);
    return () => unregister(commands.map((c) => c.id));
  }, [register, unregister, setTheme]);
}

// useShellCommands.ts — register the baseline palette commands.
//
// One "Go to" command per destination in NAV_DESTINATIONS (the same list the
// left nav renders and the keyboard binds), then the few entries that are not
// destinations: two admin deep links, the shortcuts overlay, and the themes.
// `/search` reads the same commands, so a destination is findable there too.

import { useEffect } from 'react';

import { useCommandStore, type Command } from '../stores/commandStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useShortcutsStore } from '../stores/shortcutsStore';
import {
  NAV_DESTINATIONS,
  navCommandTitle,
  visibleDestinations,
} from './navDestinations';
import { formatCombo } from '../hooks/useKeyboard';

/** `isAdmin`: an `adminOnly` destination is offered to nobody else. */
export function useShellCommands(isAdmin = false): void {
  const register = useCommandStore((s) => s.register);
  const unregister = useCommandStore((s) => s.unregister);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const openShortcuts = useShortcutsStore((s) => s.open);

  useEffect(() => {
    const destinations: Command[] = visibleDestinations(NAV_DESTINATIONS, isAdmin).map(
      (destination) => ({
        id: destination.id,
        title: navCommandTitle(destination),
        keywords: destination.keywords,
        icon: destination.paletteIcon,
        target: { kind: 'route', path: destination.path },
        shortcut: destination.shortcut,
      })
    );
    // Both deep links land inside an admin-only page, so they follow the
    // destination they belong to rather than being offered to every reader.
    const adminDeepLinks: Command[] = isAdmin
      ? [
          {
            id: 'nav.work-add',
            title: 'Add work',
            keywords: [
              'shift',
              'todo',
              'file',
              'add',
              'new',
              'nightshift',
              'dayshift',
              'bulletshift',
              'queue',
            ],
            icon: 'clipboard-list',
            target: { kind: 'route', path: '/work#add' },
          },
          {
            id: 'nav.activity-wall',
            title: 'Open the Activity wall',
            keywords: ['wall', 'demo', 'activity', 'live', 'big screen'],
            icon: 'activity',
            target: { kind: 'route', path: '/activity?wall=1' },
          },
        ]
      : [];
    const commands: Command[] = [
      ...destinations,
      ...adminDeepLinks,
      {
        // The palette is where an operator learns the key exists.
        id: 'help.shortcuts',
        title: `Keyboard shortcuts (${formatCombo('shift+/')})`,
        keywords: ['keyboard', 'shortcuts', 'keys', 'chords', 'help'],
        icon: 'keyboard',
        target: { kind: 'action', actionId: 'help.shortcuts' },
        run: () => openShortcuts(),
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
  }, [register, unregister, setTheme, openShortcuts, isAdmin]);
}

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useCommandStore } from '../../stores/commandStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useShortcutsStore } from '../../stores/shortcutsStore';
import { useShellCommands } from '../useShellCommands';

describe('useShellCommands', () => {
  afterEach(() => {
    useCommandStore.setState({ commands: [] });
  });

  it('registers every destination and theme command, and removes them on unmount', () => {
    const { unmount } = renderHook(() => useShellCommands(true));
    const ids = useCommandStore.getState().commands.map((c) => c.id);
    expect(ids).toEqual([
      'nav.needs-you',
      'nav.activity',
      'nav.work',
      'nav.in-flight',
      'nav.releases',
      'nav.repos',
      'nav.wiki',
      'nav.runners',
      'nav.intelligence',
      'nav.dependencies',
      'nav.quality-gate',
      'nav.shared-tools',
      'nav.settings',
      'nav.work-add',
      'nav.activity-wall',
      'help.shortcuts',
      'family.switch',
      'family.all',
      'theme.light',
      'theme.dark',
      'theme.high-contrast',
      'theme.system',
    ]);

    unmount();
    expect(useCommandStore.getState().commands).toEqual([]);
  });

  // Every admin-only destination and deep link is absent for another role: the
  // palette never offers a page whose read the server refuses.
  it('offers no admin-only destination to another role', () => {
    renderHook(() => useShellCommands(false));
    const ids = useCommandStore.getState().commands.map((c) => c.id);
    expect(ids).toEqual([
      'nav.in-flight',
      'nav.releases',
      'nav.repos',
      'nav.wiki',
      'nav.runners',
      'nav.intelligence',
      'nav.dependencies',
      'nav.quality-gate',
      'nav.shared-tools',
      'nav.settings',
      'help.shortcuts',
      'family.switch',
      'family.all',
      'theme.light',
      'theme.dark',
      'theme.high-contrast',
      'theme.system',
    ]);
  });

  it('groups the two family commands apart from the themes', () => {
    renderHook(() => useShellCommands());
    const groups = Object.fromEntries(
      useCommandStore
        .getState()
        .commands.filter((c) => c.target.kind === 'action')
        .map((c) => [c.id, c.group])
    );
    expect(groups['family.switch']).toBe('Family');
    expect(groups['family.all']).toBe('Family');
    expect(groups['theme.dark']).toBeUndefined();
  });

  it('names each page the way the nav names it', () => {
    renderHook(() => useShellCommands(true));
    const title = (id: string): string | undefined =>
      useCommandStore.getState().commands.find((c) => c.id === id)?.title;
    // The account control says "Settings", so the palette does not say something else.
    expect(title('nav.settings')).toBe('Go to Settings');
    expect(title('nav.in-flight')).toBe('Go to In flight');
    expect(title('nav.runners')).toBe('Go to Runners');
  });

  it('keeps commands registered by other surfaces when it unmounts', () => {
    useCommandStore.getState().register([
      { id: 'repo.open', title: 'Open repo', keywords: [], target: { kind: 'route', path: '/repos/x' } },
    ]);
    const { unmount } = renderHook(() => useShellCommands(true));
    unmount();
    expect(useCommandStore.getState().commands.map((c) => c.id)).toEqual(['repo.open']);
  });

  it('advertises the same chords the shell binds', () => {
    renderHook(() => useShellCommands(true));
    const shortcuts = Object.fromEntries(
      useCommandStore
        .getState()
        .commands.filter((c) => c.shortcut)
        .map((c) => [c.shortcut, c.target.kind === 'route' ? c.target.path : c.id])
    );
    expect(shortcuts).toEqual({
      'g n': '/needs-you',
      'g a': '/activity',
      'g w': '/work',
      'g p': '/in-flight',
      'g l': '/releases',
      'g r': '/repos',
      'g k': '/wiki',
      'g u': '/runners',
      'g i': '/intelligence',
      'g e': '/intelligence/dependencies',
      'g q': '/quality-gate',
      'g t': '/shared-tools',
      'g s': '/settings',
    });
  });

  it('offers the shortcuts overlay, saying which key opens it', () => {
    renderHook(() => useShellCommands(true));
    const entry = useCommandStore.getState().commands.find((c) => c.id === 'help.shortcuts');
    expect(entry?.title).toBe('Keyboard shortcuts (?)');
    expect(useShortcutsStore.getState().isOpen).toBe(false);
    entry?.run?.();
    expect(useShortcutsStore.getState().isOpen).toBe(true);
    useShortcutsStore.getState().close();
  });

  it('theme commands set the theme preference', () => {
    renderHook(() => useShellCommands(true));
    const run = (id: string): void =>
      useCommandStore.getState().commands.find((c) => c.id === id)?.run?.();
    const previous = usePreferencesStore.getState().theme;
    try {
      run('theme.light');
      expect(usePreferencesStore.getState().theme).toBe('light');
      run('theme.high-contrast');
      expect(usePreferencesStore.getState().theme).toBe('high-contrast');
      run('theme.system');
      expect(usePreferencesStore.getState().theme).toBe('system');
      run('theme.dark');
      expect(usePreferencesStore.getState().theme).toBe('dark');
    } finally {
      usePreferencesStore.getState().setTheme(previous);
    }
  });
});

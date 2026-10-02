import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useCommandStore } from '../../stores/commandStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useShellCommands } from '../useShellCommands';

describe('useShellCommands', () => {
  afterEach(() => {
    useCommandStore.setState({ commands: [] });
  });

  it('registers every destination and theme command, and removes them on unmount', () => {
    const { unmount } = renderHook(() => useShellCommands());
    const ids = useCommandStore.getState().commands.map((c) => c.id);
    expect(ids).toEqual([
      'nav.needs-you',
      'nav.repos',
      'nav.work',
      'nav.work-add',
      'nav.activity',
      'nav.activity-wall',
      'nav.releases',
      'nav.pull-room',
      'nav.fleet',
      'nav.intelligence',
      'nav.quality-gate',
      'nav.tools',
      'nav.settings',
      'theme.light',
      'theme.dark',
      'theme.high-contrast',
      'theme.system',
    ]);

    unmount();
    expect(useCommandStore.getState().commands).toEqual([]);
  });

  it('names each page the way the nav names it', () => {
    renderHook(() => useShellCommands());
    const title = (id: string): string | undefined =>
      useCommandStore.getState().commands.find((c) => c.id === id)?.title;
    // The account control says "Settings", so the palette does not say something else.
    expect(title('nav.settings')).toBe('Go to Settings');
    expect(title('nav.pull-room')).toBe('Go to In flight');
    expect(title('nav.fleet')).toBe('Go to Runners');
  });

  it('keeps commands registered by other surfaces when it unmounts', () => {
    useCommandStore.getState().register([
      { id: 'repo.open', title: 'Open repo', keywords: [], target: { kind: 'route', path: '/repos/x' } },
    ]);
    const { unmount } = renderHook(() => useShellCommands());
    unmount();
    expect(useCommandStore.getState().commands.map((c) => c.id)).toEqual(['repo.open']);
  });

  it('advertises the same chords the shell binds', () => {
    renderHook(() => useShellCommands());
    const shortcuts = Object.fromEntries(
      useCommandStore
        .getState()
        .commands.filter((c) => c.shortcut)
        .map((c) => [c.shortcut, c.target.kind === 'route' ? c.target.path : c.id])
    );
    expect(shortcuts).toEqual({
      'g d': '/needs-you',
      'g r': '/repos',
      'g w': '/work',
      'g a': '/activity',
      'g l': '/releases',
      'g m': '/in-flight',
      'g f': '/runners',
      'g i': '/intelligence',
      'g t': '/shared-tools',
      'g s': '/settings',
    });
  });

  it('theme commands set the theme preference', () => {
    renderHook(() => useShellCommands());
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

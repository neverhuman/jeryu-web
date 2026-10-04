// navDestinations.test.tsx — the registry is the whole truth about a
// destination: one palette command, one unique chord whose letter is in the
// label, and a path the router really serves.

import { renderHook } from '@testing-library/react';
import { matchRoutes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { router } from '../../app/router';
import { useCommandStore } from '../../stores/commandStore';
import { NAV_DESTINATIONS, navGroup, visibleDestinations } from '../navDestinations';
import { useShellCommands } from '../useShellCommands';

function registeredCommands() {
  renderHook(() => useShellCommands(true));
  return useCommandStore.getState().commands;
}

describe('NAV_DESTINATIONS', () => {
  afterEach(() => {
    useCommandStore.setState({ commands: [] });
  });

  it('gives every destination exactly one palette command that goes to its path', () => {
    const commands = registeredCommands();
    for (const destination of NAV_DESTINATIONS) {
      const matching = commands.filter((c) => c.id === destination.id);
      expect(matching, destination.label).toHaveLength(1);
      const [command] = matching;
      expect(command.title).toBe(`Go to ${destination.label}`);
      expect(command.target).toEqual({ kind: 'route', path: destination.path });
      expect(command.shortcut).toBe(destination.shortcut);
      expect(command.keywords.length).toBeGreaterThan(0);
    }
  });

  it('gives every destination one unique chord, aliases included', () => {
    const combos = NAV_DESTINATIONS.flatMap((d) => [d.shortcut, ...(d.aliases ?? [])]);
    expect(new Set(combos).size).toBe(combos.length);
    expect(NAV_DESTINATIONS.every((d) => /^g [a-z]$/.test(d.shortcut))).toBe(true);
  });

  it('picks the chord letter out of the words the destination goes by', () => {
    for (const destination of NAV_DESTINATIONS) {
      const letter = destination.shortcut.slice(-1);
      // The label when it has the letter ("g n" Needs you); otherwise a word
      // the destination is searched by ("g p" In flight, for pull requests).
      const words = `${destination.label} ${destination.keywords.join(' ')}`.toLowerCase();
      expect(words, destination.shortcut).toContain(letter);
    }
  });

  it('keeps the earlier chord of every destination whose letter moved', () => {
    const aliases = Object.fromEntries(
      NAV_DESTINATIONS.filter((d) => d.aliases?.length).map((d) => [d.shortcut, d.aliases])
    );
    expect(aliases).toEqual({ 'g n': ['g d'], 'g p': ['g m'], 'g u': ['g f'] });
  });

  it('points every destination at a route the router serves', () => {
    for (const destination of NAV_DESTINATIONS) {
      const matches = matchRoutes(router.routes, destination.path) ?? [];
      expect(matches.length, destination.path).toBeGreaterThan(0);
      // `*` is the NotFoundPage catch-all: matching only it is a 404.
      const leaf = matches[matches.length - 1]?.route.path;
      expect(leaf, destination.path).not.toBe('*');
    }
  });

  it('renders each destination in exactly one group', () => {
    const grouped = (['primary', 'wiki', 'system', 'account'] as const).flatMap((group) =>
      navGroup(group, true).map((d) => d.id)
    );
    expect(grouped.sort()).toEqual(NAV_DESTINATIONS.map((d) => d.id).sort());
  });

  it('keeps an admin-only destination from everyone else', () => {
    const forAdmins = { ...NAV_DESTINATIONS[0], id: 'nav.test-only', adminOnly: true };
    const list = [...NAV_DESTINATIONS, forAdmins];
    expect(visibleDestinations(list, true).map((d) => d.id)).toContain('nav.test-only');
    expect(visibleDestinations(list, false).map((d) => d.id)).not.toContain('nav.test-only');
  });
});

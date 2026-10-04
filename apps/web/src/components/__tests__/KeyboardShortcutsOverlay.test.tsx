// KeyboardShortcutsOverlay.test.tsx — the overlay opens from `?` or from the
// palette, and prints combos the way they are printed on a key.

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { KeyboardShortcutsOverlay } from '../KeyboardShortcutsOverlay';
import { KeyboardProvider, formatCombo, useKeyboardShortcut } from '../../hooks/useKeyboard';
import { useShortcutsStore } from '../../stores/shortcutsStore';

function Shortcut({ combo, label }: { combo: string; label: string }): null {
  useKeyboardShortcut(combo, () => {}, { label, group: 'Navigation' });
  return null;
}

function platform(value: string): void {
  Object.defineProperty(window.navigator, 'platform', { configurable: true, value });
}

const originalPlatform = window.navigator.platform;

describe('formatCombo', () => {
  afterEach(() => platform(originalPlatform));

  it('prints the modifier the keyboard has', () => {
    platform('MacIntel');
    expect(formatCombo('mod+k')).toBe('⌘K');
    expect(formatCombo('shift+alt+p')).toBe('⌥⇧P');
    platform('Linux x86_64');
    expect(formatCombo('mod+k')).toBe('Ctrl+K');
    expect(formatCombo('mod+b')).toBe('Ctrl+B');
  });

  it('prints a shifted character as the character, and a chord key by key', () => {
    platform('Linux x86_64');
    expect(formatCombo('shift+/')).toBe('?');
    expect(formatCombo('g n')).toBe('G N');
    expect(formatCombo('escape')).toBe('Esc');
  });
});

describe('KeyboardShortcutsOverlay', () => {
  beforeEach(() => {
    platform('Linux x86_64');
    useShortcutsStore.setState({ isOpen: false });
  });
  afterEach(() => platform(originalPlatform));

  function renderOverlay(): void {
    render(
      <KeyboardProvider>
        <Shortcut combo="mod+k" label="Open command palette" />
        <Shortcut combo="g n" label="Go to Needs you" />
        <KeyboardShortcutsOverlay />
      </KeyboardProvider>
    );
  }

  it('stays shut until something opens it, and says which key that is', () => {
    renderOverlay();
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useShortcutsStore.getState().open());
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
    // The hint, and the row for the key itself, both say "?".
    expect(screen.getByText(/Press/).textContent).toContain('?');
    expect(screen.getAllByText('?').length).toBeGreaterThan(0);
  });

  it('lists a registered shortcut as the keys a reader presses', () => {
    renderOverlay();
    act(() => useShortcutsStore.getState().open());
    expect(screen.getByText('Ctrl+K')).toBeTruthy();
    expect(screen.getByText('G N')).toBeTruthy();
    expect(screen.queryByText('mod+k')).toBeNull();
  });

  it('closes on its close button', () => {
    renderOverlay();
    act(() => useShortcutsStore.getState().open());
    fireEvent.click(screen.getByRole('button', { name: 'Close shortcuts overlay' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

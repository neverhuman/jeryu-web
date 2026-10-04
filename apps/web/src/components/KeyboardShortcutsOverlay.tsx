// KeyboardShortcutsOverlay.tsx — help dialog (W-CC-04).
//
// Lists all registered shortcuts grouped by `group` label. Triggered with `?`
// and Esc to dismiss. Used by the global shell.

import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';

import {
  formatCombo,
  type KeyboardShortcutDescriptor,
  useKeyboardRegistry,
  useKeyboardShortcut,
} from '../hooks/useKeyboard';
import { useShortcutsStore } from '../stores/shortcutsStore';

import './KeyboardShortcutsOverlay.css';

export function KeyboardShortcutsOverlay(): JSX.Element {
  const open = useShortcutsStore((s) => s.isOpen);
  const close = useShortcutsStore((s) => s.close);
  const toggle = useShortcutsStore((s) => s.toggle);
  const { shortcuts } = useKeyboardRegistry();

  useKeyboardShortcut('shift+/', toggle, {
    label: 'Show keyboard shortcuts',
    group: 'Help',
  });

  useEffect(() => {
    if (!open) return () => {};
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const groups = useMemo(() => {
    const buckets = new Map<string, KeyboardShortcutDescriptor[]>();
    for (const s of shortcuts) {
      const group = s.group ?? 'General';
      const arr = buckets.get(group) ?? [];
      arr.push(s);
      buckets.set(group, arr);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [shortcuts]);

  if (!open) return <></>;

  return (
    <div
      className="kbd-overlay__backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="kbd-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kbd-overlay-title"
      >
        <header className="kbd-overlay__header">
          <h2 id="kbd-overlay-title">Keyboard shortcuts</h2>
          {/* The one place that says which key opens this list. */}
          <p className="kbd-overlay__hint">
            Press <kbd className="kbd-overlay__combo">{formatCombo('shift+/')}</kbd> anywhere to
            open it.
          </p>
          <button
            type="button"
            className="kbd-overlay__close"
            aria-label="Close shortcuts overlay"
            onClick={close}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="kbd-overlay__body">
          {groups.length === 0 ? (
            <p className="kbd-overlay__empty">
              No shortcuts registered for this view yet.
            </p>
          ) : (
            groups.map(([group, items]) => (
              <section key={group} className="kbd-overlay__group">
                <h3 className="kbd-overlay__group-title">{group}</h3>
                <dl className="kbd-overlay__list">
                  {items.map((shortcut) => (
                    <div
                      key={`${group}-${shortcut.combo}`}
                      className="kbd-overlay__row"
                    >
                      <dt>{shortcut.label}</dt>
                      <dd>
                        <kbd className="kbd-overlay__combo">
                          {formatCombo(shortcut.combo)}
                        </kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

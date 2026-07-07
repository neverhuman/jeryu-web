// BootScreen.tsx — the signed-out experience: splash → carousel + login gate.
//
// Rendered by AppShell in place of the app whenever there is no authenticated
// user. Two phases:
//   * 'splash' — a brief (~950ms) boot animation, skippable by any key/click,
//     skipped entirely under prefers-reduced-motion.
//   * 'gate'   — the split layout: a moving FeatureCarousel filling the stage
//     with a docked LoginPanel. ENTER (when not already in a field) focuses
//     the login so users can sign in by keyboard or by click.

import { useEffect, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { StatusBar } from '../../layout/StatusBar';
import { BootSplash } from './BootSplash';
import { FeatureCarousel } from './FeatureCarousel';
import { LoginPanel } from './LoginPanel';

import './boot.css';

type Mode = 'login' | 'signup';
const SPLASH_MS = 950;

export function BootScreen({
  initialMode = 'login',
}: {
  initialMode?: Mode;
}): JSX.Element {
  const prefersReduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<'splash' | 'gate'>(
    prefersReduced ? 'gate' : 'splash'
  );
  const usernameRef = useRef<HTMLInputElement>(null);

  // Advance past the splash on a timer, or immediately on any key / pointer.
  useEffect(() => {
    if (phase !== 'splash') return;
    const toGate = (): void => setPhase('gate');
    const timer = window.setTimeout(toGate, SPLASH_MS);
    window.addEventListener('keydown', toGate, { once: true });
    window.addEventListener('pointerdown', toGate, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', toGate);
      window.removeEventListener('pointerdown', toGate);
    };
  }, [phase]);

  // "Press ENTER to log in": focus the username field — but ONLY from the
  // ambient state (nothing interactive focused). We must not preventDefault or
  // steal Enter when a button, tab, or input already has focus, or we'd break
  // native form submission / button activation / tab switching for keyboard
  // users. Hence a raw listener (useKeyboardShortcut preventDefaults on match
  // before its handler runs, which would suppress those native actions).
  useEffect(() => {
    if (phase !== 'gate') return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter') return;
      const el = document.activeElement;
      if (el && el !== document.body && el !== document.documentElement) return;
      event.preventDefault();
      usernameRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  if (phase === 'splash') {
    return (
      <main className="boot boot--splash" aria-label="Starting JeRyu">
        <BootSplash />
        <p className="sr-only">Starting JeRyu…</p>
      </main>
    );
  }

  return (
    <main className="boot boot--gate">
      <div className="boot__frame">
        <div className="boot__topline" aria-hidden="true">
          <span className="boot__topline-brand">┌─ JeRyu ── web forge</span>
          <span className="boot__topline-fill" />
          <span className="boot__topline-tag">authenticate ─┐</span>
        </div>
        <div className="boot__stage">
          <section className="boot__showcase" aria-label="JeRyu product overview">
            <div className="boot__pitch">
              <p className="boot__pitch-lede">Code. Review. Run. Release.</p>
              <p className="boot__pitch-copy">
                Repos, PRs, agents, CI, tools, and production cutovers in one signed-in forge.
              </p>
            </div>
            <FeatureCarousel />
          </section>
          <LoginPanel initialMode={initialMode} firstFieldRef={usernameRef} />
        </div>
        <div className="boot__footer">
          <span className="boot__keymap" aria-hidden="true">
            <kbd>ENTER</kbd> log in
            <span className="boot__sep">·</span>
            <kbd>←</kbd>
            <kbd>→</kbd> browse
            <span className="boot__sep">·</span>
            <kbd>1</kbd>–<kbd>6</kbd> jump
          </span>
          <div className="boot__statusbar">
            <StatusBar />
          </div>
        </div>
      </div>
    </main>
  );
}

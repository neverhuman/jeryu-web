// LoginPanel.tsx — the docked login box on the boot screen.
//
// Reuses AuthForm (the shared credential form) so every accessibility/e2e
// contract — `Login`/`Sign up` tabs, `Username`/`Password` labels, `Login`/
// `Create account` buttons — is identical to the rest of the auth surface.
// The `<h1>JeRyu</h1>` heading is the accessible brand name; the glyph beside
// it is decorative.

import type { Ref } from 'react';

import { JeryuLogo } from '../../components/brand/JeryuLogo';
import { AuthForm } from '../AuthPage';

type Mode = 'login' | 'signup';

export function LoginPanel({
  initialMode = 'login',
  firstFieldRef,
}: {
  initialMode?: Mode;
  firstFieldRef?: Ref<HTMLInputElement>;
}): JSX.Element {
  return (
    <section className="login-panel" aria-label="Log in to JeRyu">
      <div className="login-panel__brand">
        <JeryuLogo variant="mark" className="login-panel__mark" decorative />
        <div className="login-panel__brand-text">
          <h1 className="login-panel__title">JeRyu</h1>
          <span className="login-panel__sub">web forge · secure session</span>
        </div>
      </div>
      <AuthForm initialMode={initialMode} firstFieldRef={firstFieldRef} />
      <p className="login-panel__hint" aria-hidden="true">
        <span className="tui-caret" /> press{' '}
        <kbd className="login-panel__kbd">ENTER</kbd> to log in
      </p>
    </section>
  );
}

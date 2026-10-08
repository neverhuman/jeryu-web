// Signed-out story and the shared native authentication form.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { LandingSections } from './LandingSections';
import { LoginPanel } from './LoginPanel';
import { MarketingHeader } from './MarketingHeader';
import { MarketingScene } from './MarketingScene';

import './boot.css';

type Mode = 'login' | 'signup';

export function BootScreen({
  initialMode = 'login',
  initialAuthOpen = false,
  returnTo = null,
}: {
  initialMode?: Mode;
  initialAuthOpen?: boolean;
  /** The protected destination resumed after authentication. */
  returnTo?: string | null;
}): JSX.Element {
  const [authOpened, setAuthOpened] = useState(false);
  const authOpen = initialAuthOpen || authOpened;
  const usernameRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (authOpen) usernameRef.current?.focus();
  }, [authOpen, initialMode]);

  return (
    <main id="main-content" className={`marketing boot${authOpen ? ' boot--auth-open' : ''}`}>
      <MarketingScene motionTarget={heroRef} subdued={authOpen}>
        <MarketingHeader
          onLogin={() => setAuthOpened(true)}
          onHome={() => setAuthOpened(false)}
          authOpen={authOpen}
        />
        <section ref={heroRef} className="boot__hero" aria-label="JeRyū product story">
          <div className="boot__hero-copy marketing-scene__copy">
            <p className="boot__eyebrow"><span aria-hidden="true" />A forge for autonomous work</p>
            <h1>Git for agents.</h1>
            <p className="boot__lede">
              A home for agent work. From the first issue to a reviewed pull request,
              keep your code, context, and evidence together.
            </p>
            {!authOpen ? (
              <a className="boot__explore" href="#how-it-works">
                Explore the forge <span aria-hidden="true">↓</span>
              </a>
            ) : null}
            <p className="boot__signature">Built for code. Designed for autonomy.</p>
          </div>
          {authOpen ? (
            <div className="boot__auth-panel">
              {initialAuthOpen ? (
                <Link to="/" className="boot__back-button">← Back to the story</Link>
              ) : (
                <button type="button" className="boot__back-button" onClick={() => setAuthOpened(false)}>
                  ← Back to the story
                </button>
              )}
              {returnTo ? (
                <p className="boot__return-to" role="status">
                  Log in to continue to <code>{returnTo}</code>
                </p>
              ) : null}
              <LoginPanel initialMode={initialMode} firstFieldRef={usernameRef} />
            </div>
          ) : null}
        </section>
        {!authOpen ? <LandingSections /> : null}
        <footer className="marketing-footer">
          <p>JeRyū <span>·</span> The forge for agent work.</p>
          <Link to="/waitlist">Join waitlist <span aria-hidden="true">↗</span></Link>
        </footer>
      </MarketingScene>
    </main>
  );
}

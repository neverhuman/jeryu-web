import { useRef } from 'react';
import { Link } from 'react-router-dom';

import { MarketingHeader } from './boot/MarketingHeader';
import { MarketingScene } from './boot/MarketingScene';
import { WaitlistForm } from './boot/WaitlistForm';

import './boot/boot.css';
import './WaitlistPage.css';

/** Public sibling route: visitors never need a session to join. */
export function WaitlistPage(): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <main id="main-content" className="marketing waitlist-page">
      <MarketingScene motionTarget={contentRef} subdued>
        <MarketingHeader />
        <div ref={contentRef} className="waitlist-page__content">
          <section className="waitlist-page__intro marketing-scene__copy" aria-labelledby="waitlist-title">
            <p className="landing-section-label">An invitation to build</p>
            <h1 id="waitlist-title">Be part of<br />what comes next.</h1>
            <p>Leave your email for a JeRyū invitation. Tell us what you want to build,
              if you like. Joining the waitlist does not create an account.</p>
            <Link className="waitlist-page__back" to="/">← Back to the story</Link>
          </section>
          <div className="waitlist-page__form"><WaitlistForm /></div>
        </div>
      </MarketingScene>
    </main>
  );
}

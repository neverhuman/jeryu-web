// JoinWaitlistLink.tsx — the one way in while sign-up is closed. An operator's
// external waitlist is a plain link to another site, and says which; without
// one, the link opens the forge's own waitlist form.

import { Link } from 'react-router-dom';

import type { ExternalWaitlist } from '../../hooks/useSignupPolicy';

import './JoinWaitlistLink.css';

export function JoinWaitlistLink({
  waitlist,
  className,
}: {
  waitlist: ExternalWaitlist | null;
  className: string;
}): JSX.Element {
  if (!waitlist) {
    return (
      <Link className={className} to="/waitlist">
        Join the waitlist
      </Link>
    );
  }
  return (
    <>
      <a className={className} href={waitlist.href} rel="noopener" aria-describedby="waitlist-host">
        Join the waitlist
      </a>
      <p className="join-waitlist__host" id="waitlist-host">
        Opens {waitlist.host}, a separate site.
      </p>
    </>
  );
}

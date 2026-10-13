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
      <a className={className} href={waitlist.href} rel="noopener noreferrer" aria-describedby="waitlist-host">
        Join the waitlist
      </a>
      <p className="join-waitlist__host" id="waitlist-host">
        Opens {waitlist.host}, a separate site.
      </p>
    </>
  );
}

/** The policy could not be read: say so, and offer to ask again. */
export function SignupPolicyUnreadable({
  retrying,
  retry,
  className,
}: {
  retrying: boolean;
  retry: () => void;
  className: string;
}): JSX.Element {
  return (
    <>
      <p className="join-waitlist__host" role="alert">
        Could not check whether sign-up is open.
      </p>
      <button type="button" className={className} disabled={retrying} onClick={retry}>
        {retrying ? 'Checking…' : 'Try again'}
      </button>
    </>
  );
}

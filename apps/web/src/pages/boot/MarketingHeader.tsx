import { Link } from 'react-router-dom';

import { JeryuWordmark } from '../../components/brand/JeryuWordmark';

import './MarketingHeader.css';

export function MarketingHeader({
  onLogin,
  onHome,
  authOpen = false,
}: {
  onLogin?: () => void;
  onHome?: () => void;
  authOpen?: boolean;
}): JSX.Element {
  return (
    <header className="marketing-header">
      <Link to="/" className="marketing-header__brand" aria-label="JeRyū home" onClick={onHome}>
        <JeryuWordmark decorative />
      </Link>
      <nav className="marketing-header__actions" aria-label="Account access">
        {onLogin ? (
          <button className="marketing-header__login" type="button" onClick={onLogin} aria-pressed={authOpen}>
            Log in
          </button>
        ) : (
          <Link className="marketing-header__login" to="/login">Log in</Link>
        )}
        <Link className="marketing-header__waitlist" to="/waitlist">
          Join waitlist
          <span aria-hidden="true">↗</span>
        </Link>
      </nav>
    </header>
  );
}

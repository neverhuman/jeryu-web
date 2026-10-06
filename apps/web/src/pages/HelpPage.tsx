// HelpPage.tsx — /help: how to get around, in one page.
//
// Reached from the account menu, the palette and `g h`. It says the three
// things a reader cannot discover by clicking: the keys, which page answers
// which question, and where the account controls live. The destinations and
// their chords come from NAV_DESTINATIONS, so a renamed page or a moved chord
// is right here without a second edit.

import { Link } from 'react-router-dom';

import { ActionButton } from '../components/action/ActionButton';
import { useAuth } from '../hooks/useAuth';
import { formatCombo } from '../hooks/useKeyboard';
import { usePageTitle } from '../hooks/usePageTitle';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { navGroup, type NavDestination } from '../layout/navDestinations';
import { useShortcutsStore } from '../stores/shortcutsStore';
import { WIKI_PATH } from './wiki/wikiModel';

import './page.css';

export function HelpPage(): JSX.Element {
  usePageTitle('Help');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const openShortcuts = useShortcutsStore((s) => s.open);
  const primary = navGroup('primary', isAdmin);
  const system = navGroup('system', isAdmin);
  const wiki = useSiteSettings().data?.internal_wiki ?? null;

  return (
    <div className="page" data-testid="help-page">
      <header className="page__header">
        <h1 className="page__title">Help</h1>
        <p className="page__subtitle">
          The keys, the pages and where your account lives. Nothing here needs
          an administrator.
        </p>
      </header>

      <section className="page__section" aria-labelledby="help-keys">
        <h2 className="page__section-title" id="help-keys">
          Getting around
        </h2>
        <ul className="page__fact-list">
          <li className="page__fact">
            <code>{formatCombo('mod+k')}</code> or <code>{formatCombo('/')}</code> opens
            the command palette: a page, a repository, or <code>name#12</code> for a
            pull request.
          </li>
          <li className="page__fact">
            <code>g</code> then a letter goes straight to a page — the letter is in
            the page&apos;s name, and every nav link says its own chord.
          </li>
          <li className="page__fact">
            <code>{formatCombo('shift+/')}</code> lists every shortcut.{' '}
            <ActionButton variant="ghost" onClick={() => openShortcuts()}>
              Open the shortcuts
            </ActionButton>
          </li>
          <li className="page__fact">
            The repository chip in the header switches repositories: type part of a
            name and press Enter.
          </li>
        </ul>
      </section>

      <section className="page__section" aria-labelledby="help-daily">
        <h2 className="page__section-title" id="help-daily">
          The daily pages
        </h2>
        <ul className="page__fact-list">
          {primary.map((destination) => (
            <li className="page__fact" key={destination.id}>
              <Link to={destination.path}>{destination.label}</Link>{' '}
              <code>{destination.shortcut}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="page__section" aria-labelledby="help-system">
        <h2 className="page__section-title" id="help-system">
          System pages: which one to open
        </h2>
        <ul className="page__fact-list">
          {system.map((destination: NavDestination) => (
            <li className="page__fact" key={destination.id}>
              <Link to={destination.path}>{destination.label}</Link>{' '}
              <code>{destination.shortcut}</code>
              {destination.useWhen ? <span> — {destination.useWhen}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="page__section" aria-labelledby="help-account">
        <h2 className="page__section-title" id="help-account">
          Your account
        </h2>
        <ul className="page__fact-list">
          <li className="page__fact">
            The account control at the top right holds <Link to="/settings">Settings</Link>,
            the theme, the shortcuts, this page and Log out.
          </li>
          <li className="page__fact">
            The family chip beside the search box scopes the whole shell: the nav,
            the chords and the palette all carry the family you pick.
          </li>
          {wiki ? (
            <li className="page__fact">
              This install&apos;s own handbook is the{' '}
              <Link to={WIKI_PATH}>Wiki</Link>, read from{' '}
              <code>{wiki.full_name}</code>.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

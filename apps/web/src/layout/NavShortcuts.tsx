// NavShortcuts.tsx — binds one `g` chord per destination in NAV_DESTINATIONS.
//
// One component per chord, because a shortcut is a hook: a list of components
// may grow and shrink, a list of hook calls may not. Aliases (a destination's
// earlier chord, kept for one release) bind the same way but stay out of the
// shortcuts overlay, so the overlay lists the letters that match the labels.

import { useNavigate } from 'react-router-dom';

import { useKeyboardShortcut } from '../hooks/useKeyboard';
import { useAuth } from '../hooks/useAuth';
import {
  NAV_DESTINATIONS,
  navCommandTitle,
  visibleDestinations,
  type NavDestination,
} from './navDestinations';

function NavShortcut({
  combo,
  destination,
  inHelp,
}: {
  combo: string;
  destination: NavDestination;
  inHelp: boolean;
}): null {
  const navigate = useNavigate();
  useKeyboardShortcut(combo, () => navigate(destination.path), {
    label: navCommandTitle(destination),
    group: 'Navigation',
    registerInHelp: inHelp,
  });
  return null;
}

export function NavShortcuts(): JSX.Element {
  const { user } = useAuth();
  const destinations = visibleDestinations(NAV_DESTINATIONS, user?.role === 'admin');
  return (
    <>
      {destinations.flatMap((destination) =>
        [
          { combo: destination.shortcut, inHelp: true },
          ...(destination.aliases ?? []).map((combo) => ({ combo, inHelp: false })),
        ].map(({ combo, inHelp }) => (
          <NavShortcut
            key={combo}
            combo={combo}
            destination={destination}
            inHelp={inHelp}
          />
        ))
      )}
    </>
  );
}

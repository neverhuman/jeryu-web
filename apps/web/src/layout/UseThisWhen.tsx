// UseThisWhen.tsx — the one line under a System page's title.
//
// The System pages are read when something is off, by somebody who has to
// pick the right one first: each says in one line the question it answers.
// The words live in NAV_DESTINATIONS beside the label and the chord, so Help
// lists the same sentence the page shows.

import { destinationById } from './navDestinations';

export interface UseThisWhenProps {
  /** A destination id from NAV_DESTINATIONS, e.g. `nav.runners`. */
  id: string;
}

export function UseThisWhen({ id }: UseThisWhenProps): JSX.Element | null {
  const useWhen = destinationById(id)?.useWhen;
  if (!useWhen) return null;
  return (
    <p className="page__use-when" data-testid={`use-this-when-${id}`}>
      {useWhen}
    </p>
  );
}

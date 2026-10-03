// useMediaQuery.ts — reactive CSS media query, for layouts that CSS alone
// cannot express.
//
// A width that only changes how something looks belongs in a stylesheet; this
// is for the cases where the narrow layout is a different control altogether
// (the Files tab's tree becoming a one-line picker, for one).

import { useEffect, useState } from 'react';

function matches(query: string): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  );
}

export function useMediaQuery(query: string): boolean {
  const [active, setActive] = useState<boolean>(() => matches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia(query);
    const onChange = (): void => setActive(mq.matches);
    setActive(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return active;
}

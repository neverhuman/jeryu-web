// useFocusMainOnNavigate.ts — where the keyboard lands after a navigation.
//
// Following a link used to leave focus on the link, so the next Tab continued
// through the nav rather than the page that just opened, and a screen reader
// said nothing about the arrival. Pushing a new entry moves focus to the
// `<main>` landmark (`#main-content`, already focusable for the skip link),
// which is also where a reader of the new page wants to start.
//
// Only a push: Back and Forward return to a page the visitor has read, where
// ScrollRestoration puts the old position back and moving focus would fight it.
// Focusing never scrolls — the restored position stays as restored.

import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** The id AppShell gives its `<main>`. */
export const MAIN_CONTENT_ID = 'main-content';

export function useFocusMainOnNavigate(): void {
  const { key } = useLocation();
  const navigationType = useNavigationType();
  // The first render is an arrival, not a navigation: a visitor who opened the
  // URL directly keeps focus where the browser put it.
  const seen = useRef(false);

  useEffect(() => {
    const first = !seen.current;
    seen.current = true;
    if (first || navigationType !== 'PUSH') return;
    const main = document.getElementById(MAIN_CONTENT_ID);
    main?.focus({ preventScroll: true });
  }, [key, navigationType]);
}

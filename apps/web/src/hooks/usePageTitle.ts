// usePageTitle.ts — what one page calls itself in the tab, the history entry
// and a bookmark.
//
// index.html ships the bare product name, which every page used to keep: a
// window of tabs all read "JeRyu" and Back offered a list of identical
// entries. Each page names itself instead — "Needs you · JeRyu" — and a page
// about one thing names the thing: "acme/widgets#31 · JeRyu".
//
// A page whose name depends on data it is still loading passes `null` until
// the name is known, which leaves the product name alone rather than flashing
// a placeholder into the history entry.

import { useEffect } from 'react';

/** The product name, last in every title and the whole title on its own. */
export const TITLE_SUFFIX = 'JeRyu';

/** `"<name> · JeRyu"`, or `"JeRyu"` when the page has no name yet. */
export function pageTitle(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? `${trimmed} · ${TITLE_SUFFIX}` : TITLE_SUFFIX;
}

/**
 * Keep `document.title` at `"<name> · JeRyu"` while this page is mounted.
 * Leaving the page restores the bare product name, so the next page's own
 * title is the only one a reader can see.
 */
export function usePageTitle(name: string | null | undefined): void {
  useEffect(() => {
    document.title = pageTitle(name);
    return () => {
      document.title = TITLE_SUFFIX;
    };
  }, [name]);
}

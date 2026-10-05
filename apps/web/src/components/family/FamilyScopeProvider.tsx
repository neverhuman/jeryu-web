// FamilyScopeProvider.tsx — the family scope, for the whole shell.
//
// One scope survives navigation: the left nav, the `g x` shortcuts and the
// command palette all carry it, so choosing a family on Needs you and then
// opening Work shows that family's work, not everyone's. The URL is
// authoritative (see familyScope.ts for its two spellings); when an address
// states no family, the scope is the last one this tab chose, remembered in
// session storage so a second tab can look at a second family. "All families"
// clears it everywhere.
//
// A link to an item of ANOTHER family still opens that item: the page shows the
// family its address states, the tab keeps carrying the one it was given, and
// the header chip says the page is outside the scope and offers the switch.
//
// The document title is each page's own (usePageTitle): a page whose subject
// is one family names it there, so the scope does not write the title too.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { familyLabel } from '../../pages/pullRoomModel';
import {
  readBrowserText,
  removeBrowserText,
  writeBrowserText,
} from '../../storage/browserStorage';
import {
  canonicalFamily,
  FAMILY_SCOPE_STORAGE_SLOT,
  familyFromHref,
  familyFromLocation,
  sameFamily,
  withFamilyScope,
} from './familyScope';

export interface FamilyScope {
  /**
   * The family this page shows, canonical; '' means every family. It is the
   * family the address states, else the one the tab carries.
   */
  family: string;
  /**
   * The family the tab carries from page to page, canonical; every link gets
   * this one. It differs from `family` only while this address is a link into
   * another family (see `outside`).
   */
  carried: string;
  /**
   * The family this address states while the tab carries another one: a link
   * to an item of another family opens it without moving the scope, and the
   * header chip offers the switch. '' whenever the two agree.
   */
  outside: string;
  /** What a reader calls it ('' when every family is in scope). */
  label: string;
  /** True while one family is in scope. */
  active: boolean;
  /**
   * Put `family` in scope ('' for every family) and keep the current page.
   * `drop` names query parameters the page wants taken off at the same time.
   */
  setFamily: (
    family: string,
    options?: { drop?: readonly string[]; to?: string }
  ) => void;
  /** Carry the family this address states ('' when it is already carried). */
  switchToOutside: () => void;
  /** Show every family again, here and on every page after this one. */
  clearFamily: () => void;
  /** `to` carrying the scope, unless it already names a family of its own. */
  scopedPath: (to: string) => string;
  /** Whether the header chip's family picker is open. */
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
}

const ALL_FAMILIES: FamilyScope = {
  family: '',
  carried: '',
  outside: '',
  label: '',
  active: false,
  setFamily: () => {},
  switchToOutside: () => {},
  clearFamily: () => {},
  scopedPath: (to) => to,
  pickerOpen: false,
  setPickerOpen: () => {},
};

const FamilyScopeContext = createContext<FamilyScope>(ALL_FAMILIES);

/** The scope, and the ways to change it. Outside the provider: every family. */
export function useFamilyScope(): FamilyScope {
  return useContext(FamilyScopeContext);
}

function readRemembered(): string {
  return canonicalFamily(readBrowserText('tab', FAMILY_SCOPE_STORAGE_SLOT));
}

function remember(family: string): void {
  if (family) writeBrowserText('tab', FAMILY_SCOPE_STORAGE_SLOT, family);
  else removeBrowserText('tab', FAMILY_SCOPE_STORAGE_SLOT);
}

export function FamilyScopeProvider({ children }: { children: ReactNode }): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [remembered, setRemembered] = useState(readRemembered);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The scope this tab chose, while the navigation that states it is still on
  // its way: until then the URL is one step behind and must not be read back.
  const chosen = useRef<string | null>(null);

  const stated = familyFromLocation(location.pathname, location.search);
  // The page shows what its address states; where it states nothing, the
  // family this tab carries.
  const family = stated ?? remembered;
  // A link into another family opens that family's item without moving the
  // scope: the chip says the page is outside what the tab carries, and offers
  // the one click that switches.
  const outside = stated && remembered && !sameFamily(stated, remembered) ? stated : '';

  // An address that states a family where the tab carries none is a choice:
  // the tab carries it from here on. One that disagrees with a carried family
  // is a visit, not a choice, so it leaves the scope where it was.
  useEffect(() => {
    if (chosen.current !== null) {
      if ((stated ?? '') === chosen.current) chosen.current = null;
      return;
    }
    if (stated === null || remembered !== '') return;
    setRemembered(stated);
    remember(stated);
  }, [stated, remembered]);

  const setFamily = useCallback(
    (next: string, options?: { drop?: readonly string[]; to?: string }): void => {
      const key = canonicalFamily(next);
      chosen.current = key;
      setRemembered(key);
      remember(key);
      // `to` is another page: the family goes with it, and it is a step
      // forward in the history. Here, the scope replaces the address.
      const here = withFamilyScope(
        options?.to ?? `${location.pathname}${location.search}${location.hash}`,
        key
      );
      const [path, query = ''] = here.split('#')[0].split('?');
      const params = new URLSearchParams(query);
      for (const name of options?.drop ?? []) params.delete(name);
      const rest = params.toString();
      const hash = here.includes('#') ? `#${here.split('#').slice(1).join('#')}` : '';
      void navigate(`${path}${rest ? `?${rest}` : ''}${hash}`, {
        replace: options?.to === undefined,
      });
    },
    [location.hash, location.pathname, location.search, navigate]
  );

  const clearFamily = useCallback((): void => {
    setFamily('');
  }, [setFamily]);

  const switchToOutside = useCallback((): void => {
    if (outside) setFamily(outside);
  }, [outside, setFamily]);

  const scopedPath = useCallback(
    (to: string): string =>
      // A link carries the scope, not the family of the item being visited:
      // on a page outside the scope that is the family the tab still carries.
      familyFromHref(to) === null ? withFamilyScope(to, outside ? remembered : family) : to,
    [family, outside, remembered]
  );

  const label = family ? familyLabel(family) : '';

  const value = useMemo<FamilyScope>(
    () => ({
      family,
      carried: remembered,
      outside,
      label,
      active: family !== '',
      setFamily,
      switchToOutside,
      clearFamily,
      scopedPath,
      pickerOpen,
      setPickerOpen,
    }),
    [
      clearFamily,
      family,
      label,
      outside,
      pickerOpen,
      remembered,
      scopedPath,
      setFamily,
      switchToOutside,
    ]
  );

  return <FamilyScopeContext.Provider value={value}>{children}</FamilyScopeContext.Provider>;
}

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
// The scope is also the page title while it is set, so a window in the taskbar
// says which family it is watching.

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
  FAMILY_SCOPE_STORAGE_KEY,
  familyFromHref,
  familyFromLocation,
  withFamilyScope,
} from './familyScope';

export interface FamilyScope {
  /** The family in scope, canonical; '' means every family. */
  family: string;
  /** What a reader calls it ('' when every family is in scope). */
  label: string;
  /** True while one family is in scope. */
  active: boolean;
  /**
   * Put `family` in scope ('' for every family) and keep the current page.
   * `drop` names query parameters the page wants taken off at the same time.
   */
  setFamily: (family: string, options?: { drop?: readonly string[] }) => void;
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
  label: '',
  active: false,
  setFamily: () => {},
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
  return canonicalFamily(readBrowserText('tab', FAMILY_SCOPE_STORAGE_KEY));
}

function remember(family: string): void {
  if (family) writeBrowserText('tab', FAMILY_SCOPE_STORAGE_KEY, family);
  else removeBrowserText('tab', FAMILY_SCOPE_STORAGE_KEY);
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
  const family = stated ?? remembered;

  // What the URL says is what this tab remembers from here on.
  useEffect(() => {
    if (chosen.current !== null) {
      if ((stated ?? '') === chosen.current) chosen.current = null;
      return;
    }
    if (stated === null || stated === remembered) return;
    setRemembered(stated);
    remember(stated);
  }, [stated, remembered]);

  const setFamily = useCallback(
    (next: string, options?: { drop?: readonly string[] }): void => {
      const key = canonicalFamily(next);
      chosen.current = key;
      setRemembered(key);
      remember(key);
      const here = withFamilyScope(
        `${location.pathname}${location.search}${location.hash}`,
        key
      );
      const [path, query = ''] = here.split('#')[0].split('?');
      const params = new URLSearchParams(query);
      for (const name of options?.drop ?? []) params.delete(name);
      const rest = params.toString();
      const hash = here.includes('#') ? `#${here.split('#').slice(1).join('#')}` : '';
      void navigate(`${path}${rest ? `?${rest}` : ''}${hash}`, { replace: true });
    },
    [location.hash, location.pathname, location.search, navigate]
  );

  const clearFamily = useCallback((): void => {
    setFamily('');
  }, [setFamily]);

  const scopedPath = useCallback(
    (to: string): string => (familyFromHref(to) === null ? withFamilyScope(to, family) : to),
    [family]
  );

  const label = family ? familyLabel(family) : '';

  const value = useMemo<FamilyScope>(
    () => ({
      family,
      label,
      active: family !== '',
      setFamily,
      clearFamily,
      scopedPath,
      pickerOpen,
      setPickerOpen,
    }),
    [clearFamily, family, label, pickerOpen, scopedPath, setFamily]
  );

  return <FamilyScopeContext.Provider value={value}>{children}</FamilyScopeContext.Provider>;
}

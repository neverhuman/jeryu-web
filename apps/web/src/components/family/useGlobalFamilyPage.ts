// useGlobalFamilyPage.ts — "this page is the same for every family".
//
// A few pages are genuinely global: nothing on them maps to a repository, so
// there is nothing a family could narrow (Intelligence's evidence snapshot, the
// shared-tool registry's lifecycle lists). Such a page says so once, here, and
// the header chip states it — "All families · this page is not per-family" —
// rather than letting the chip imply a filter the page never applied.
//
// The scope itself is left alone: it is still carried, so the next page the
// reader opens is scoped again.

import { useEffect } from 'react';

import { useFamilyScope } from './FamilyScopeProvider';

export function useGlobalFamilyPage(): void {
  const { setPageIsGlobal } = useFamilyScope();
  useEffect(() => {
    setPageIsGlobal(true);
    return () => setPageIsGlobal(false);
  }, [setPageIsGlobal]);
}

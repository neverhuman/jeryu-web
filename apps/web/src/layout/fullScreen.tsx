// fullScreen.tsx — a page asking the shell for the whole screen.
//
// Most pages live inside the shell's furniture: the header, the left nav, the
// live dock and the status bar. A wall is not read by anyone sitting at a desk,
// so Activity's wall mode asks for the screen itself — the furniture is nobody's
// handle there, and a sticky header over a feed that scrolls itself only hides
// its first row.
//
// The page declares it (`usePageTakesScreen(wall)`) and the shell answers by
// putting its chrome away; leaving the page, or leaving the mode, gives it back.
// Rendered without the shell — a page under test, a story — the hook is a
// no-op, so a page never has to know who is above it.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface FullScreenShell {
  /** The page below has asked for the screen: the shell holds its chrome back. */
  fullScreen: boolean;
  /** Said by the page, once per change; it says `false` again as it leaves. */
  setFullScreen: (on: boolean) => void;
}

const NO_SHELL: FullScreenShell = { fullScreen: false, setFullScreen: () => {} };

const FullScreenContext = createContext<FullScreenShell>(NO_SHELL);

/** Holds the one answer for the shell's layout; wrap the whole shell in it. */
export function FullScreenProvider({ children }: { children: ReactNode }): JSX.Element {
  const [fullScreen, setFullScreen] = useState(false);
  const value = useMemo(() => ({ fullScreen, setFullScreen }), [fullScreen]);
  return <FullScreenContext.Provider value={value}>{children}</FullScreenContext.Provider>;
}

/** Whether the page below has the screen. The shell's layout reads this. */
export function useFullScreenShell(): boolean {
  return useContext(FullScreenContext).fullScreen;
}

/**
 * A page's side of it: `on` while this page wants the screen. The claim is
 * dropped when the page unmounts, so a route change always gives the chrome
 * back even if the page never says so itself.
 */
export function usePageTakesScreen(on: boolean): void {
  const { setFullScreen } = useContext(FullScreenContext);
  useEffect(() => {
    setFullScreen(on);
    return () => setFullScreen(false);
  }, [on, setFullScreen]);
}

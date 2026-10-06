// useDocumentHidden.ts — true while this tab is hidden.
//
// React Query stops its refetch intervals while the tab is not visible, so a
// page that promises "Live" needs to know: the Activity tail says "Paused"
// rather than claiming to be polling when nothing is.

import { useEffect, useState } from 'react';

function readHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState<boolean>(readHidden);

  useEffect(() => {
    if (typeof document === 'undefined') return () => {};
    const onChange = (): void => setHidden(readHidden());
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return hidden;
}

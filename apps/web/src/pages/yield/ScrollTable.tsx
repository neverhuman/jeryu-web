// ScrollTable.tsx — the Yield page's tables scroll sideways on a narrow
// screen. The wrapper is focusable, so the columns past the edge can be
// reached and read without a mouse.

import type { ReactNode } from 'react';

export function ScrollTable({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

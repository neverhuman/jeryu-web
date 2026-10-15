import type { ReactNode, RefObject } from 'react';

import { DragonLanding } from './DragonLanding';
import { useLandingMotion } from './useLandingMotion';

// Each current rides one row of the 80px background grid; boot.css sets the
// row, length and speed of each, so some race and some drift.
const CURRENTS = 7;

/** One continuous graphic background for the story and public account flows. */
export function MarketingScene({ children, motionTarget, subdued = false }: {
  children: ReactNode;
  subdued?: boolean;
  motionTarget: RefObject<HTMLElement | null>;
}): JSX.Element {
  const motion = useLandingMotion(motionTarget, true);
  return (
    <div className="marketing-scene" data-dragon-subdued={subdued} data-background-motion={motion.active ? 'running' : 'paused'}>
      <div className="marketing-scene__currents" aria-hidden="true">
        {Array.from({ length: CURRENTS }, (_, index) => <span key={index} className="marketing-scene__current" />)}
      </div>
      <DragonLanding />
      {children}
    </div>
  );
}

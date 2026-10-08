import type { ReactNode, RefObject } from 'react';

import { DragonLanding } from './DragonLanding';
import { useLandingMotion } from './useLandingMotion';

/** One continuous graphic background for the story and public account flows. */
export function MarketingScene({ children, motionTarget, subdued = false }: {
  children: ReactNode;
  subdued?: boolean;
  motionTarget: RefObject<HTMLElement | null>;
}): JSX.Element {
  const motion = useLandingMotion(motionTarget, true);
  return (
    <div className="marketing-scene" data-dragon-subdued={subdued} data-background-motion={motion.active ? 'running' : 'paused'}>
      <DragonLanding />
      {children}
    </div>
  );
}

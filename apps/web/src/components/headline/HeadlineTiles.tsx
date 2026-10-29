// HeadlineTiles.tsx — the three numbers that say how the factory is doing,
// carried by `GET /api/v1/yield`: lead time (filed to production), the share of
// todos that needed a person, and the share of merged changes that turned main
// or the green ref red. Flow and Yield both lead with them.
//
// It shows nothing without the block: the yield API is admin-only, and a server
// that predates it sends none. The caller reads the report, so a page spends one
// request on it.

import type { YieldHeadline } from '../../api/types';
import { headlineTiles } from './headlineModel';

import './headline.css';

export function HeadlineTiles({
  headline,
  testId = 'headline-tiles',
}: {
  headline: YieldHeadline | undefined;
  testId?: string;
}): JSX.Element | null {
  if (!headline) return null;
  return (
    <div className="headline__tiles" data-testid={testId}>
      {headlineTiles(headline).map((tile) => (
        <article
          key={tile.id}
          className={`headline__tile${tile.id === 'lead-time' ? ' headline__tile--lead' : ''}`}
          data-testid={`headline-${tile.id}`}
        >
          <div className="headline__label">{tile.label}</div>
          <div className="headline__value">{tile.value}</div>
          <div className="headline__detail">{tile.detail}</div>
        </article>
      ))}
    </div>
  );
}

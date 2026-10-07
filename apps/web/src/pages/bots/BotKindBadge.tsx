import type { BotKind } from '../../api/types';

import { kindLabel } from './botModel';

import './BotsPage.css';

/** Kind text is Grokbot or Musebot. It is never taken from the display name. */
export function BotKindBadge({ kind }: { kind: BotKind }): JSX.Element {
  const tone = kind === 'muse' ? 'muse' : kind === 'grok' ? 'grok' : 'unknown';
  return (
    <span className={`kind-badge kind-badge--${tone}`} data-testid="bot-kind">
      {kindLabel(kind)}
    </span>
  );
}

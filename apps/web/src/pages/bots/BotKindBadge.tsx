import type { BotKind } from '../../api/types';

import { kindLabel } from './botModel';

import './BotsPage.css';

/**
 * Kind text comes from `kind` (grok reads Grokbot, muse reads Musebot, any
 * other kind as itself). It is never taken from the display name.
 */
export function BotKindBadge({ kind }: { kind: BotKind }): JSX.Element {
  const tone = kind === 'muse' ? 'muse' : kind === 'grok' ? 'grok' : 'unknown';
  return (
    <span className={`kind-badge kind-badge--${tone}`} data-testid="bot-kind">
      {kindLabel(kind)}
    </span>
  );
}

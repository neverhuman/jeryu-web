import type { BotReach } from '../../api/types';
import { refReachRows } from './botModel';
import './BotsPage.css';

/** The same restriction on the account list and a repository's roster. */
export function BotRefReach({ reach }: { reach: BotReach }): JSX.Element | null {
  const rows = refReachRows(reach);
  if (rows.length === 0) return null;
  return (
    <ul className="bot-ref-reach" aria-label="Allowed refs">
      {rows.map((row) => <li key={row}>{row.startsWith('refs/') ? <code>{row}</code> : row}</li>)}
    </ul>
  );
}

// AgentsTabs.tsx — the three tabs of the Agents page.
//
// Agents was three destinations: who is running anywhere (`/agents`), your own
// sessions (`/sessions`) and the agents enrolled on your account (`/bots`).
// They are one page now, and each tab keeps the address it always had, so a
// bookmark or a pasted link still opens the same view.

import { PageTabs } from '../../components/pageTabs';
import { SESSIONS_PATH } from '../SessionsPage';

export const AGENTS_PATH = '/agents';
export const ENROLLED_AGENTS_PATH = '/bots';

export type AgentsTab = 'running' | 'sessions' | 'enrolled';

export function AgentsTabs({ current }: { current: AgentsTab }): JSX.Element {
  // Built on render, not at load: the Sessions page imports this strip, and
  // its path is read once both modules exist.
  const tabs = [
    { id: 'running', label: 'Running', to: AGENTS_PATH },
    { id: 'sessions', label: 'Your sessions', to: SESSIONS_PATH },
    { id: 'enrolled', label: 'Enrolled', to: ENROLLED_AGENTS_PATH },
  ];
  return <PageTabs label="Agents" tabs={tabs} current={current} testId="agents-tabs" />;
}

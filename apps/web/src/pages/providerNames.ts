// providerNames.ts — the agent providers a person can connect, as Settings
// names them.

import type { AgentProvider } from '../api/types/providerConnections';

export const PROVIDERS: { value: AgentProvider; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'grok', label: 'Grok' },
];

export function providerLabel(provider: string): string {
  return PROVIDERS.find((entry) => entry.value === provider)?.label ?? provider;
}

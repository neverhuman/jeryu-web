import { describe, expect, it } from 'vitest';

import { parsePresenceItem, type AgentPresenceItem } from '../../../api/agentPresence';
import {
  agentLabel,
  collisionText,
  costText,
  parsePullRef,
  presencePullHref,
  presenceRepoHref,
  presenceRunHref,
  presenceTodoHref,
  pullLinkLabel,
  sourceLabel,
  todoLabel,
} from '../presenceModel';

function item(overrides: Record<string, unknown> = {}): AgentPresenceItem {
  const parsed = parsePresenceItem({
    id: 'external:cli:one',
    source: 'external',
    agent: 'codex',
    state: 'active',
    ...overrides,
  });
  if (!parsed) throw new Error('fixture did not parse');
  return parsed;
}

describe('presence words', () => {
  it('names each source', () => {
    expect(sourceLabel('external')).toBe('external');
    expect(sourceLabel('agent_run')).toBe('jeryu run');
    expect(sourceLabel('queue_worker')).toBe('queue worker');
    expect(sourceLabel('reviewer')).toBe('reviewer');
    expect(sourceLabel('gate')).toBe('gate');
  });

  it('joins agent and model', () => {
    expect(agentLabel({ agent: 'codex', model: 'model-x' })).toBe('codex · model-x');
    expect(agentLabel({ agent: 'codex', model: null })).toBe('codex');
  });

  it('formats spend', () => {
    expect(costText(1.234)).toBe('$1.23');
    expect(costText(null)).toBeNull();
  });
});

describe('presence links', () => {
  it('reads owner/name#number', () => {
    expect(parsePullRef('acme/widgets#12')).toEqual({ fullName: 'acme/widgets', number: 12 });
    expect(parsePullRef('widgets#12')).toBeNull();
    expect(parsePullRef('acme/widgets#x')).toBeNull();
    expect(parsePullRef(undefined)).toBeNull();
  });

  it('links a pull request to the app page on the same host', () => {
    expect(presencePullHref('forge', 'acme/widgets#12')).toBe('/repos/forge/acme/widgets/pulls/12');
    expect(presencePullHref('forge', 'nonsense')).toBeNull();
  });

  it('labels a pull request by number here and by repository elsewhere', () => {
    expect(pullLinkLabel('acme/widgets#12', 'acme/widgets')).toBe('pull request #12');
    expect(pullLinkLabel('acme/gears#3', 'acme/widgets')).toBe('pull request acme/gears#3');
  });

  it('links a todo to its Work page, narrowing by family when named', () => {
    expect(presenceTodoHref('acme:20261012-1200-abc123')).toBe('/work/20261012-1200-abc123?family=acme');
    expect(presenceTodoHref('20261012-1200-abc123')).toBe('/work/20261012-1200-abc123');
    expect(todoLabel('acme:20261012-1200-abc123')).toBe('todo 20261012-1200-abc123');
  });

  it('links a run to its terminal on the Agents tab', () => {
    expect(presenceRunHref('forge', 'acme/widgets', 'run 1')).toBe('/repos/forge/acme/widgets/agents/run%201');
  });

  it('opens a family row on its first repository', () => {
    expect(presenceRepoHref('forge', item({ repos: ['acme/widgets', 'acme/gears'] }))).toBe(
      '/repos/forge/acme/widgets/agents'
    );
    expect(
      presenceRepoHref('forge', item({ repos: ['acme/widgets'], links: { agent_run: 'run-2' } }))
    ).toBe('/repos/forge/acme/widgets/agents/run-2');
    expect(presenceRepoHref('forge', item({ repos: [] }))).toBeNull();
  });
});

describe('collisionText', () => {
  it('names the other agents on the branch and counts the ones it cannot see', () => {
    const other = item({ id: 'external:cli:two', agent: 'claude-code', operator: 'grace' });
    const mine = item({ branch: 'ada/fix', collides_with: ['external:cli:two', 'gate:elsewhere'] });
    const byId = new Map([[other.id, other]]);
    expect(collisionText(mine, byId)).toBe(
      'Collision: also live on branch ada/fix: claude-code (grace), 1 more.'
    );
  });

  it('says nothing without a collision', () => {
    expect(collisionText(item(), new Map())).toBeNull();
  });
});

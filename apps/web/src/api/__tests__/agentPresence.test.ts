import { describe, expect, it } from 'vitest';

import {
  familyAgentPresencePath,
  livePresenceCount,
  mergePresenceWithRuns,
  orderPresence,
  parsePresenceItem,
  parsePresenceList,
  presenceUnsupported,
  presenceView,
  repoAgentPresencePath,
  runPresenceState,
  type AgentPresenceItem,
} from '../agentPresence';
import type { RepoAgentSummary } from '../agentTerminal';
import { ApiError } from '../client';

function wire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'external:cli:one',
    source: 'external',
    session_id: 'cli:one',
    agent: 'claude-code',
    model: 'model-x',
    operator: 'ada',
    lane: 'agent-presence',
    branch: 'ada/agent-presence',
    title: 'Wire presence into the repository tab',
    state: 'active',
    via: 'repo',
    started_at: 1_791_800_000_000,
    last_active_at: 1_791_800_300_000,
    expires_at: 1_791_800_600_000,
    cost_usd: 1.23,
    links: { pr: 'acme/widgets#12', todo: 'acme:20261012-1200-abc123' },
    collides_with: [],
    ...overrides,
  };
}

function item(overrides: Partial<AgentPresenceItem>): AgentPresenceItem {
  const parsed = parsePresenceItem(wire());
  if (!parsed) throw new Error('fixture did not parse');
  return { ...parsed, ...overrides };
}

function run(overrides: Partial<RepoAgentSummary> = {}): RepoAgentSummary {
  return {
    run_id: 'run-1',
    branch: 'fix/parser',
    runner: 'node-a',
    status: 'running',
    tty_live: true,
    agent: 'editor',
    shell_run_id: 'shell-1',
    updated_at: '2026-10-12T12:00:00Z',
    ...overrides,
  };
}

describe('agent presence paths', () => {
  it('builds the repository and family routes', () => {
    expect(repoAgentPresencePath('repo/1')).toBe('/api/v1/repos/repo%2F1/agent-presence');
    expect(familyAgentPresencePath('acme')).toBe('/api/v1/agent-presence?family=acme');
  });
});

describe('parsePresenceItem', () => {
  it('keeps every field of a full item', () => {
    const parsed = parsePresenceItem(wire({ host: 'node-a', via: 'family', family: 'acme' }));
    expect(parsed).toMatchObject({
      id: 'external:cli:one',
      source: 'external',
      agent: 'claude-code',
      model: 'model-x',
      operator: 'ada',
      state: 'active',
      via: 'family',
      family: 'acme',
      host: 'node-a',
      cost_usd: 1.23,
      links: { pr: 'acme/widgets#12', todo: 'acme:20261012-1200-abc123' },
    });
  });

  it('drops a row with no id or no agent', () => {
    expect(parsePresenceItem(wire({ id: '' }))).toBeNull();
    expect(parsePresenceItem(wire({ agent: null }))).toBeNull();
    expect(parsePresenceItem('not a row')).toBeNull();
  });

  it('reads unknown words on the safe side', () => {
    const parsed = parsePresenceItem(
      wire({ source: 'mystery', state: 'dreaming', via: 'sideways', cost_usd: -4, links: 'x' })
    );
    expect(parsed?.source).toBe('external');
    expect(parsed?.state).toBe('stale');
    expect(parsed?.via).toBeNull();
    expect(parsed?.cost_usd).toBeNull();
    expect(parsed?.links).toEqual({});
  });

  it('leaves the host out when the server leaves it out', () => {
    expect(parsePresenceItem(wire())?.host).toBeNull();
  });

  it('does not let an item collide with itself', () => {
    const parsed = parsePresenceItem(
      wire({ collides_with: ['external:cli:one', 'external:cli:two', 7] })
    );
    expect(parsed?.collides_with).toEqual(['external:cli:two']);
  });
});

describe('parsePresenceList', () => {
  it('orders live rows first and drops duplicates', () => {
    const list = parsePresenceList({
      items: [
        wire({ id: 'a', state: 'ended', last_active_at: 9 }),
        wire({ id: 'b', state: 'idle', last_active_at: 5 }),
        wire({ id: 'c', state: 'active', last_active_at: 1 }),
        wire({ id: 'd', state: 'stale', last_active_at: 8 }),
        wire({ id: 'e', state: 'active', last_active_at: 3 }),
        wire({ id: 'e', state: 'ended' }),
      ],
      total: 5,
    });
    expect(list.items.map((entry) => entry.id)).toEqual(['e', 'c', 'b', 'd', 'a']);
    expect(list.total).toBe(5);
  });

  it('refuses a body with no items, which reads unsupported', () => {
    let thrown: unknown = null;
    try {
      parsePresenceList({ hello: 'world' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect(presenceUnsupported(thrown)).toBe(true);
  });
});

describe('presenceUnsupported', () => {
  it('is true for a missing route, a wrong method, HTML and an unreachable path', () => {
    expect(presenceUnsupported(new ApiError(404, { code: 'not_found', message: '' }))).toBe(true);
    expect(presenceUnsupported(new ApiError(405, { code: 'internal', message: '' }))).toBe(true);
    expect(presenceUnsupported(new ApiError(200, { code: 'invalid_response', message: '' }))).toBe(true);
    expect(presenceUnsupported(new ApiError(0, { code: 'network_error', message: '' }))).toBe(true);
  });

  it('is false for a real failure', () => {
    expect(presenceUnsupported(new ApiError(500, { code: 'internal', message: '' }))).toBe(false);
    expect(presenceUnsupported(new ApiError(403, { code: 'forbidden', message: '' }))).toBe(false);
    expect(presenceUnsupported(new Error('boom'))).toBe(false);
  });
});

describe('presenceView', () => {
  it('names each state of a read', () => {
    const list = { items: [], total: 0 };
    expect(presenceView({ data: undefined, error: null }).kind).toBe('waiting');
    expect(presenceView({ data: list, error: null })).toEqual({ kind: 'ready', list });
    expect(
      presenceView({ data: undefined, error: new ApiError(404, { code: 'not_found', message: '' }) }).kind
    ).toBe('absent');
    expect(
      presenceView({ data: undefined, error: new ApiError(500, { code: 'internal', message: '' }) }).kind
    ).toBe('failed');
  });
});

describe('orderPresence and livePresenceCount', () => {
  it('counts active and idle among the live', () => {
    const items = [
      item({ id: 'a', state: 'active' }),
      item({ id: 'b', state: 'idle' }),
      item({ id: 'c', state: 'stale' }),
      item({ id: 'd', state: 'ended' }),
    ];
    expect(livePresenceCount(items)).toBe(2);
    expect(orderPresence([...items].reverse()).map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('runPresenceState', () => {
  it('reads run statuses on the presence scale', () => {
    expect(runPresenceState({ status: 'running', tty_live: false })).toBe('active');
    expect(runPresenceState({ status: 'exited', tty_live: true })).toBe('active');
    expect(runPresenceState({ status: 'blocked', tty_live: false })).toBe('idle');
    expect(runPresenceState({ status: 'exited', tty_live: false })).toBe('ended');
  });
});

describe('mergePresenceWithRuns', () => {
  it('joins a presence run row with its run instead of listing it twice', () => {
    const rows = mergePresenceWithRuns(
      [
        item({ id: 'agent_run:run-1', source: 'agent_run', links: { agent_run: 'run-1' } }),
        item({ id: 'external:cli:one', last_active_at: 1 }),
      ],
      [run()]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].item.id).toBe('agent_run:run-1');
    expect(rows[0].run?.shell_run_id).toBe('shell-1');
    expect(rows[1].run).toBeNull();
  });

  it('adds a run the presence list does not name, in its place by state', () => {
    const rows = mergePresenceWithRuns(
      [item({ id: 'external:cli:one', state: 'idle' })],
      [run({ run_id: 'run-9', status: 'exited', tty_live: false })]
    );
    expect(rows.map((row) => row.item.id)).toEqual(['external:cli:one', 'agent_run:run-9']);
    expect(rows[1].item).toMatchObject({
      source: 'agent_run',
      state: 'ended',
      branch: 'fix/parser',
      links: { agent_run: 'run-9' },
    });
    expect(rows[1].run?.run_id).toBe('run-9');
  });

  it('is empty when nobody is at work', () => {
    expect(mergePresenceWithRuns([], [])).toEqual([]);
  });
});

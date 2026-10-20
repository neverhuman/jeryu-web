export const FLOW_HISTORY = {
  daily: {
    '2026-10-13': { arrived: 2, started: 2, passed: 1, rework: 1 },
    '2026-10-14': { arrived: 1, started: 1, passed: 1, held: 1 }
  },
  detailed_since: '2026-10-12T00:00:00Z',
  timezone: 'UTC',
  offset: 0,
  total: 2,
  items: [
    {
      event_seq: 12,
      lot_id: 'acme/widgets#42',
      station: 'gate',
      state: 'passed',
      ts: '2026-10-14T10:00:00Z',
      repo: 'acme/widgets',
      pr: 42,
      sha: 'a'.repeat(40),
      title: 'Show the delivery route',
      summary: 'Required checks passed',
      runner: 'gate-a',
      log_url: '/activity',
      href: '/acme/widgets/pull/42'
    },
    {
      event_seq: 11,
      lot_id: 'acme/widgets#41',
      station: 'gate',
      state: 'rework',
      ts: '2026-10-13T10:00:00Z',
      repo: 'acme/widgets',
      pr: 41,
      sha: 'b'.repeat(40),
      title: 'Repair the queue',
      summary: 'Required tests failed',
      runner: 'gate-b',
      log_url: null,
      href: '/acme/widgets/pull/41'
    }
  ],
  deliveries: [],
  related_items: []
};
export function flowHistory(params: URLSearchParams) {
  const items = FLOW_HISTORY.items.filter(
    (i) =>
      (!params.get('day') || i.ts.startsWith(params.get('day')!)) &&
      (!params.get('state') || i.state === params.get('state')) &&
      (!params.get('lot') || i.lot_id === params.get('lot'))
  );
  return { ...FLOW_HISTORY, items, total: items.length };
}
const tool = (runnerId: string, host: string, over: Record<string, unknown> = {}) => ({
  runnerId,
  host,
  online: 'online',
  load: 'idle',
  lastSeen: '2026-10-14T10:00:00Z',
  code: { version: '2.1.0', commit: 'abcdef123456' },
  failing: false,
  failureReason: null,
  ...over
});
const layoutStation = (id: string, label: string, order: number, tools: unknown[], over: Record<string, unknown> = {}) => {
  const online = (tools as { online: string }[]).filter((t) => t.online === 'online').length;
  const busy = (tools as { load: string }[]).filter((t) => t.load === 'busy').length;
  const warnings = [...(online === 0 ? ['no_reporting_tool'] : [])];
  return {
    id, label, order, tools,
    capacity: { reporting: online, busy, expected: null },
    flagged: warnings.length > 0, warnings, unknown: online === 0 ? ['no_heartbeat', 'expected_capacity'] : ['expected_capacity'],
    ...over
  };
};
/** `GET /api/v1/flow/layout`: Gate has two of four expected tools reporting,
 *  Review has one healthy tool, Merge has none. Invented hosts only. */
export const FLOW_LAYOUT = {
  schema_version: 'jeryu.flow.layout/v1',
  generated_at: '2026-10-14T10:00:00Z',
  stations: [
    layoutStation('queue', 'Queue', 1, [tool('worker-a@node-w/w1', 'node-w', { load: 'busy' })]),
    layoutStation('review', 'Review', 3, [tool('reviewer-a', 'node-r')]),
    layoutStation('gate', 'Gate', 4, [
      tool('gate-a', 'node-a'),
      tool('gate-b', 'node-b', { load: 'busy', code: { version: '2.0.9', commit: '1234567890ab' } }),
      tool('gate-c', 'node-c', { online: 'offline', lastSeen: '2026-10-13T08:00:00Z' })
    ], { capacity: { reporting: 2, busy: 1, expected: 4 }, flagged: true, warnings: ['fewer_than_expected'], unknown: [] }),
    layoutStation('merge', 'Merge', 5, [])
  ]
};

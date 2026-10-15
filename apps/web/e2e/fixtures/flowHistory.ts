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
export const FLOW_LAYOUT = {
  stations: [
    {
      id: 'gate',
      tools: [
        {
          runnerId: 'gate-a',
          host: 'node-a',
          online: 'online',
          load: 'idle',
          lastSeen: '2026-10-14T10:00:00Z',
          code: { version: '2.1.0' }
        }
      ]
    }
  ]
};

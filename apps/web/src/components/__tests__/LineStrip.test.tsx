// LineStrip.test.tsx — the delivery line strip: nine stations in route order,
// what is at each now, the bottleneck named, unknown kept unknown, and the
// strip that reads the report itself leaving itself out when it may not.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlowLineStrip, LineStrip } from '../flow/LineStrip';
import { bottleneckNote, lineTotals, stationCells } from '../flow/lineStripModel';
import { FLOW_REPORT } from '../../pages/__tests__/flowTestData';
import { errorResponse, json } from '../../pages/__tests__/shiftPageHelpers';

function draw(element: ReactElement): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('lineStripModel', () => {
  it('cells the nine stations in route order, with the hold in sight', () => {
    const cells = stationCells(FLOW_REPORT);
    expect(cells.map((cell) => cell.label)).toEqual([
      'Queue',
      'Work',
      'Shift',
      'Review',
      'Gate',
      'Merge',
      'Pin',
      'Stage',
      'Deploy',
    ]);
    const review = cells.find((cell) => cell.label === 'Review')!;
    expect(review.tone).toBe('human');
    expect(review.wip).toEqual({ waiting: 1, active: 0, held: 1 });
    // Unknown stays unknown: a station nothing has reached has no counts.
    const pin = cells.find((cell) => cell.label === 'Pin')!;
    expect(pin.wip).toBeNull();
    expect(pin.total).toBeNull();
    expect(pin.title).toBe('Pin: nothing has reached this station yet');
    expect(cells.find((cell) => cell.label === 'Gate')!.bottleneck).toBe(true);
  });

  it('says the line totals, and says so when it cannot', () => {
    expect(lineTotals(FLOW_REPORT).map((total) => total.value)).toEqual(['1.0 d', '4.2×', '13']);
    expect(bottleneckNote(FLOW_REPORT)).toBe('Gate holds the most waiting');
    const thin = { ...FLOW_REPORT, line: { ...FLOW_REPORT.line, cycle_s: null, x_factor: null } };
    expect(lineTotals(thin).map((total) => total.detail)).toEqual([
      'not enough data',
      'not enough data',
      '24 finished in 28 days',
    ]);
  });
});

describe('LineStrip', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws every station, names the bottleneck and links into Flow', () => {
    draw(<LineStrip report={FLOW_REPORT} family="acme" />);
    expect(screen.getByTestId('flow-line-strip-bottleneck')).toHaveTextContent(
      'Gate holds the most waiting'
    );
    expect(screen.getByTestId('flow-line-strip-station-gate')).toHaveAttribute(
      'href',
      '/flow?station=gate&family=acme'
    );
    // Held work is the only red, and it is a count of its own.
    const review = screen.getByTestId('flow-line-strip-station-review');
    expect(review.querySelector('.line-strip__count--held')).toHaveTextContent('1');
    expect(review.className).toContain('line-strip__station--human');
    expect(screen.getByTestId('flow-line-strip-station-pin')).toHaveTextContent('—');
    // Without the totals asked for, the strip is the stations alone.
    expect(screen.queryByTestId('flow-line-strip-totals')).toBeNull();
  });

  it('carries the line totals and hands a picked station to the page', () => {
    const picked: string[] = [];
    draw(<LineStrip report={FLOW_REPORT} totals onStation={(id) => picked.push(id)} />);
    expect(screen.getByTestId('flow-line-strip-cycle')).toHaveTextContent('1.0 d');
    expect(screen.getByTestId('flow-line-strip-x-factor')).toHaveTextContent('4.2×');
    expect(screen.getByTestId('flow-line-strip-wip')).toHaveTextContent('13');
    fireEvent.click(screen.getByTestId('flow-line-strip-station-gate'));
    expect(picked).toEqual(['gate']);
  });

  it('reads the line itself, and leaves itself out when the read is refused', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(FLOW_REPORT));
    draw(<FlowLineStrip family="acme" />);
    await waitFor(() => expect(screen.getByTestId('flow-line-strip')).toBeInTheDocument());
    vi.restoreAllMocks();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => errorResponse(403, 'admin only'));
    draw(<FlowLineStrip testId="second-strip" />);
    await waitFor(() => expect(screen.queryByTestId('second-strip')).toBeNull());
  });
});

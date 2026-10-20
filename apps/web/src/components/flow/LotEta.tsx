// LotEta.tsx — an in-flight lot's estimate, from the flow report: the p50
// remaining time, the p90 bound and the slowest station still ahead. It shows
// nothing without a report (the flow API is admin-only, and an older server has
// none) and for a lot the report does not list. The caller reads the report, so
// a page lists many lots with one request.

import { createContext, useContext } from 'react';
import { Link } from 'react-router-dom';

import type { FlowReport } from '../../api/types';
import { findLot, lotEtaView, type LotRef } from './lotEtaModel';

/** The report a list of lots reads their estimates from. */
export const LotEtaReport = createContext<FlowReport | undefined>(undefined);

export function LotEta({
  report: given,
  lotRef,
  testId,
}: {
  /** Given, it wins over the list's report. */
  report?: FlowReport | undefined;
  lotRef: LotRef;
  testId: string;
}): JSX.Element | null {
  const inherited = useContext(LotEtaReport);
  const report = given ?? inherited;
  if (!report) return null;
  const lot = findLot(report, lotRef);
  if (!lot) return null;
  const view = lotEtaView(report, lot);
  return (
    <span className="lot-eta" data-testid={testId}>
      <Link to={`/flow?station=${encodeURIComponent(lot.station)}`}>{view.stationLabel}</Link> · {view.text}
      {view.slowest ? ` · slowest ahead: ${view.slowest}` : ''}
    </span>
  );
}

// lotEtaModel.ts — which in-flight lot a page is about, and its estimate in
// words. Kept pure so it is tested without a browser.
//
// A lot is a todo, or a pull request no todo carries (`owner/repo#number`).
// The flow report lists the oldest lots at each station only, so a lot it does
// not list has no estimate to show: the page shows nothing rather than a guess.

import type { FlowLot, FlowReport } from '../../api/types';
import { spanWords } from '../../format/duration';
import { etaWords } from '../../pages/flow/flowModel';

export interface LotRef {
  /** Todo ids that ride this work. */
  todoIds?: readonly string[];
  /** The pull request, as `owner/name` and its number. */
  pull?: { repo: string; number: number };
}

/** True when `href` is this pull request's page, on either path the app serves. */
function isPullPath(href: string | null | undefined, pull: { repo: string; number: number }): boolean {
  if (!href) return false;
  const path = href.split(/[?#]/)[0] ?? '';
  return path.endsWith(`/${pull.repo}/pull/${pull.number}`) || path.endsWith(`/${pull.repo}/pulls/${pull.number}`);
}

/** The lot for a todo or pull request, or null when the report does not list it. */
export function findLot(report: FlowReport, ref: LotRef): FlowLot | null {
  const todoIds = new Set(ref.todoIds ?? []);
  const pullId = ref.pull ? `${ref.pull.repo}#${ref.pull.number}` : null;
  return (
    report.lots.find(
      (lot) =>
        todoIds.has(lot.lot_id) ||
        (pullId !== null && lot.lot_id === pullId) ||
        (ref.pull !== undefined && (isPullPath(lot.pr_href, ref.pull) || isPullPath(lot.href, ref.pull)))
    ) ?? null
  );
}

export interface LotEtaView {
  lot: FlowLot;
  /** `ETA 30m (p90 bound 1h 30m)` or the reason there is none. */
  text: string;
  /** The slowest station still ahead, when the estimate names one. */
  slowest: string | null;
  stationLabel: string;
}

export function lotEtaView(report: FlowReport, lot: FlowLot): LotEtaView {
  const label = (id: string): string => report.stations.find((station) => station.id === id)?.label ?? id;
  let text: string;
  if (lot.state === 'held' || !lot.eta_s) {
    text = etaWords(lot);
  } else {
    text = `ETA ${spanWords(lot.eta_s.p50)} (p90 bound ${spanWords(lot.eta_s.p90)})`;
    if (lot.eta_partial) {
      text += `, not counting ${lot.eta_unknown_stations.map(label).join(', ') || 'some stations'}`;
    }
  }
  return {
    lot,
    text,
    slowest: lot.eta_s && lot.slowest_ahead ? label(lot.slowest_ahead) : null,
    stationLabel: label(lot.station),
  };
}

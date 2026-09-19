// needsYouModel.ts — pure helpers for the "Needs you" page and its nav badge.

import type { AttentionItem, AttentionResponse, AttentionSeverity } from '../../api/types';

export const SEVERITIES: readonly AttentionSeverity[] = ['critical', 'action', 'watch'];

export const SEVERITY_LABEL: Record<AttentionSeverity, string> = {
  critical: 'Broken — the pipeline is stuck',
  action: 'Waiting on you',
  watch: 'Worth a look',
};

export interface AttentionGroup {
  severity: AttentionSeverity;
  label: string;
  items: AttentionItem[];
}

/** An unknown severity is shown, not dropped: it lands under `watch`. */
export function severityOf(item: Pick<AttentionItem, 'severity'>): AttentionSeverity {
  return (SEVERITIES as readonly string[]).includes(item.severity)
    ? (item.severity as AttentionSeverity)
    : 'watch';
}

/** Critical, then action, then watch; oldest first inside a group; empty groups dropped. */
export function groupAttention(items: AttentionItem[]): AttentionGroup[] {
  return SEVERITIES.map((severity) => ({
    severity,
    label: SEVERITY_LABEL[severity],
    items: items
      .filter((item) => severityOf(item) === severity)
      .sort(
        (a, b) =>
          (a.since ?? '￿').localeCompare(b.since ?? '￿') || a.id.localeCompare(b.id)
      ),
  })).filter((group) => group.items.length > 0);
}

/** Critical and action rows are red: a human is the next step. */
export function severityTone(severity: AttentionSeverity): 'danger' | 'warning' {
  return severity === 'watch' ? 'warning' : 'danger';
}

/**
 * The nav badge: critical + action. Counts come from the items when the
 * server's `counts` is missing or malformed.
 */
export function attentionBadgeCount(data: AttentionResponse | undefined): number {
  if (!data) return 0;
  const { counts } = data;
  if (counts && Number.isFinite(counts.critical) && Number.isFinite(counts.action)) {
    return Math.max(0, counts.critical) + Math.max(0, counts.action);
  }
  return (data.items ?? []).filter((item) => severityOf(item) !== 'watch').length;
}

/** `todo_blocked` → `todo blocked`. */
export function kindLabel(kind: string): string {
  return kind.replace(/_/g, ' ');
}

/** Only same-origin app paths are followed; anything else is not a link. */
export function safeHref(href: string | null | undefined): string | null {
  return href && href.startsWith('/') && !href.startsWith('//') ? href : null;
}

export function findAttention(
  data: AttentionResponse | undefined,
  kind: string
): AttentionItem | undefined {
  return data?.items?.find((item) => item.kind === kind);
}

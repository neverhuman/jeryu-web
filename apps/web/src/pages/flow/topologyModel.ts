// topologyModel.ts — what the Flow map reads off the configured delivery
// topology, kept pure so it is tested without a browser.
//
// The server derives the topology from the family's manifests, pin locks and
// branch protection (jeryu-deploy `docs/flow.md`, "Family, product,
// repository"). Nothing here routes on a repository's name, and nothing here
// fills a gap in: a route the configuration does not state reads as unknown,
// and a product with no configured convergence point says so.

import type { FlowProduct, FlowReport, FlowRepoNode, FlowWork } from '../../api/types';

/** The products in scope, in configuration order; `repo` narrows to one. */
export function productsInScope(report: FlowReport, repo: string): FlowProduct[] {
  const products = report.topology?.products ?? [];
  if (!repo) return products;
  const narrowed = products.filter((product) =>
    product.repos.some((node) => node.repo === repo)
  );
  return narrowed.length > 0 ? narrowed : products;
}

/**
 * The repository whose own pull request cycle the lane shows: the one a reader
 * picked, else the contributing repository with work in flight, else the first
 * contributing one. The convergence repository is only the focus when it is
 * the only one configured.
 */
export function focusRepo(product: FlowProduct, picked: string): string {
  const nodes = product.repos;
  if (picked && nodes.some((node) => node.repo === picked)) return picked;
  const sources = nodes.filter((node) => node.role !== 'integration');
  const withWork = sources.find((node) => node.active_lots > 0);
  return withWork?.repo ?? sources[0]?.repo ?? nodes[0]?.repo ?? '';
}

/** What a repository's configured route requires at one station. */
export function routeWords(station: string, node: FlowRepoNode | undefined): string {
  if (!node) return '';
  const { kind, approvals, required_checks: checks } = node.route;
  if (station === 'review') {
    if (kind === 'unknown' || approvals === null) return 'Review requirement unknown';
    if (approvals === 0) return 'No approval required by configuration · pass-through';
    return `${approvals} approving review${approvals === 1 ? '' : 's'} required`;
  }
  if (station === 'gate') {
    if (kind === 'unknown' || checks === null) return 'Check requirement unknown';
    if (checks.length === 0)
      return kind === 'human_only'
        ? 'No checks required by configuration · human decision only'
        : 'No checks required by configuration · pass-through';
    return `${checks.length} required check${checks.length === 1 ? '' : 's'}`;
  }
  return '';
}

/** Where a repository's merges are proposed next, in the reader's words. */
export function pinWords(node: FlowRepoNode): string {
  if (node.pin_source === 'unknown') return 'Pin configuration unknown';
  if (node.pins_into.length === 0)
    return node.role === 'integration'
      ? 'Receives pinned contributions'
      : 'No configured consumer to pin into';
  const by = node.pin_source === 'declared' ? 'declared' : 'pin lock';
  return `Pins into ${node.pins_into.join(', ')} (${by})`;
}

/** Distinct work in words: one lot in one bucket, however many stations it is at. */
export function workWords(work: FlowWork): string {
  if (work.active_lots === 0) return 'No current work recorded';
  const parts = [
    work.changes ? `${work.changes} change${work.changes === 1 ? '' : 's'}` : '',
    work.pull_requests ? `${work.pull_requests} pull request${work.pull_requests === 1 ? '' : 's'}` : '',
    work.pin_pull_requests
      ? `${work.pin_pull_requests} pin pull request${work.pin_pull_requests === 1 ? '' : 's'}`
      : '',
    work.release_artifacts
      ? `${work.release_artifacts} release artifact${work.release_artifacts === 1 ? '' : 's'}`
      : ''
  ].filter(Boolean);
  return `${work.active_lots} in flight · ${parts.join(' · ')}`;
}

/** Why the convergence point of a product is not shown, or '' when it is. */
export function integrationWords(product: FlowProduct): string {
  if (product.integration)
    return `Contributions converge in ${product.integration}, which opens its own pull request for each pin.`;
  return 'No configured convergence point: no product declaration and no readable pin lock. The stations below stay inspectable.';
}

const REASON_WORDS: Record<string, string> = {
  no_configured_repository: 'no configured repository',
  declared_but_not_hosted: 'declared in configuration but not hosted here',
  no_declared_product: 'in no declared product',
  no_pin_lock_or_declaration: 'no declaration and no readable pin lock',
  no_release_route_configured: 'no configured release route',
  pin_lock_unreadable: 'its pin lock could not be read',
  protection_unreadable: 'its branch rule could not be read',
  visits_name_no_repository: 'recorded visits name no repository'
};

const FIELD_WORDS: Record<string, string> = {
  repositories: 'repositories',
  repository: 'repository',
  product: 'product',
  integration_repo: 'convergence point',
  release_repo: 'release route',
  pins_into: 'pin route',
  route: 'review and check route',
  lot_repository: 'work scope'
};

/** One sentence per gap in the configuration or the evidence behind it. */
export function coverageWords(report: FlowReport): string[] {
  const topology = report.topology;
  if (!topology) return [];
  const notes = topology.unknown.map(
    (note) =>
      `${note.scope}: ${FIELD_WORDS[note.field] ?? note.field} — ${
        REASON_WORDS[note.reason] ?? note.reason
      }`
  );
  if (topology.unscoped_active_lots > 0)
    notes.push(
      `${topology.unscoped_active_lots} recorded work item${
        topology.unscoped_active_lots === 1 ? '' : 's'
      } name no repository, so they are in no product total.`
    );
  if (topology.families_truncated)
    notes.push('More families are configured than this answer describes; pick a family scope.');
  return notes;
}

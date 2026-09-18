// ProposalsPage.tsx — Shared tools → Proposals: the decision step.
//
// Lists every tool in `jeryu-tool`'s registry grouped by lifecycle status.
// Proposed tools (filed from a Findings cluster) carry Approve / Reject for
// admins: approve moves the tool to building, reject removes it and ignores
// its origin cluster so the scan stops resurfacing it.

import { Check, GitPullRequestArrow, X } from 'lucide-react';

import { ActionButton } from '../components/action/ActionButton';
import { EmptyState, ErrorState, LoadingState } from '../components/state';
import { useAuth } from '../hooks/useAuth';
import { useDecideProposal, useToolRegistry } from '../hooks/useToolRegistry';
import type { ToolRegistryEntry } from '../api/types';
import { SharedToolsTabs } from './sharedTools/SharedToolsTabs';
import { formatCount } from './tools';
import './page.css';
import './sharedTools/SharedTools.css';

const GROUPS = [
  { status: 'proposed', title: 'Awaiting decision' },
  { status: 'building', title: 'Approved · building' },
  { status: 'published', title: 'Published' },
  { status: 'deprecated', title: 'Deprecated' },
] as const;

function ToolMeta({ tool }: { tool: ToolRegistryEntry }): JSX.Element {
  return (
    <span className="proposals__meta">
      <span className="page__pill">{tool.kind}</span>
      <span>
        {tool.adopting_repo_count} adopting · {tool.candidate_repo_count} candidate
        repos
      </span>
      <span>
        {formatCount(tool.loc_saved)} LOC saved
        {tool.loc_saved_estimate > 0
          ? ` · +${formatCount(tool.loc_saved_estimate)} anticipated`
          : ''}
      </span>
    </span>
  );
}

function ProposedTool({
  tool,
  canDecide,
}: {
  tool: ToolRegistryEntry;
  canDecide: boolean;
}): JSX.Element {
  const decide = useDecideProposal();
  const reject = (): void => {
    const reason = window.prompt(`Why reject ${tool.name}?`, '');
    if (reason === null) return;
    decide.mutate({ toolId: tool.id, decision: 'reject', reason });
  };
  return (
    <li className="proposals__item" data-testid={`proposal-${tool.id}`}>
      <span>
        <span className="proposals__name">{tool.name}</span> <ToolMeta tool={tool} />
      </span>
      {canDecide ? (
        <span className="proposals__actions">
          <ActionButton
            variant="primary"
            icon={<Check size={12} aria-hidden="true" />}
            disabled={decide.isPending}
            onClick={() => decide.mutate({ toolId: tool.id, decision: 'approve' })}
          >
            Approve
          </ActionButton>
          <ActionButton
            variant="ghost"
            icon={<X size={12} aria-hidden="true" />}
            disabled={decide.isPending}
            onClick={reject}
          >
            Reject
          </ActionButton>
        </span>
      ) : null}
      {decide.error ? (
        <span className="proposals__error" role="alert">
          {decide.error.message}
        </span>
      ) : null}
    </li>
  );
}

export function ProposalsPage(): JSX.Element {
  const registry = useToolRegistry();
  const { user } = useAuth();
  const canDecide = user?.role === 'admin';
  const tools = registry.data?.tools ?? [];

  return (
    <div className="page page--wide" data-testid="proposals-page">
      <header className="page__header">
        <h1 className="page__title">Shared tools</h1>
        <p className="page__subtitle">
          Shared tools proposed from Findings. Approving one starts its build;
          rejecting it drops the proposal and stops the scan from suggesting it
          again.
        </p>
      </header>
      <SharedToolsTabs />

      {registry.isPending ? (
        <LoadingState title="Loading proposals…" variant="message" />
      ) : registry.isError ? (
        <ErrorState title="Could not load the tool registry." error={registry.error} />
      ) : tools.length === 0 ? (
        <EmptyState
          icon={GitPullRequestArrow}
          title="No shared tools yet."
          description="Propose a cluster from Findings to file the first one."
        />
      ) : (
        GROUPS.map((group) => {
          const members = tools.filter((tool) => tool.status === group.status);
          if (members.length === 0) return null;
          return (
            <section
              key={group.status}
              className="proposals__group"
              aria-label={group.title}
            >
              <h2 className="page__section-title">
                {group.title} · {members.length}
              </h2>
              <ul className="proposals__list">
                {members.map((tool) =>
                  group.status === 'proposed' ? (
                    <ProposedTool key={tool.id} tool={tool} canDecide={canDecide} />
                  ) : (
                    <li
                      key={tool.id}
                      className="proposals__item"
                      data-testid={`proposal-${tool.id}`}
                    >
                      <span>
                        <span className="proposals__name">{tool.name}</span>{' '}
                        <ToolMeta tool={tool} />
                      </span>
                    </li>
                  )
                )}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

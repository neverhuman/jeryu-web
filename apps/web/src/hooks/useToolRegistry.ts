// useToolRegistry.ts — React Query hooks for the reusable-tool registry.
//
// `useToolRegistry` reads `GET /api/v1/tools/registry/summary`, the snapshot
// of `jeryu-tool`'s registry that powers Shared tools → Proposals.
// `useDecideProposal` approves or rejects a proposed tool. The summary may be
// absent on older backends, so it does not retry and consumers degrade to an
// empty state.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiGet, apiSend } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { ToolRegistrySummary } from '../api/types';

export function useToolRegistry(): UseQueryResult<ToolRegistrySummary, Error> {
  return useQuery({
    queryKey: ['tools', 'registry', 'summary'],
    queryFn: ({ signal }) =>
      apiGet<ToolRegistrySummary>(endpoints.toolRegistrySummary(), { signal }),
    staleTime: 30_000,
    // The endpoint may not exist yet (backend in parallel). A 404/network
    // miss is a permanent "not ready" signal for this surface, not a flake —
    // don't hammer it with retries; the box just renders null.
    retry: false,
  });
}

export type ProposalDecision = 'approve' | 'reject';

/** Receipt from `POST /api/v1/tool-finder/proposals/:tool_id/decision`. */
export interface ProposalDecisionReceipt {
  tool_id: string;
  decision: ProposalDecision;
  /** Status after the decision; `null` once a rejected proposal is removed. */
  status: string | null;
  removed_tasks: string[];
  decided_by: string;
}

/** Approve (→ building) or reject (removed + cluster ignored) a proposal. */
export function useDecideProposal(): UseMutationResult<
  ProposalDecisionReceipt,
  Error,
  { toolId: string; decision: ProposalDecision; reason?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ toolId, decision, reason }) =>
      apiSend<ProposalDecisionReceipt>(endpoints.toolProposalDecision(toolId), {
        decision,
        reason,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tools', 'registry'] });
      void queryClient.invalidateQueries({ queryKey: ['tool-finder', 'dashboard'] });
    },
  });
}

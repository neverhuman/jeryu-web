// useQualityGate.ts — React Query hooks for the quality-gate observation
// contract (`/api/v1/quality-gate/*`).
//
// The gate is watched before it is required, so these reads are plain
// observation: how often `jankurai/proof` would have blocked a push, which
// rules did it, and what each finding actually points at. A server that
// predates the contract answers 404 (or the SPA shell); `isPipelineUnavailable`
// recognises both, so every surface says "not available on this server
// version" instead of erroring. Nothing retries: an older server stays older.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { ApiError, apiSend, apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  QualityGateDisputeRequest,
  QualityGateDisputeResponse,
  QualityGateHeadDetail,
  QualityGateOverview,
  QualityGateRuleDetail,
} from '../api/types';

export const QUALITY_GATE_KEY = ['quality-gate'] as const;

/** Days of history every quality-gate read asks for. */
export const QUALITY_GATE_WINDOW_DAYS = 30;

export function qualityGateHeadQueryKey(
  repo: string,
  sha: string
): readonly unknown[] {
  return [...QUALITY_GATE_KEY, 'head', repo, sha];
}

/** Fail rate, would-have-blocked count, per-rule and per-repo tables, history. */
export function useQualityGateOverview(
  days = QUALITY_GATE_WINDOW_DAYS
): UseQueryResult<QualityGateOverview, Error> {
  return useQuery({
    queryKey: [...QUALITY_GATE_KEY, 'overview', days],
    queryFn: ({ signal }) =>
      apiGet<QualityGateOverview>(endpoints.qualityGateOverview(days), { signal }),
    staleTime: 30_000,
    retry: false,
  });
}

/** Every head one rule flagged in the window. */
export function useQualityGateRule(
  rule: string,
  days = QUALITY_GATE_WINDOW_DAYS
): UseQueryResult<QualityGateRuleDetail, Error> {
  return useQuery({
    queryKey: [...QUALITY_GATE_KEY, 'rule', rule, days],
    queryFn: ({ signal }) =>
      apiGet<QualityGateRuleDetail>(endpoints.qualityGateRule(rule, days), { signal }),
    enabled: rule !== '',
    staleTime: 30_000,
    retry: false,
  });
}

/** One scored head: the score against the floor, and every finding on it. */
export function useQualityGateHead(
  repo: string,
  sha: string
): UseQueryResult<QualityGateHeadDetail, Error> {
  return useQuery({
    queryKey: qualityGateHeadQueryKey(repo, sha),
    queryFn: ({ signal }) =>
      apiGet<QualityGateHeadDetail>(endpoints.qualityGateHead(repo, sha), { signal }),
    enabled: repo !== '' && sha !== '',
    staleTime: 30_000,
    retry: false,
  });
}

export interface DisputeFindingVariables {
  findingId: string;
  reason: string;
}

/**
 * Record that a finding looks wrong (admin-only). The server answers with the
 * finding as it now stands; we write that back into the head detail so the row
 * updates without a second round-trip, and still refresh the overview, whose
 * dispute rates the vote changes.
 */
export function useDisputeFinding(
  repo: string,
  sha: string
): UseMutationResult<QualityGateDisputeResponse, ApiError, DisputeFindingVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, reason }: DisputeFindingVariables) => {
      const body: QualityGateDisputeRequest = { reason };
      return apiSend<QualityGateDisputeResponse>(
        endpoints.qualityGateDispute(findingId),
        body
      );
    },
    onSuccess: (data) => {
      queryClient.setQueryData<QualityGateHeadDetail>(
        qualityGateHeadQueryKey(repo, sha),
        (current) =>
          current
            ? {
                ...current,
                findings: current.findings.map((finding) =>
                  finding.id === data.finding.id ? data.finding : finding
                ),
              }
            : current
      );
      void queryClient.invalidateQueries({
        queryKey: [...QUALITY_GATE_KEY, 'overview'],
      });
    },
  });
}

// useReportIncident.ts — `POST /api/v1/incidents` mutation. The caller mints
// the `incident_id` once per form and sends it on every attempt, so a retry
// after a dropped answer names the same incident instead of opening a second.

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { apiSend, type ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { IncidentReportRequest, IncidentReportResponse } from '../api/types';

export function useReportIncident(): UseMutationResult<
  IncidentReportResponse,
  ApiError,
  IncidentReportRequest
> {
  return useMutation({
    mutationFn: (body: IncidentReportRequest) =>
      apiSend<IncidentReportResponse>(endpoints.incidents(), body),
  });
}

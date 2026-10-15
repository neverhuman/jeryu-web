import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client';
import type {
  FlowHistory,
  FlowHistoryQuery,
  FlowLayout
} from '../../api/types/flow';
import { OPERATOR_REFRESH } from '../../hooks/refreshPolicy';

export function useFlowHistory(query: FlowHistoryQuery, enabled = true) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return useQuery({
    queryKey: ['flow-history', query],
    enabled,
    queryFn: ({ signal }) =>
      apiGet<FlowHistory>(`/api/v1/flow/history?${params}`, { signal }),
    ...OPERATOR_REFRESH,
    retry: false
  });
}
export function useFlowLayout() {
  return useQuery({
    queryKey: ['flow-layout'],
    queryFn: ({ signal }) =>
      apiGet<FlowLayout>('/api/v1/flow/layout', { signal }),
    ...OPERATOR_REFRESH,
    retry: false
  });
}

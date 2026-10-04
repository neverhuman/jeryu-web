// useShift.ts — React Query hooks for the Shift API (`/api/v1/shift/*`).
//
// Reads (families, todos, shifts, workers, history) need any logged-in user;
// every mutation is admin-only server-side. Queue writes invalidate the todo
// and shift lists so the Queue tab reflects the new queue commit, and the
// pipeline reads with them: parking, closing or acknowledging a todo settles
// what "Needs you" says about it.

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiGet, apiSend } from '../api/client';
import { PIPELINE_KEY } from './usePipeline';
import { endpoints } from '../api/endpoints';
import type {
  CreateShiftTodoRequest,
  CreateShiftTodosBulkRequest,
  OpenShiftPrResponse,
  ShiftFamiliesResponse,
  ShiftShiftsResponse,
  ShiftTodo,
  ShiftTodoActionRequest,
  ShiftTodosBulkResponse,
  ShiftTodosResponse,
  ShiftWorkersHistoryResponse,
  ShiftWorkersResponse,
} from '../api/types';

const SHIFT_KEY = ['shift'] as const;

export function useShiftFamilies(): UseQueryResult<ShiftFamiliesResponse, Error> {
  return useQuery({
    queryKey: [...SHIFT_KEY, 'families'],
    queryFn: ({ signal }) =>
      apiGet<ShiftFamiliesResponse>(endpoints.shiftFamilies(), { signal }),
    staleTime: 60_000,
    retry: false,
  });
}

export function useShiftTodos(
  family: string | undefined
): UseQueryResult<ShiftTodosResponse, Error> {
  return useQuery({
    queryKey: [...SHIFT_KEY, 'todos', family ?? ''],
    queryFn: ({ signal }) =>
      apiGet<ShiftTodosResponse>(endpoints.shiftTodos({ family }), { signal }),
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useShiftShifts(
  family: string | undefined
): UseQueryResult<ShiftShiftsResponse, Error> {
  return useQuery({
    queryKey: [...SHIFT_KEY, 'shifts', family ?? ''],
    queryFn: ({ signal }) =>
      apiGet<ShiftShiftsResponse>(endpoints.shiftShifts(family), { signal }),
    staleTime: 10_000,
    // A review PR opened by a worker or by `todoq shift pr` shows up on its own.
    refetchInterval: 30_000,
    retry: false,
  });
}

/** One family's shift branches, tagged with the family they belong to. */
export interface FamilyShifts {
  family: string;
  shifts: ShiftShiftsResponse['shifts'];
}

/**
 * Shift branches of several families at once. A branch carries no family of
 * its own, and two families share branch names (`nightshift/2026-09-18`), so
 * "every family" is one request per family, in parallel, each kept apart.
 */
export function useShiftShiftsByFamily(families: string[]): {
  data: FamilyShifts[];
  isPending: boolean;
  error: Error | null;
} {
  const results = useQueries({
    queries: families.map((family) => ({
      queryKey: [...SHIFT_KEY, 'shifts', family],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiGet<ShiftShiftsResponse>(endpoints.shiftShifts(family), { signal }),
      staleTime: 10_000,
      // A review PR opened by a worker or by `todoq shift pr` shows up on its own.
      refetchInterval: 30_000,
      retry: false,
    })),
  });
  return {
    data: results.flatMap((result, index) =>
      result.data ? [{ family: families[index] ?? '', shifts: result.data.shifts }] : []
    ),
    isPending: results.some((result) => result.isPending),
    error: results.find((result) => result.error)?.error ?? null,
  };
}

export function useShiftWorkers(): UseQueryResult<ShiftWorkersResponse, Error> {
  return useQuery({
    queryKey: [...SHIFT_KEY, 'workers'],
    queryFn: ({ signal }) =>
      apiGet<ShiftWorkersResponse>(endpoints.shiftWorkers(), { signal }),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useShiftWorkersHistory(
  hours: number
): UseQueryResult<ShiftWorkersHistoryResponse, Error> {
  return useQuery({
    queryKey: [...SHIFT_KEY, 'workers-history', hours],
    queryFn: ({ signal }) =>
      apiGet<ShiftWorkersHistoryResponse>(endpoints.shiftWorkersHistory(hours), {
        signal,
      }),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });
}

export type FileShiftTodosInput =
  | ({ kind: 'single' } & CreateShiftTodoRequest)
  | ({ kind: 'bulk' } & CreateShiftTodosBulkRequest);

/** File one todo or many; always resolves to the list of filed todos. */
export function useFileShiftTodos(): UseMutationResult<
  ShiftTodo[],
  Error,
  FileShiftTodosInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, ...body }) => {
      if (kind === 'single') {
        return [await apiSend<ShiftTodo>(endpoints.shiftTodos(), body)];
      }
      const res = await apiSend<ShiftTodosBulkResponse>(endpoints.shiftTodos(), body);
      return res.todos;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...SHIFT_KEY, 'todos'] });
    },
  });
}

export function useShiftTodoAction(): UseMutationResult<
  ShiftTodo,
  Error,
  { family: string; id: string } & ShiftTodoActionRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ family, id, ...body }) =>
      apiSend<ShiftTodo>(endpoints.shiftTodoAction(family, id), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...SHIFT_KEY, 'todos'] });
      void queryClient.invalidateQueries({ queryKey: PIPELINE_KEY });
    },
  });
}

export function useOpenShiftPr(): UseMutationResult<
  OpenShiftPrResponse,
  Error,
  { family: string; branch: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ family, branch }) =>
      apiSend<OpenShiftPrResponse>(endpoints.shiftOpenPr(family), { branch }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...SHIFT_KEY, 'shifts'] });
    },
  });
}

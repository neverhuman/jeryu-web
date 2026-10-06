// useRunnerChangeNudge.ts — refetch when a runner starts or finishes a pass.
//
// The forge pushes `runner.changed` on scope `runners` (for /runners) and on
// `repo.<owner>.<name>` (for that repository's pages) whenever a heartbeat
// starts or finishes a gate or review. The frame is a nudge: the page refetches
// its own query, and keeps polling as it did without it.
//
// Only a forge that publishes these frames also sends `serverTime`, so callers
// enable the nudge once an answer carried it. An older forge never sees a
// subscription to a scope it does not know.

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useRealtimeStore } from '../stores/realtimeStore';
import { useRealtime } from './useRealtime';

export const RUNNERS_SCOPE = 'runners';
const RUNNER_CHANGED = 'runner.changed';

/** `repo.<owner>.<name>` for an `owner/name`, or null for anything else. */
export function repoScope(fullName: string): string | null {
  const [owner, name, ...rest] = fullName.split('/');
  if (!owner || !name || rest.length > 0) return null;
  return `repo.${owner}.${name}`;
}

export function useRunnerChangeNudge(
  scope: string | null,
  queryKey: readonly unknown[],
  enabled: boolean
): void {
  const queryClient = useQueryClient();
  // The caller may build the key inline; a ref keeps the subscription stable.
  const keyRef = useRef(queryKey);
  useEffect(() => {
    keyRef.current = queryKey;
  });
  const live = enabled && scope !== null;
  useRealtime(live ? [scope] : []);
  useEffect(() => {
    if (!live) return () => {};
    return useRealtimeStore.getState().addInvalidator((event) => {
      if (event.scope === scope && event.kind === RUNNER_CHANGED) {
        void queryClient.invalidateQueries({ queryKey: keyRef.current });
      }
    });
  }, [live, scope, queryClient]);
}

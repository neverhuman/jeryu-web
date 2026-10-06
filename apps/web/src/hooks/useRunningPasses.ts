// useRunningPasses.ts — the running gate passes per repository, kept live.

import { useMemo } from 'react';

import {
  runningPassesByRepo,
  type RunningPassesValue,
} from '../components/ciProgress/runningPasses';
import { CONTROL_PLANE_RUNNERS_QUERY_KEY, useControlPlaneRunners } from './useControlPlaneRunners';
import { RUNNERS_SCOPE, useRunnerChangeNudge } from './useRunnerChangeNudge';
import { useServerNow } from './useServerNow';

export function useRunningPasses(): RunningPassesValue {
  const runners = useControlPlaneRunners();
  const passes = useMemo(() => runningPassesByRepo(runners.data), [runners.data]);
  useRunnerChangeNudge(
    RUNNERS_SCOPE,
    CONTROL_PLANE_RUNNERS_QUERY_KEY,
    Boolean(runners.data?.serverTime)
  );
  const nowMs = useServerNow(runners.data?.serverTime, runners.dataUpdatedAt, passes.size > 0);
  return useMemo(() => ({ passes, nowMs }), [passes, nowMs]);
}

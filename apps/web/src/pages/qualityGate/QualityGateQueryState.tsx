// QualityGateQueryState.tsx — the three non-data states of a quality-gate read:
// the server predates the contract, the viewer may not see it, or it failed.

import { ServerOff } from 'lucide-react';

import {
  EmptyState,
  ErrorState,
  PermissionDeniedState,
} from '../../components/state';
import { isPipelineForbidden, isPipelineUnavailable } from '../../hooks/usePipeline';

export function QualityGateQueryState({
  what,
  error,
}: {
  /** What failed to load, e.g. "the quality gate overview". */
  what: string;
  error: unknown;
}): JSX.Element {
  if (isPipelineUnavailable(error)) {
    return (
      <EmptyState
        icon={ServerOff}
        title="Not available on this server version."
        description={`This server does not serve ${what} yet. It appears once the forge is released with the quality gate API.`}
      />
    );
  }
  if (isPipelineForbidden(error)) {
    return (
      <PermissionDeniedState
        title={`Only admins can see ${what}.`}
        description="Findings quote source lines from private repositories, so the scores behind the gate are admin-only for now."
      />
    );
  }
  return <ErrorState title={`Could not load ${what}.`} error={error} />;
}

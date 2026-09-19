// PipelineQueryState.tsx — the three non-data states of a pipeline read
// (`/api/v1/attention`, `/api/v1/events`): the server predates the contract,
// the viewer is not an admin, or the request failed.

import { ServerOff } from 'lucide-react';

import { isPipelineForbidden, isPipelineUnavailable } from '../../hooks/usePipeline';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { PermissionDeniedState } from './PermissionDeniedState';

export interface PipelineQueryStateProps {
  /** What failed to load, e.g. "the activity feed". */
  what: string;
  error: unknown;
}

export function PipelineQueryState({ what, error }: PipelineQueryStateProps): JSX.Element {
  if (isPipelineUnavailable(error)) {
    return (
      <EmptyState
        icon={ServerOff}
        title="Not available on this server version."
        description={`This server does not serve ${what} yet. It appears once the forge is released with the pipeline visibility API.`}
      />
    );
  }
  if (isPipelineForbidden(error)) {
    return (
      <PermissionDeniedState
        title={`Only admins can see ${what}.`}
        description="Pipeline events and attention items carry titles and notes from private repositories, so they are admin-only for now."
      />
    );
  }
  return <ErrorState title={`Could not load ${what}.`} error={error} />;
}

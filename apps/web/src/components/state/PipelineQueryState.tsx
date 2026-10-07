// PipelineQueryState.tsx — the three non-data states of a pipeline read
// (`/api/v1/attention`, `/api/v1/events`): the server predates the contract,
// the viewer is not an admin, or the request failed.
//
// A failed request is the one state that can come right on its own, so pass
// `onRetry` (the query's `refetch`) and the surface offers a Retry button
// instead of leaving a reload as the only way forward. A request that never
// reached the forge is named as that, in plain words: the browser's "Failed
// to fetch" says nothing a reader can act on.

import { ServerOff } from 'lucide-react';

import {
  isPipelineForbidden,
  isPipelineUnavailable,
  isPipelineUnreachable,
} from '../../hooks/usePipeline';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { PermissionDeniedState } from './PermissionDeniedState';

export interface PipelineQueryStateProps {
  /** What failed to load, e.g. "the activity feed". */
  what: string;
  error: unknown;
  /** Asks for the read again; renders a Retry button when given. */
  onRetry?: () => void;
}

export function PipelineQueryState({ what, error, onRetry }: PipelineQueryStateProps): JSX.Element {
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
  if (isPipelineUnreachable(error)) {
    // No code and no request id: the request has no answer to quote.
    return (
      <ErrorState
        title="Cannot reach the forge."
        description={`The request for ${what} did not arrive. The forge may be restarting, or this browser may be offline.`}
        onRetry={onRetry}
      />
    );
  }
  return <ErrorState title={`Could not load ${what}.`} error={error} onRetry={onRetry} />;
}

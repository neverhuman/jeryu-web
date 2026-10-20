// FlowQueryState.tsx — the non-data states of a Flow read: older server, not an
// admin, unreachable, failed. Shared by Live and Layout.

import { ServerOff } from 'lucide-react';

import { EmptyState, ErrorState, PermissionDeniedState } from '../../components/state';
import {
  isPipelineForbidden,
  isPipelineUnavailable,
  isPipelineUnreachable,
} from '../../hooks/usePipeline';

/** The non-data states: older server, not an admin, unreachable, failed. */
export function FlowQueryState({ error, onRetry }: { error: unknown; onRetry: () => void }): JSX.Element {
  if (isPipelineUnavailable(error)) {
    return (
      <EmptyState
        icon={ServerOff}
        title="Not available on this server version."
        description="This server does not report the delivery line yet. It appears once the forge is released with the flow API."
      />
    );
  }
  if (isPipelineForbidden(error)) {
    return (
      <PermissionDeniedState
        title="Only admins can see the delivery line."
        description="The line is read from every family's events, so it is admin-only for now."
      />
    );
  }
  if (isPipelineUnreachable(error)) {
    return (
      <ErrorState
        title="Cannot reach the forge."
        description="The request for the delivery line did not arrive. The forge may be restarting, or this browser may be offline."
        onRetry={onRetry}
      />
    );
  }
  return <ErrorState title="Could not load the delivery line." error={error} onRetry={onRetry} />;
}

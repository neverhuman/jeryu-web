// shiftCommon.tsx — error helpers shared by the Shift tabs. Which family the
// page shows is the shell's family scope (components/family/familyScope.ts).

import { ApiError } from '../../api/client';
import { ErrorState, PermissionDeniedState } from '../../components/state';

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 401);
}

/** Error surface that turns a 401/403 into the permission state. */
export function ShiftError({ title, error }: { title: string; error: unknown }): JSX.Element {
  if (isForbidden(error)) {
    return (
      <PermissionDeniedState
        title="You don't have access to the shift queue."
        description="Sign in with a jeryu account to view shifts and workers."
      />
    );
  }
  return <ErrorState title={title} error={error} />;
}

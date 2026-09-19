// shiftCommon.tsx — family selection + state helpers shared by the Shift tabs.

import { useSearchParams } from 'react-router-dom';

import { ApiError } from '../../api/client';
import type { ShiftFamily } from '../../api/types';
import { ErrorState, PermissionDeniedState } from '../../components/state';

/** `?family=` when it names a known family, otherwise the first family. */
export function useSelectedFamily(families: ShiftFamily[]): {
  family: ShiftFamily | undefined;
  setFamily: (name: string) => void;
} {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('family');
  const family = families.find((f) => f.name === wanted) ?? families[0];
  const setFamily = (name: string): void => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('family', name);
        next.delete('todo');
        return next;
      },
      { replace: true }
    );
  };
  return { family, setFamily };
}

export function FamilyPicker({
  families,
  value,
  onChange,
}: {
  families: ShiftFamily[];
  value: string | undefined;
  onChange: (name: string) => void;
}): JSX.Element {
  return (
    <label>
      Family
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        {families.map((family) => (
          <option key={family.name} value={family.name}>
            {family.name}
          </option>
        ))}
      </select>
    </label>
  );
}

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

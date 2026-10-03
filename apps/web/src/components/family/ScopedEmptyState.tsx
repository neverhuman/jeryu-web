// ScopedEmptyState.tsx — "there is nothing here for this family", on every page
// that the family scope narrows.
//
// A scoped page with nothing to show must not read as an outage: it says which
// family it is empty for and offers the one click back to every family. With no
// family in scope it is the page's own empty state, word for word.

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { ActionButton } from '../action/ActionButton';
import { EmptyState } from '../state';
import { useFamilyScope } from './FamilyScopeProvider';

export function ScopedEmptyState({
  title,
  description,
  icon,
  action,
}: {
  /** What the page says when every family is in scope. */
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** The page's own way out of its empty state, offered beside this one. */
  action?: ReactNode;
}): JSX.Element {
  const scope = useFamilyScope();
  if (!scope.active) {
    return <EmptyState icon={icon} title={title} description={description} action={action} />;
  }
  return (
    <EmptyState
      icon={icon}
      title={`Nothing for ${scope.label} here`}
      description={description}
      action={
        <>
          <ActionButton
            variant="ghost"
            onClick={() => scope.clearFamily()}
            data-testid="family-scope-show-all"
          >
            Show all families
          </ActionButton>
          {action}
        </>
      }
    />
  );
}

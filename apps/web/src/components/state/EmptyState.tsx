// EmptyState.tsx — empty-collection surface ("nothing here yet") (W-CC-02).

import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import './state.css';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  /** `data-testid` for the surface, so a page keeps its own test handle. */
  testId?: string;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  testId,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={`state-block ${className ?? ''}`.trim()}
      role="status"
      data-testid={testId}
    >
      <span className="state-block__icon">
        <Icon aria-hidden="true" size={20} />
      </span>
      <h2 className="state-block__title">{title}</h2>
      {description ? (
        <p className="state-block__description">{description}</p>
      ) : null}
      {action ? <div className="state-block__action">{action}</div> : null}
    </div>
  );
}

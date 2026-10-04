// ErrorState.tsx — recoverable failure surface (W-CC-02).
//
// Pass `error` for an ApiError or generic Error; the component pulls `code`
// and `requestId` for debugging when available.
//
// Both lines can carry server ids (a message naming a repository by UUID, a
// request id): they are rendered short, with the whole line in the `title` so
// it can be read and copied.
//
// Pass `onRetry` when the read behind the failure can be asked for again
// (usually a query's `refetch`): the surface then offers a Retry button, so a
// failed page is recoverable without a reload.

import { AlertTriangle, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';

import { ApiError } from '../../api/client';
import { fullIdTitle, shortenIds } from '../identifiers/shortId';

import './state.css';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: unknown;
  /** Asks for the failed read again; renders a Retry button when given. */
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
  /** `data-testid` for the surface, so a page keeps its own test handle. */
  testId?: string;
}

export function ErrorState({
  title = 'Something went wrong.',
  description,
  error,
  onRetry,
  action,
  className,
  testId,
}: ErrorStateProps): JSX.Element {
  let derivedDescription = description;
  let detail: string | null = null;
  if (error instanceof ApiError) {
    derivedDescription = derivedDescription ?? error.message;
    detail = error.requestId
      ? `${error.code} · request ${error.requestId}`
      : error.code;
  } else if (error instanceof Error) {
    derivedDescription = derivedDescription ?? error.message;
  }
  return (
    <div
      className={`state-block ${className ?? ''}`.trim()}
      role="alert"
      data-testid={testId}
    >
      <span className="state-block__icon state-block__icon--danger">
        <AlertTriangle aria-hidden="true" size={20} />
      </span>
      <h2 className="state-block__title">{title}</h2>
      {derivedDescription ? (
        <p
          className="state-block__description"
          title={fullIdTitle(derivedDescription)}
        >
          {shortenIds(derivedDescription)}
        </p>
      ) : null}
      {detail ? (
        <p className="state-block__details" title={fullIdTitle(detail)}>
          {shortenIds(detail)}
        </p>
      ) : null}
      {onRetry || action ? (
        <div className="state-block__action">
          {onRetry ? (
            <button
              type="button"
              className="state-block__retry"
              onClick={onRetry}
            >
              <RotateCw aria-hidden="true" size={14} />
              Retry
            </button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

// NotFoundPage.tsx — 404 (W-FE-15).

import { useNavigate, useLocation } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';

import { ActionButton } from '../components/action/ActionButton';
import { EmptyState } from '../components/state';
import { usePageTitle } from '../hooks/usePageTitle';

import './page.css';

/** A retired page that docs still link to: the 404 names where it went. */
export interface MovedTo {
  what: string;
  label: string;
  to: string;
}

export function NotFoundPage({ movedTo }: { movedTo?: MovedTo } = {}): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  usePageTitle('Page not found');
  if (movedTo) {
    return (
      <div className="page">
        <EmptyState
          icon={MapPinOff}
          title="Page not found"
          description={`${location.pathname} no longer has its own page. ${movedTo.what}`}
          action={
            <ActionButton variant="primary" onClick={() => navigate(movedTo.to)}>
              {movedTo.label}
            </ActionButton>
          }
        />
      </div>
    );
  }
  return (
    <div className="page">
      <EmptyState
        icon={MapPinOff}
        title="Page not found"
        description={`We couldn't find ${location.pathname}. The link may be outdated, or the resource may have been moved.`}
        action={
          <ActionButton variant="primary" onClick={() => navigate('/')}>
            Back to home
          </ActionButton>
        }
      />
    </div>
  );
}

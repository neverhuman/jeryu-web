// AdminSettingsPage.tsx — the Settings page, for every role.
//
// Theme preferences and the session are everyone's; the internal wiki choice,
// users, the waitlist and per-repository access are the administrator's and are the only
// parts an administrator sees more of, so the page says whose settings these
// are rather than promising admin controls to a reader who has none.

import { LogOut, Moon, Monitor, Sun, ToggleRight } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { apiDelete, apiGet, apiSend } from '../api/client';
import { endpoints } from '../api/endpoints';
import { ActionButton } from '../components/action/ActionButton';
import { pillClass } from '../components/tone/tone';
import { ErrorState, LoadingState } from '../components/state';
import { useAuth } from '../hooks/useAuth';
import { AccessTokensPanel } from './AccessTokensPanel';
import { AdminUsersPanel } from './AdminUsersPanel';
import { AdminWaitlistPanel } from './AdminWaitlistPanel';
import { AgentProvidersPanel } from './AgentProvidersPanel';
import { InternalWikiPanel } from './InternalWikiPanel';
import { EmailSection } from './account/EmailSection';
import { ConnectAgentDoc } from './bots/ConnectAgentDoc';
import {
  usePreferencesStore,
  type ThemePreference,
} from '../stores/preferencesStore';
import { PageHeader } from '../components/pageHeader';
import { usePageTitle } from '../hooks/usePageTitle';

import './page.css';

interface NavGroup {
  title: string;
  items: { id: string; label: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Account',
    items: [
      { id: 'settings-email', label: 'Email' },
      { id: 'settings-theme', label: 'Theme' },
      { id: 'settings-session', label: 'Session' },
    ],
  },
  {
    title: 'Agents and access',
    items: [
      { id: 'settings-connect-agent', label: 'Connect an agent' },
      { id: 'settings-providers', label: 'Agent providers' },
      { id: 'settings-tokens', label: 'Access tokens' },
    ],
  },
];

const ADMIN_NAV_GROUP: NavGroup = {
  title: 'Administration',
  items: [
    { id: 'settings-wiki', label: 'Internal wiki' },
    { id: 'settings-users', label: 'Users' },
    { id: 'settings-waitlist', label: 'Waitlist' },
    { id: 'settings-repo-access', label: 'Repository access' },
  ],
};

export function AdminSettingsPage(): JSX.Element {
  usePageTitle('Settings');
  const theme = usePreferencesStore((s) => s.theme);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const groups = isAdmin ? [...NAV_GROUPS, ADMIN_NAV_GROUP] : NAV_GROUPS;

  return (
    <div className="page" data-testid="settings-page">
      <PageHeader
        title="Settings"
        subtitle={
          isAdmin
            ? 'Your preferences, plus the instance settings and account access controls.'
            : 'Your preferences and this session.'
        }
        testId="settings-header"
      >
        <div className="page__inline-actions">
          <span className={pillClass('unknown')}>Theme preferences</span>
        </div>
      </PageHeader>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections" data-testid="settings-nav">
          {groups.map((group) => (
            <div key={group.title} className="settings-nav__group">
              <p className="settings-nav__title">{group.title}</p>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="settings-content">
          <div id="settings-account" className="settings-group">
            <h2 className="settings-group__title">Account</h2>
            <div id="settings-email">
              <EmailSection />
            </div>
            <section className="page__section" aria-labelledby="theme-section" id="settings-theme">
              <h2 className="page__section-title" id="theme-section">
                Theme
              </h2>
              <div className="page__inline-actions" role="radiogroup">
                <ThemeButton value="system" current={theme} label="System" icon={<Monitor size={14} />} onSelect={setTheme} />
                <ThemeButton value="light" current={theme} label="Light" icon={<Sun size={14} />} onSelect={setTheme} />
                <ThemeButton value="dark" current={theme} label="Dark" icon={<Moon size={14} />} onSelect={setTheme} />
                <ThemeButton value="high-contrast" current={theme} label="High contrast" icon={<ToggleRight size={14} />} onSelect={setTheme} />
              </div>
            </section>
            <div id="settings-session">
              <SessionPanel login={user?.login ?? null} />
            </div>
          </div>

          <div id="settings-access" className="settings-group">
            <h2 className="settings-group__title">Agents and access</h2>
            <section
              className="page__section"
              aria-labelledby="connect-agent-section"
              data-testid="settings-connect-agent"
              id="settings-connect-agent"
            >
              <h2 className="page__section-title" id="connect-agent-section">
                Connect an agent
              </h2>
              <ConnectAgentDoc testId="settings-connect-doc" />
              <p className="page__note">
                Enroll the agent and create its token on <Link to="/bots">Agents</Link>.
              </p>
            </section>
            <div id="settings-providers">
              <AgentProvidersPanel />
            </div>
            <div id="settings-tokens">
              <AccessTokensPanel />
            </div>
          </div>

          {isAdmin ? (
            <div id="settings-admin" className="settings-group">
              <h2 className="settings-group__title">Administration</h2>
              <div id="settings-wiki">
                <InternalWikiPanel />
              </div>
              <div id="settings-users">
                <AdminUsersPanel />
              </div>
              <div id="settings-waitlist">
                <AdminWaitlistPanel />
              </div>
              <div id="settings-repo-access">
                <RepoAccessPanel />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The last thing on the page: who is logged in, and the way out. */
function SessionPanel({ login }: { login: string | null }): JSX.Element {
  const { logout } = useAuth();
  return (
    <section className="page__section" aria-labelledby="session-section">
      <h2 className="page__section-title" id="session-section">
        Session
      </h2>
      <div className="page__inline-actions">
        <span className="page__pill">{login ? `Logged in as ${login}` : 'Logged in'}</span>
        <ActionButton
          actionId="auth.logout"
          variant="human"
          icon={<LogOut size={14} aria-hidden="true" />}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          Log out
        </ActionButton>
      </div>
      {logout.error ? <ErrorState title="Could not log out." error={logout.error} /> : null}
    </section>
  );
}

type AccessLevel = 'read' | 'write' | 'admin';

interface RepoAccessGrant {
  login: string;
  owner: string;
  repo: string;
  access: AccessLevel;
  granted_by: string;
  granted_at: string;
}

/**
 * Who can reach one repository, with a way to take access back. Granting is
 * the secondary action: a small form under the list, not the page's headline.
 */
function RepoAccessPanel(): JSX.Element {
  const queryClient = useQueryClient();
  // No repository is assumed: which one an administrator wants is theirs to say.
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [login, setLogin] = useState('');
  const [access, setAccess] = useState<AccessLevel>('read');
  const hasRepo = owner.trim() !== '' && repo.trim() !== '';
  const grantsKey = ['admin', 'repo-grants', owner, repo];
  const grants = useQuery({
    queryKey: grantsKey,
    enabled: hasRepo,
    queryFn: ({ signal }) =>
      apiGet<RepoAccessGrant[]>(endpoints.adminRepoGrants(owner, repo), { signal }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: grantsKey });
  const grant = useMutation({
    mutationFn: () =>
      apiSend(endpoints.adminRepoGrant(owner, repo, login.trim()), { access }),
    onSuccess: () => {
      setLogin('');
      return refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (target: string) => apiDelete(endpoints.adminRepoGrant(owner, repo, target)),
    onSuccess: refresh,
  });
  const rows = grants.data ?? [];
  const grantHint = !hasRepo
    ? 'Name an owner and a repository above to grant access.'
    : login.trim() === ''
      ? 'Enter a user to grant access.'
      : null;

  return (
    <section className="page__section" aria-labelledby="repo-access">
      <h2 className="page__section-title" id="repo-access">
        Repository access
      </h2>
      <div className="admin-grant-grid">
        <label>
          Owner
          <input value={owner} onChange={(event) => setOwner(event.currentTarget.value)} />
        </label>
        <label>
          Repo
          <input value={repo} onChange={(event) => setRepo(event.currentTarget.value)} />
        </label>
      </div>
      {!hasRepo ? (
        <p className="page__roadmap-note">
          Name an owner and a repository to see who can reach it.
        </p>
      ) : grants.isPending ? (
        <LoadingState title="Loading access..." variant="message" />
      ) : grants.error ? (
        <ErrorState title="Could not load access" error={grants.error} />
      ) : (
        <div className="page__card">
          {rows.length === 0 ? (
            <p className="page__roadmap-note">
              No one has been granted access to {owner}/{repo}.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="admin-users__table" data-testid="repo-grants-table">
                <thead>
                  <tr>
                    <th scope="col">User</th>
                    <th scope="col">Access</th>
                    <th scope="col">Granted by</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <tr key={entry.login}>
                      <th scope="row">{entry.login}</th>
                      <td>
                        <span className="page__pill">{entry.access}</span>
                      </td>
                      <td>{entry.granted_by}</td>
                      <td className="admin-users__actions">
                        <ActionButton
                          actionId="admin.revoke_repo"
                          variant="human"
                          aria-label={`Revoke ${entry.login}`}
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(entry.login)}
                        >
                          Revoke
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {revoke.error ? (
            <ErrorState title="Could not revoke access" error={revoke.error} />
          ) : null}
        </div>
      )}
      <form
        className="page__card"
        aria-label="Grant access"
        onSubmit={(event) => {
          event.preventDefault();
          grant.mutate();
        }}
      >
        <div className="admin-grant-grid">
          <label>
            <span>
              User <span aria-hidden="true">*</span>
            </span>
            <input required aria-required="true" value={login} onChange={(event) => setLogin(event.currentTarget.value)} />
          </label>
          <div className="admin-grant-access">
            <span>Access</span>
            <div className="page__inline-actions" role="radiogroup" aria-label="Access">
              {(['read', 'write', 'admin'] as const).map((value) => (
                <ActionButton
                  key={value}
                  type="button"
                  variant={access === value ? 'primary' : 'default'}
                  role="radio"
                  aria-checked={access === value}
                  onClick={() => setAccess(value)}
                >
                  {value}
                </ActionButton>
              ))}
            </div>
          </div>
        </div>
        <div className="page__inline-actions">
          <ActionButton
            type="submit"
            variant="default"
            disabled={!hasRepo || login.trim() === '' || grant.isPending}
          >
            Grant access
          </ActionButton>
          {grantHint ? <span className="page__note">{grantHint}</span> : null}
          {grant.isSuccess ? <span className="page__pill page__pill--success">Granted</span> : null}
        </div>
        {grant.error ? <ErrorState title="Could not grant access" error={grant.error} /> : null}
      </form>
    </section>
  );
}

interface ThemeButtonProps {
  value: ThemePreference;
  current: ThemePreference;
  label: string;
  icon: JSX.Element;
  onSelect: (theme: ThemePreference) => void;
}

function ThemeButton({
  value,
  current,
  label,
  icon,
  onSelect,
}: ThemeButtonProps): JSX.Element {
  return (
    <ActionButton
      variant={current === value ? 'primary' : 'default'}
      role="radio"
      aria-checked={current === value}
      icon={icon}
      onClick={() => onSelect(value)}
    >
      {label}
    </ActionButton>
  );
}

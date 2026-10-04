// AdminSettingsPage.tsx — admin preferences surface.
//
// Implements theme preferences, the internal wiki choice, and account access
// controls wired through typed HTTP endpoints.

import { LogOut, Moon, Monitor, Sun, ToggleRight } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiDelete, apiGet, apiSend } from '../api/client';
import { endpoints } from '../api/endpoints';
import { ActionButton } from '../components/action/ActionButton';
import { ErrorState, LoadingState } from '../components/state';
import { useAuth } from '../hooks/useAuth';
import { InternalWikiPanel } from './InternalWikiPanel';
import {
  usePreferencesStore,
  type ThemePreference,
} from '../stores/preferencesStore';

import './page.css';

export function AdminSettingsPage(): JSX.Element {
  const theme = usePreferencesStore((s) => s.theme);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const { user } = useAuth();

  return (
    <div className="page" data-testid="settings-page">
      <header className="page__header">
        <h1 className="page__title">Settings</h1>
        <p className="page__subtitle">
          Admin preferences and account access controls.
        </p>
        <div className="page__inline-actions">
          <span className="page__pill page__pill--warning">
            Theme preferences
          </span>
        </div>
      </header>

      <section className="page__section" aria-labelledby="theme-section">
        <h2 className="page__section-title" id="theme-section">
          Theme
        </h2>
        <div className="page__inline-actions" role="radiogroup">
          <ThemeButton
            value="system"
            current={theme}
            label="System"
            icon={<Monitor size={14} />}
            onSelect={setTheme}
          />
          <ThemeButton
            value="light"
            current={theme}
            label="Light"
            icon={<Sun size={14} />}
            onSelect={setTheme}
          />
          <ThemeButton
            value="dark"
            current={theme}
            label="Dark"
            icon={<Moon size={14} />}
            onSelect={setTheme}
          />
          <ThemeButton
            value="high-contrast"
            current={theme}
            label="High contrast"
            icon={<ToggleRight size={14} />}
            onSelect={setTheme}
          />
        </div>
      </section>

      {user?.role === 'admin' ? (
        <>
          <InternalWikiPanel />
          <AdminAccessPanel />
          <RepoAccessPanel />
        </>
      ) : null}

      <SessionPanel login={user?.login ?? null} />
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
          variant="danger"
          icon={<LogOut size={14} aria-hidden="true" />}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          Log out
        </ActionButton>
      </div>
    </section>
  );
}

interface AdminUser {
  login: string;
  role: 'admin' | 'user';
  created_at: string;
  updated_at: string;
}

interface ResetReceipt {
  login: string;
  password: string;
}

function AdminAccessPanel(): JSX.Element {
  const [receipt, setReceipt] = useState<ResetReceipt | null>(null);
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: ({ signal }) => apiGet<AdminUser[]>(endpoints.adminUsers(), { signal }),
  });
  const reset = useMutation({
    mutationFn: (target: string) =>
      apiSend<ResetReceipt>(endpoints.adminResetPassword(target), {}),
    onSuccess: setReceipt,
  });
  return (
    <section className="page__section" aria-labelledby="admin-users">
      <h2 className="page__section-title" id="admin-users">
        Users
      </h2>
      {users.isPending ? (
        <LoadingState title="Loading users..." variant="message" />
      ) : users.error ? (
        <ErrorState title="Could not load users" error={users.error} />
      ) : (
        <div className="page__card">
          <div className="table-scroll">
            <table className="admin-users__table" data-testid="admin-users-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(users.data ?? []).map((account) => (
                  <tr key={account.login}>
                    <th scope="row">{account.login}</th>
                    <td>
                      <span className="page__pill">{account.role}</span>
                    </td>
                    <td className="admin-users__actions">
                      <ActionButton
                        variant="default"
                        onClick={() => reset.mutate(account.login)}
                      >
                        Reset password
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {receipt ? (
            <p className="page__roadmap-note">
              {receipt.login}: {receipt.password}
            </p>
          ) : null}
        </div>
      )}
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
  const [owner, setOwner] = useState('jeryu');
  const [repo, setRepo] = useState('jeryu');
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
      {!hasRepo ? null : grants.isPending ? (
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
                          variant="danger"
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
            User
            <input value={login} onChange={(event) => setLogin(event.currentTarget.value)} />
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

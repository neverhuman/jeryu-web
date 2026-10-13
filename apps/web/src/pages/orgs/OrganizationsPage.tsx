// OrganizationsPage.tsx — organizations, their owners and teams (ADR 0009),
// and the team agents an organization owns (ADR 0008).
//
// The server decides every right: a forge administrator creates an
// organization; its owners (or an administrator) change owners, teams and
// members and enroll team agents. An organization the viewer may not see is
// simply absent. Neither owning one nor belonging to a team grants a
// repository right.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { apiDeleteReceipt, apiGet, apiPut, apiSend } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import type {
  Organization,
  OrganizationCreateRequest,
  OrganizationListResponse,
  OrganizationView,
  Team,
  TeamBotCreateRequest,
  TeamBotCreateResponse,
  TeamCreateRequest,
} from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { ErrorState, LoadingState } from '../../components/state';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useAuth } from '../../hooks/useAuth';

import '../page.css';
import '../bots/BotsPage.css';

const ORGS_KEY = ['organizations'] as const;

function orgKey(org: string): string[] {
  return ['organization', org];
}

/** Logins from a comma- or space-separated list, trimmed, lowercased, distinct. */
export function parseLogins(value: string): string[] {
  const seen: string[] = [];
  for (const part of value.split(/[\s,]+/)) {
    const login = part.trim().toLowerCase();
    if (login !== '' && !seen.includes(login)) seen.push(login);
  }
  return seen;
}

export function OrganizationsPage(): JSX.Element {
  usePageTitle('Organizations');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ORGS_KEY,
    queryFn: ({ signal }) => apiGet<OrganizationListResponse>(endpoints.orgs(), { signal }),
    retry: false,
  });
  const organizations = list.data?.organizations ?? [];
  const current = selected ?? organizations[0]?.login ?? null;

  return (
    <div className="page" data-testid="organizations-page">
      <header className="page__header">
        <h1 className="page__title">Organizations</h1>
        <p className="page__subtitle">
          An organization is a group of people with owners. Its teams steward the team agents
          it owns. Neither gives anyone access to a repository.
        </p>
      </header>

      {isAdmin ? <CreateOrganizationForm onCreated={(login) => setSelected(login)} /> : null}

      <section className="page__section" aria-labelledby="org-list">
        <h2 className="page__section-title" id="org-list">
          Yours
        </h2>
        {list.isPending ? (
          <LoadingState variant="message" title="Loading organizations." />
        ) : list.isError ? (
          <ErrorState
            title="Could not load organizations."
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        ) : organizations.length === 0 ? (
          <p className="enroll-form__note" data-testid="organizations-empty">
            You own no organization and are on no team.
          </p>
        ) : (
          <ul className="page__inline-actions" data-testid="organization-list">
            {organizations.map((organization: Organization) => (
              <li key={organization.login}>
                <ActionButton
                  type="button"
                  aria-pressed={organization.login === current}
                  onClick={() => setSelected(organization.login)}
                >
                  {organization.display_name ?? organization.login}
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      {current ? <OrganizationDetail key={current} org={current} /> : null}
    </div>
  );
}

function CreateOrganizationForm({ onCreated }: { onCreated: (login: string) => void }): JSX.Element {
  const queryClient = useQueryClient();
  const [login, setLogin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [owners, setOwners] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (body: OrganizationCreateRequest) => apiSend<Organization>(endpoints.orgs(), body),
    onSuccess: (organization) => {
      setLogin('');
      setDisplayName('');
      setOwners('');
      void queryClient.invalidateQueries({ queryKey: ORGS_KEY });
      onCreated(organization.login);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = login.trim().toLowerCase();
    const ownerList = parseLogins(owners);
    if (name === '' || ownerList.length === 0) {
      setFormError('Enter a login and at least one owner.');
      return;
    }
    setFormError(null);
    const body: OrganizationCreateRequest = { login: name, owners: ownerList };
    if (displayName.trim() !== '') body.display_name = displayName.trim();
    create.mutate(body);
  }

  return (
    <form className="page__card enroll-form" onSubmit={onSubmit} data-testid="org-create-form">
      <h2 className="page__card-title">Create an organization</h2>
      <div className="enroll-form__grid">
        <label className="enroll-form__field">
          Login
          <input
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={create.isPending}
          />
        </label>
        <label className="enroll-form__field">
          Display name (optional)
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
            disabled={create.isPending}
          />
        </label>
        <label className="enroll-form__field">
          Owners
          <input
            value={owners}
            onChange={(event) => setOwners(event.target.value)}
            placeholder="ada, bob"
            autoComplete="off"
            spellCheck={false}
            disabled={create.isPending}
          />
        </label>
      </div>
      <p className="enroll-form__note">Only a forge administrator can create one.</p>
      {formError ? (
        <p className="enroll-form__error" role="alert">
          {formError}
        </p>
      ) : null}
      {create.error ? <ErrorState title="Could not create it." error={create.error} /> : null}
      <div className="page__inline-actions">
        <ActionButton type="submit" variant="primary" disabled={create.isPending}>
          Create
        </ActionButton>
      </div>
    </form>
  );
}

function OrganizationDetail({ org }: { org: string }): JSX.Element {
  const queryClient = useQueryClient();
  const key = orgKey(org);
  const view = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiGet<OrganizationView>(endpoints.org(org), { signal }),
    retry: false,
  });
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ORGS_KEY });
  };
  const [actionError, setActionError] = useState<unknown>(null);
  const change = useMutation({
    mutationFn: (step: () => Promise<unknown>) => step(),
    onSuccess: () => {
      setActionError(null);
      refresh();
    },
    onError: (error) => setActionError(error),
  });

  if (view.isPending) return <LoadingState variant="message" title="Loading the organization." />;
  if (view.isError) {
    return <ErrorState title="Could not load the organization." error={view.error} />;
  }
  const { organization, teams, can_manage: canManage } = view.data;
  const busy = change.isPending;

  return (
    <section className="page__section" aria-labelledby="org-detail" data-testid="organization-detail">
      <h2 className="page__section-title" id="org-detail">
        {organization.display_name ?? organization.login}{' '}
        <code className="enroll-table__slug">{organization.login}</code>
      </h2>
      {actionError ? <ErrorState title="Could not change it." error={actionError} /> : null}

      <div className="page__card">
        <h3 className="page__card-title">Owners</h3>
        <PeopleList
          people={organization.owners}
          empty="No owner yet: forge administrators run it."
          canRemove={canManage && organization.owners.length > 1}
          busy={busy}
          noun="owner"
          onRemove={(login) =>
            change.mutate(() => apiDeleteReceipt<Organization>(endpoints.orgOwner(org, login)))
          }
        />
        {canManage ? (
          <AddPerson
            label="Add an owner"
            busy={busy}
            onAdd={(login) =>
              change.mutate(() => apiPut<Organization>(endpoints.orgOwner(org, login)))
            }
          />
        ) : null}
      </div>

      {teams.map((team: Team) => (
        <div className="page__card" key={team.slug} data-testid="org-team">
          <h3 className="page__card-title">
            {team.name} <code className="enroll-table__slug">{team.slug}</code>
          </h3>
          <PeopleList
            people={team.members}
            empty="Nobody on this team."
            canRemove={canManage}
            busy={busy}
            noun="member"
            onRemove={(login) =>
              change.mutate(() =>
                apiDeleteReceipt<Team>(endpoints.orgTeamMember(org, team.slug, login))
              )
            }
          />
          {canManage ? (
            <AddPerson
              label="Add a member"
              busy={busy}
              onAdd={(login) =>
                change.mutate(() => apiPut<Team>(endpoints.orgTeamMember(org, team.slug, login)))
              }
            />
          ) : null}
        </div>
      ))}

      {canManage ? (
        <>
          <CreateTeamForm org={org} onCreated={refresh} />
          {teams.length > 0 ? <EnrollTeamBotForm org={org} teams={teams} /> : null}
        </>
      ) : null}
    </section>
  );
}

function PeopleList({
  people,
  empty,
  canRemove,
  busy,
  noun,
  onRemove,
}: {
  people: string[];
  empty: string;
  canRemove: boolean;
  busy: boolean;
  noun: string;
  onRemove: (login: string) => void;
}): JSX.Element {
  if (people.length === 0) return <p className="enroll-form__note">{empty}</p>;
  return (
    <ul className="team-agent__grant-list" data-testid="org-people">
      {people.map((login) => (
        <li key={login}>
          <span>{login}</span>
          {canRemove ? (
            <ActionButton
              type="button"
              aria-label={`Remove ${noun} ${login}`}
              disabled={busy}
              onClick={() => onRemove(login)}
            >
              Remove
            </ActionButton>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function AddPerson({
  label,
  busy,
  onAdd,
}: {
  label: string;
  busy: boolean;
  onAdd: (login: string) => void;
}): JSX.Element {
  const [login, setLogin] = useState('');
  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = login.trim().toLowerCase();
    if (name === '') return;
    onAdd(name);
    setLogin('');
  }
  return (
    <form className="team-agent__grant-form" onSubmit={onSubmit}>
      <label className="enroll-form__field">
        {label}
        <input
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          placeholder="login"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </label>
      <ActionButton type="submit" disabled={busy}>
        Add
      </ActionButton>
    </form>
  );
}

function CreateTeamForm({ org, onCreated }: { org: string; onCreated: () => void }): JSX.Element {
  const [name, setName] = useState('');
  const [members, setMembers] = useState('');
  const create = useMutation({
    mutationFn: (body: TeamCreateRequest) => apiSend<Team>(endpoints.orgTeams(org), body),
    onSuccess: () => {
      setName('');
      setMembers('');
      onCreated();
    },
  });
  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (name.trim() === '') return;
    create.mutate({ name: name.trim(), members: parseLogins(members) });
  }
  return (
    <form className="page__card enroll-form" onSubmit={onSubmit} data-testid="team-create-form">
      <h3 className="page__card-title">Create a team</h3>
      <div className="enroll-form__grid">
        <label className="enroll-form__field">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            disabled={create.isPending}
          />
        </label>
        <label className="enroll-form__field">
          Members (optional)
          <input
            value={members}
            onChange={(event) => setMembers(event.target.value)}
            placeholder="ada, bob"
            autoComplete="off"
            spellCheck={false}
            disabled={create.isPending}
          />
        </label>
      </div>
      {create.error ? <ErrorState title="Could not create the team." error={create.error} /> : null}
      <div className="page__inline-actions">
        <ActionButton type="submit" disabled={create.isPending}>
          Create team
        </ActionButton>
      </div>
    </form>
  );
}

function EnrollTeamBotForm({ org, teams }: { org: string; teams: Team[] }): JSX.Element {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [team, setTeam] = useState(teams[0]?.slug ?? '');
  const [enrolled, setEnrolled] = useState<string | null>(null);
  const enroll = useMutation({
    mutationFn: (body: TeamBotCreateRequest) =>
      apiSend<TeamBotCreateResponse>(endpoints.orgBots(org), body),
    onSuccess: (answer) => {
      setDisplayName('');
      setSlug('');
      setEnrolled(answer.bot.acting_login ?? answer.bot.slug);
      void queryClient.invalidateQueries({ queryKey: ['account-bots'] });
    },
  });
  const slugPart = slug.trim() === '' ? 'slug' : slug.trim();
  const actingPreview = `${org}.${slugPart}[bot]`;
  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (displayName.trim() === '' || slug.trim() === '' || team === '') return;
    enroll.mutate({ steward_team: team, slug: slug.trim(), display_name: displayName.trim() });
  }
  return (
    <form className="page__card enroll-form" onSubmit={onSubmit} data-testid="team-bot-create-form">
      <h3 className="page__card-title">Add a team agent</h3>
      <div className="enroll-form__grid">
        <label className="enroll-form__field">
          Display name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
            disabled={enroll.isPending}
          />
        </label>
        <label className="enroll-form__field">
          Slug
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={enroll.isPending}
          />
        </label>
        <label className="enroll-form__field">
          Stewards
          <select
            value={team}
            onChange={(event) => setTeam(event.target.value)}
            disabled={enroll.isPending}
          >
            {teams.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="enroll-form__note">
        It acts as <code>{actingPreview}</code> and can do nothing until
        a repository&apos;s administrator grants it. Its stewards issue its tokens on{' '}
        <Link to="/bots">Agents</Link>.
      </p>
      {enrolled ? (
        <p className="enroll-form__note" role="status" data-testid="team-bot-enrolled">
          Added {enrolled}.
        </p>
      ) : null}
      {enroll.error ? <ErrorState title="Could not add it." error={enroll.error} /> : null}
      <div className="page__inline-actions">
        <ActionButton type="submit" variant="primary" disabled={enroll.isPending}>
          Add
        </ActionButton>
      </div>
    </form>
  );
}

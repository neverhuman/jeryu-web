// TeamBots.tsx — the team agents the signed-in person stewards (ADR 0008).
//
// A team agent belongs to an organization, not to anyone: its rights are only
// the grants a repository's administrators made to it, and it acts as
// `<org>.<slug>[bot]`. Its stewards issue its agent tokens here; it has no
// enrollment key to show. Granting is the repository administrator's call,
// which the server enforces.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { apiDelete, apiGet, apiPut, apiSend } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import type {
  BotRepoAccess,
  BotRepoGrant,
  BotRepoGrantListResponse,
  BotSummary,
} from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { ErrorState, LoadingState } from '../../components/state';
import { When } from '../../format/When';
import { AgentTokens } from './AgentTokens';
import { BotKindBadge } from './BotKindBadge';
import { statusLabel } from './botModel';

export const ORGANIZATIONS_PATH = '/orgs';

function grantsKey(botId: string): string[] {
  return ['team-bot-grants', botId];
}

/** `owner/name`, or null when it is not exactly that. */
export function parseRepoName(value: string): { owner: string; name: string } | null {
  const parts = value.trim().split('/');
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  if (!owner || !name) return null;
  return { owner, name };
}

export function TeamBots({
  bots,
  onChanged,
}: {
  bots: BotSummary[];
  onChanged: () => void;
}): JSX.Element {
  const [actionError, setActionError] = useState<unknown>(null);
  const [revokedCount, setRevokedCount] = useState<number | null>(null);

  const suspend = useMutation({
    mutationFn: (id: string) => apiSend<BotSummary>(endpoints.botSuspend(id)),
    onSuccess: () => {
      setActionError(null);
      onChanged();
    },
    onError: (error) => setActionError(error),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiSend<BotSummary>(endpoints.botRevoke(id)),
    onSuccess: () => {
      setActionError(null);
      onChanged();
    },
    onError: (error) => setActionError(error),
  });
  const revokeIssued = useMutation({
    mutationFn: () => apiSend<{ revoked: number }>(endpoints.botTokensRevokeIssued()),
    onSuccess: (answer) => {
      setActionError(null);
      setRevokedCount(answer.revoked);
      onChanged();
    },
    onError: (error) => setActionError(error),
  });

  return (
    <section className="page__section" aria-labelledby="team-bots" data-testid="team-bots">
      <h2 className="page__section-title" id="team-bots">
        Team agents
      </h2>
      <p className="enroll-form__note">
        A team agent belongs to an organization, not to you. It can do only what a
        repository&apos;s administrators granted it, and it acts under its own name. You
        steward it through your team; the organization&apos;s owners enroll it on{' '}
        <Link to={ORGANIZATIONS_PATH}>Organizations</Link>.
      </p>
      {actionError ? (
        <ErrorState title="Could not update it." error={actionError} testId="team-bot-error" />
      ) : null}
      {bots.length === 0 ? (
        <p className="enroll-form__note" data-testid="team-bots-empty">
          You steward no team agent.
        </p>
      ) : (
        <>
          {bots.map((agent) => {
            const revoked = agent.status === 'revoked';
            const rowBusy =
              (suspend.isPending && suspend.variables === agent.id) ||
              (revoke.isPending && revoke.variables === agent.id);
            return (
              <article
                key={agent.id}
                className="page__card team-agent"
                data-testid="team-bot"
                aria-labelledby={`team-bot-${agent.id}`}
              >
                <header className="team-agent__header">
                  <h3 className="page__card-title" id={`team-bot-${agent.id}`}>
                    {agent.display_name}
                  </h3>
                  <BotKindBadge kind={agent.kind} />
                </header>
                <dl className="team-agent__facts">
                  <dt>Acts as</dt>
                  <dd>
                    <code data-testid="team-bot-acting-login">{agent.acting_login ?? agent.slug}</code>
                  </dd>
                  <dt>Organization</dt>
                  <dd>{agent.owner}</dd>
                  <dt>Stewards</dt>
                  <dd>{agent.steward_team ? `${agent.owner}/${agent.steward_team}` : 'None'}</dd>
                  <dt>Status</dt>
                  <dd>{statusLabel(agent.status)}</dd>
                  <dt>Last successful access</dt>
                  <dd>
                    <When at={agent.last_successful_access} label="Last successful access" />
                  </dd>
                </dl>
                <div className="page__inline-actions">
                  <ActionButton
                    type="button"
                    aria-label={`Suspend ${agent.display_name}`}
                    disabled={rowBusy || agent.status !== 'active'}
                    onClick={() => suspend.mutate(agent.id)}
                  >
                    Suspend
                  </ActionButton>
                  <ActionButton
                    type="button"
                    variant="human"
                    aria-label={`Revoke ${agent.display_name}`}
                    disabled={rowBusy || revoked}
                    onClick={() => revoke.mutate(agent.id)}
                  >
                    Revoke
                  </ActionButton>
                </div>
                <TeamBotGrants bot={agent} />
                {revoked ? null : <AgentTokens bot={agent} />}
              </article>
            );
          })}
          <div className="page__inline-actions">
            <ActionButton
              type="button"
              variant="human"
              data-testid="team-bot-revoke-issued"
              disabled={revokeIssued.isPending}
              onClick={() => revokeIssued.mutate()}
            >
              Revoke every team agent token I issued
            </ActionButton>
            {revokedCount !== null ? (
              <span className="enroll-form__note" role="status" data-testid="team-bot-revoked-count">
                {revokedCount === 1 ? 'Revoked 1 token.' : `Revoked ${revokedCount} tokens.`}
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function TeamBotGrants({ bot }: { bot: BotSummary }): JSX.Element {
  const queryClient = useQueryClient();
  const key = grantsKey(bot.id);
  const [repoName, setRepoName] = useState('');
  const [access, setAccess] = useState<BotRepoAccess>('write');
  const [formError, setFormError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      apiGet<BotRepoGrantListResponse>(endpoints.botGrants(bot.id), { signal }),
    retry: false,
  });
  const grant = useMutation({
    mutationFn: (target: { owner: string; name: string; access: BotRepoAccess }) =>
      apiPut<BotRepoGrant>(endpoints.botGrant(bot.id, target.owner, target.name), {
        access: target.access,
      }),
    onSuccess: () => {
      setRepoName('');
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({
    mutationFn: (target: BotRepoGrant) =>
      apiDelete(endpoints.botGrant(bot.id, target.owner, target.repo)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const target = parseRepoName(repoName);
    if (target === null) {
      setFormError('Enter one repository as owner/name.');
      return;
    }
    setFormError(null);
    grant.mutate({ ...target, access });
  }

  const grants = list.data?.grants ?? [];
  return (
    <div className="team-agent__grants" data-testid="team-bot-grants">
      <h4>Repository grants</h4>
      {list.isPending ? (
        <LoadingState variant="message" title="Loading grants." />
      ) : list.isError ? (
        <ErrorState title="Could not load grants." error={list.error} />
      ) : grants.length === 0 ? (
        <p className="enroll-form__note">No grant yet: it can read public repositories only.</p>
      ) : (
        <ul className="team-agent__grant-list">
          {grants.map((row) => (
            <li key={`${row.owner}/${row.repo}`} data-testid="team-bot-grant">
              <span>
                {row.owner}/{row.repo} · {row.access === 'write' ? 'Write' : 'Read'} · granted by{' '}
                {row.granted_by}
              </span>
              <ActionButton
                type="button"
                aria-label={`Remove the grant on ${row.owner}/${row.repo}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(row)}
              >
                Remove
              </ActionButton>
            </li>
          ))}
        </ul>
      )}
      <form className="team-agent__grant-form" onSubmit={onSubmit} data-testid="team-bot-grant-form">
        <label className="enroll-form__field">
          Repository
          <input
            value={repoName}
            onChange={(event) => setRepoName(event.target.value)}
            placeholder="owner/name"
            autoComplete="off"
            spellCheck={false}
            disabled={grant.isPending}
          />
        </label>
        <label className="enroll-form__field">
          Access
          <select
            value={access}
            disabled={grant.isPending}
            onChange={(event) => setAccess(event.target.value === 'read' ? 'read' : 'write')}
          >
            <option value="write">Write</option>
            <option value="read">Read</option>
          </select>
        </label>
        <ActionButton type="submit" disabled={grant.isPending}>
          Grant
        </ActionButton>
      </form>
      <p className="enroll-form__hint">Only that repository&apos;s administrators can grant it.</p>
      {formError ? (
        <p className="enroll-form__error" role="alert">
          {formError}
        </p>
      ) : null}
      {grant.error ? <ErrorState title="Could not grant it." error={grant.error} /> : null}
      {remove.error ? <ErrorState title="Could not remove the grant." error={remove.error} /> : null}
    </div>
  );
}

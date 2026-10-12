// RepoBotRoster.tsx — enrolled agents whose reach includes this repository.
//
// `GET /api/v1/repos/{id}/bots` is already clipped to this repository, so a
// repository reach reads "This repo" and an owners reach "Whole owner". The
// query key includes the repo id so one repository cannot show another's
// enrollments.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { apiGet } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import type { BotListResponse } from '../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../components/state';
import { When } from '../../format/When';
import { BotKindBadge } from './BotKindBadge';
import { addBotHref, repoRosterReachLabel, textOrDash } from './botModel';

export function RepoBotRoster({
  repoId,
  owner,
  name,
}: {
  repoId: string;
  owner: string;
  name: string;
}): JSX.Element {
  const roster = useQuery({
    queryKey: ['repo-bots', repoId],
    queryFn: ({ signal }) =>
      apiGet<BotListResponse>(endpoints.repoBots(repoId), { signal }),
    enabled: repoId.length > 0,
    staleTime: 10_000,
    retry: false,
  });
  const bots = roster.data?.bots ?? [];

  return (
    <section
      className="agents__bot-roster"
      data-testid="bot-roster"
      aria-labelledby="repo-bots-heading"
    >
      <div className="agents__bot-head">
        <h2 id="repo-bots-heading">Enrolled agents</h2>
        <Link className="agents__add-bot" to={addBotHref(owner, name)} data-testid="add-bot">
          Add an agent
        </Link>
      </div>
      {roster.isPending ? (
        <LoadingState variant="message" title="Loading enrolled agents." />
      ) : roster.isError ? (
        <ErrorState
          title="Could not load enrolled agents."
          error={roster.error}
          onRetry={() => void roster.refetch()}
          testId="bot-roster-error"
        />
      ) : bots.length === 0 ? (
        <EmptyState
          title="No enrolled agent on this repo yet"
          testId="bot-empty"
        />
      ) : (
        <ul className="agents__bot-list">
          {bots.map((bot) => (
            <li key={bot.id} className="agents__bot-row" data-testid="bot-row">
              <BotKindBadge kind={bot.kind} />
              <span className="agents__bot-name">{bot.display_name}</span>
              <span className="agents__bot-reach">{repoRosterReachLabel(bot.reach)}</span>
              <span className="agents__bot-access">
                <span className="agents__bot-k">Last successful access</span>{' '}
                <When at={bot.last_successful_access} label="Last successful access" />
              </span>
              <span className="agents__bot-outcome">
                <span className="agents__bot-k">Last outcome</span> {textOrDash(bot.last_outcome)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

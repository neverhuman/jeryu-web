// BotActivityList.tsx — what a repository's Grokbots and Musebots did.
//
// `GET /api/v1/repos/{id}/bot-activity` answers the repository's writers with
// every bot's events, oldest first. Each event is one request (`http`: the
// method and path, with the status) or one MCP session tool (`mcp`: the tool,
// with `ok` or `error`), and names the session it worked when that session is
// the bot's owner's. The server keeps a trail rather than an audit: while a
// bot's outcome stays the same, its events are at least a minute apart.
//
// Readers who cannot write the repository are refused the feed; for them the
// list is simply absent.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { ApiError, apiGet } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import type {
  BotActivityEvent,
  BotActivityResponse,
  BotListResponse
} from '../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../components/state';
import { When } from '../../format/When';
import { sessionPath } from '../SessionsPage';

/** The most events a list shows. */
export const BOT_ACTIVITY_LIMIT = 20;

/** Newest first, at most `limit`, only those naming `sessionId` when given. */
export function recentBotActivity(
  events: readonly BotActivityEvent[],
  sessionId?: string,
  limit: number = BOT_ACTIVITY_LIMIT
): BotActivityEvent[] {
  return events
    .filter((event) => !sessionId || event.session_id === sessionId)
    .slice()
    .reverse()
    .slice(0, limit);
}

/** A refusal (not a writer) or an unknown repository: show nothing. */
function quiet(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 403 || error.status === 404)
  );
}

/**
 * The repository's bot activity, newest first: all of it, or only what names
 * `sessionId`. `null` while the feed is refused to this reader.
 */
export function BotActivityList({
  repo,
  sessionId,
  emptyTitle,
  testId = 'bot-activity'
}: {
  /** The repository's id or `owner/name`. */
  repo: string;
  sessionId?: string;
  emptyTitle: string;
  testId?: string;
}): JSX.Element | null {
  const activity = useQuery({
    queryKey: ['repo-bot-activity', repo],
    queryFn: ({ signal }) =>
      apiGet<BotActivityResponse>(endpoints.repoBotActivity(repo), { signal }),
    enabled: repo.length > 0,
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: false
  });
  // The roster names each bot; an event of a bot no longer listed says so.
  const roster = useQuery({
    queryKey: ['repo-bots', repo],
    queryFn: ({ signal }) =>
      apiGet<BotListResponse>(endpoints.repoBots(repo), { signal }),
    enabled: repo.length > 0,
    staleTime: 10_000,
    retry: false
  });

  if (activity.isError && quiet(activity.error)) return null;
  const names = new Map(
    (roster.data?.bots ?? []).map((bot) => [bot.id, bot.display_name])
  );
  const events = recentBotActivity(activity.data?.events ?? [], sessionId);

  return (
    <div className="bot-activity" data-testid={testId}>
      {activity.isPending ? (
        <LoadingState
          variant="message"
          title="Loading Grokbot and Musebot activity."
        />
      ) : activity.isError ? (
        <ErrorState
          title="Could not load Grokbot and Musebot activity."
          error={activity.error}
          onRetry={() => void activity.refetch()}
          testId={`${testId}-error`}
        />
      ) : events.length === 0 ? (
        <EmptyState title={emptyTitle} testId={`${testId}-empty`} />
      ) : (
        <ul className="bot-activity__list">
          {events.map((event) => (
            <li
              key={event.id}
              className="bot-activity__row"
              data-testid={`${testId}-row`}
            >
              <When at={event.created_at} label="When" />
              <span className="bot-activity__bot">
                {names.get(event.bot_id) ??
                  'A Grokbot or Musebot no longer listed'}
              </span>
              <code className="bot-activity__action">{event.action}</code>
              <span className="page__pill" title={`scope ${event.scope}`}>
                {event.outcome}
              </span>
              {event.session_id && !sessionId ? (
                <Link
                  className="bot-activity__session"
                  to={sessionPath(event.session_id)}
                >
                  {event.session_id}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// AgentCards.tsx — the Active agents page's card view: one full-body robot
// per agent, its timeline strip along the top, and the facts that identify it.
// The list view (PresenceList) stays the detailed one. Cards are list rows
// too: `j`/`k` move between them and `o`/Enter opens the first repository.

import { Link } from 'react-router-dom';

import type { AgentPresenceItem } from '../../api/agentPresence';
import { AgentBot } from '../../components/agentBot/AgentBot';
import { archetypeOf, botOfPresence } from '../../components/agentBot/agentBotModel';
import { toneClass } from '../../components/tone/tone';
import { relativeText } from '../../format/when';
import { LIST_OPEN_PROP, listRowProps, useListKeys } from '../../hooks/useListKeys';

import { presenceHeadline, presenceRepoHref, sourceLabel, stateTone } from './presenceModel';
import { ModelBadge } from './ModelBadge';
import { TimelineStrip } from './PresenceTimeline';
import { SPAN_AGO, type TimelineWindow } from './presenceTimelineModel';

import './AgentCards.css';

export function AgentCards({ items, hostForRepo, now, timeline }: {
  items: readonly AgentPresenceItem[];
  hostForRepo: (repo?: string) => string;
  now: number;
  timeline: TimelineWindow;
}): JSX.Element {
  const listRef = useListKeys<HTMLUListElement>();
  return (
    <ul ref={listRef} className="agent-cards" data-testid="agent-cards">
      {items.map((item) => {
        const headline = presenceHeadline(item);
        const families = item.families.map((family) => `family ${family}`).join(', ');
        return (
          <li key={item.id} {...listRowProps} data-list-key={item.id} className={`agent-card agent-card--${item.state}`}
            data-testid={`agent-card-${item.id}`} data-state={item.state}>
            <TimelineStrip item={item} range={timeline} now={now} />
            {/* A grid has no shared axis, so each strip names its own ends. */}
            <p className="agent-card__scale" aria-hidden="true"><span>{SPAN_AGO[timeline.span]}</span><span>now</span></p>
            <div className="agent-card__bot">
              <AgentBot agent={botOfPresence(item)} size={112} />
            </div>
            <div className="agent-card__title">
              <span className="agent-card__name">{item.agent}</span>
              {item.model ? <ModelBadge model={item.model} testId={`agent-card-model-${item.id}`} /> : null}
              <span className={toneClass('presence__state', stateTone(item.state))}>{item.state}</span>
            </div>
            {headline ? <p className="agent-card__headline">{headline}</p> : null}
            <p className="agent-card__meta">
              {sourceLabel(item.source)} · {archetypeOf(item.agent).label}
              {item.operator ? <> · {item.operator}</> : null}
            </p>
            <p className="agent-card__meta">
              {item.repos.length ? item.repos.map((name, index) => {
                // One link per repository, each opening the repository it names.
                const href = presenceRepoHref(hostForRepo(name), { ...item, repos: [name] });
                return <span key={name}>{index ? ', ' : null}{href ? <Link to={href} {...(index === 0 ? LIST_OPEN_PROP : {})}>{name}</Link> : name}</span>;
              }) : <span>{families || 'No repository assigned'}</span>}
              {item.last_active_at !== null ? <> · seen {relativeText(item.last_active_at, now)}</> : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

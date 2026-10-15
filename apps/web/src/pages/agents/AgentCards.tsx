// AgentCards.tsx — the Active agents page's card view: one full-body robot
// per agent, its timeline strip along the top, and the facts that identify it.
// The list view (PresenceList) stays the detailed one.

import { Link } from 'react-router-dom';

import type { AgentPresenceItem } from '../../api/agentPresence';
import { AgentBot } from '../../components/agentBot/AgentBot';
import { archetypeOf, botOfPresence } from '../../components/agentBot/agentBotModel';
import { toneClass } from '../../components/tone/tone';
import { relativeText } from '../../format/when';

import { agentLabel, presenceHeadline, presenceRepoHref, sourceLabel, stateTone } from './presenceModel';
import { TimelineStrip } from './PresenceTimeline';
import type { TimelineWindow } from './presenceTimelineModel';

import './AgentCards.css';

export function AgentCards({ items, hostForRepo, now, timeline }: {
  items: readonly AgentPresenceItem[];
  hostForRepo: (repo?: string) => string;
  now: number;
  timeline: TimelineWindow;
}): JSX.Element {
  return (
    <ul className="agent-cards" data-testid="agent-cards">
      {items.map((item) => {
        const headline = presenceHeadline(item);
        const families = item.families.map((family) => `family ${family}`).join(', ');
        return (
          <li key={item.id} className={`agent-card agent-card--${item.state}`} data-testid={`agent-card-${item.id}`} data-state={item.state}>
            <TimelineStrip item={item} window={timeline} now={now} />
            <div className="agent-card__bot">
              <AgentBot agent={botOfPresence(item)} size={112} />
            </div>
            <div className="agent-card__title">
              <span className="agent-card__name">{agentLabel(item)}</span>
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
                return <span key={name}>{index ? ', ' : null}{href ? <Link to={href}>{name}</Link> : name}</span>;
              }) : <span>{families || 'No repository assigned'}</span>}
              {item.last_active_at !== null ? <> · seen {relativeText(item.last_active_at, now)}</> : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

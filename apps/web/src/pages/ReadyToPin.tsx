// ReadyToPin.tsx — the top of the Unreleased page: what a deploy repo's
// dependencies have merged that its pins do not carry yet.
//
// One row per pin that is not current: the dependency, one plain sentence,
// one next step, and (expandable) the commits a bump would ship. Current pins
// fold into one quiet line. Pins are admin-only, so other roles never ask; an
// older server gets one quiet sentence.

import { Link } from 'react-router-dom';

import type { Pin } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { isPipelineForbidden, isPipelineUnavailable, usePins } from '../hooks/usePipeline';
import {
  pinLabel,
  pinNextStep,
  pinStateOf,
  pinTone,
  scopeConsumers,
  shortRepo,
  splitPins,
  type ConsumerPins,
  type PinScope,
} from './pinsModel';

const TONE_PILL: Record<ReturnType<typeof pinTone>, string> = {
  neutral: '',
  warning: 'page__pill--warning',
  danger: 'page__pill--danger',
};

export function ReadyToPin({ scope }: { scope: PinScope }): JSX.Element | null {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const pins = usePins(isAdmin);
  if (!isAdmin || pins.isPending || isPipelineForbidden(pins.error)) return null;

  let body: JSX.Element;
  if (pins.isError) {
    body = (
      <p className="releases__muted" data-testid="ready-to-pin-unavailable">
        {isPipelineUnavailable(pins.error)
          ? 'Pins are not available on this server version.'
          : `Could not read pins: ${pins.error.message}`}
      </p>
    );
  } else {
    const consumers = scopeConsumers(pins.data.consumers ?? [], scope).map(splitPins);
    if (consumers.length === 0) return null;
    body = (
      <>
        {consumers.map((entry) => (
          <ConsumerBlock key={entry.consumer.repo} entry={entry} />
        ))}
      </>
    );
  }

  return (
    <section className="page__section" aria-labelledby="ready-to-pin-title" data-testid="ready-to-pin">
      <h2 className="page__section-title" id="ready-to-pin-title">
        Ready to pin
      </h2>
      <p className="releases__muted">
        Merged in a dependency, not yet in the deploy repo’s pin. A release ships what is pinned.
      </p>
      {body}
    </section>
  );
}

function ConsumerBlock({ entry }: { entry: ConsumerPins }): JSX.Element {
  const { consumer, open, currentCount } = entry;
  return (
    <div className="pins__consumer" data-testid={`pins-consumer-${consumer.repo}`}>
      <h3 className="pins__consumer-title">
        {consumer.repo} <span className="releases__muted">pins</span>
      </h3>
      {open.length > 0 ? (
        <ul className="pins__list">
          {open.map((pin) => (
            <PinRow key={`${pin.source}:${pin.dependency}:${pin.pinned_ref}`} pin={pin} />
          ))}
        </ul>
      ) : null}
      <p className="releases__muted" data-testid={`pins-current-${consumer.repo}`}>
        {open.length === 0
          ? `All ${currentCount} pin${currentCount === 1 ? '' : 's'} current: nothing merged is waiting for a pin.`
          : `${currentCount} pin${currentCount === 1 ? '' : 's'} current`}
      </p>
    </div>
  );
}

function PinRow({ pin }: { pin: Pin }): JSX.Element {
  const step = pinNextStep(pin);
  const unreleased = pin.unreleased ?? [];
  return (
    <li className="pins__row" data-testid={`pin-${pin.dependency}`} data-state={pinStateOf(pin)}>
      <p className="pins__line">
        <Link to={`/unreleased?repo=${encodeURIComponent(pin.dependency)}`}>
          {shortRepo(pin.dependency)}
        </Link>{' '}
        <span className={`page__pill ${TONE_PILL[pinTone(pin)]}`}>{pinLabel(pin)}</span>{' '}
        <span className="pins__step">
          {step.to ? <Link to={step.to}>{step.text}</Link> : step.text}
        </span>
      </p>
      {unreleased.length > 0 ? (
        <details className="pins__commits">
          <summary>
            What a bump would ship ({unreleased.length}
            {pin.behind > unreleased.length ? ` of ${pin.behind}` : ''})
          </summary>
          <ul>
            {unreleased.map((commit) => (
              <li key={commit.sha}>
                <code title={commit.sha}>{commit.sha.slice(0, 7)}</code> {commit.subject}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

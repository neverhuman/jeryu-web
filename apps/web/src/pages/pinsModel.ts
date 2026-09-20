// pinsModel.ts — pure helpers behind "Ready to pin" (`GET /api/v1/pins`).
//
// A deploy repo ships what it pins, not what its dependencies merged. These
// helpers turn the server's comparison into one plain sentence and one next
// step per pin, so Releases reads as a pipeline: merged but not
// pinned, then pinned but not deployed.

import type { Pin, PinConsumer, PinState } from '../api/types';
import { safeHref } from './needsYou/needsYouModel';

const STATES: readonly PinState[] = ['current', 'behind', 'behind_not_green', 'diverged', 'unknown'];

/** A state this client does not know is shown as `unknown`, never dropped. */
export function pinStateOf(pin: Pick<Pin, 'state'>): PinState {
  return STATES.find((state) => state === pin.state) ?? 'unknown';
}

/** `owner/name` → `name`; the owner is noise next to the consumer heading. */
export function shortRepo(fullName: string): string {
  const slash = fullName.lastIndexOf('/');
  return slash >= 0 ? fullName.slice(slash + 1) : fullName;
}

function commits(count: number): string {
  return `${count} merged commit${count === 1 ? '' : 's'}`;
}

/** One plain sentence: where this pin stands. */
export function pinLabel(pin: Pin): string {
  const state = pinStateOf(pin);
  const behind = Number.isFinite(pin.behind) ? Math.max(0, pin.behind) : 0;
  if (state === 'current') return 'current';
  if (state === 'diverged') return 'diverged from main';
  if (state === 'unknown') return 'could not be compared with main';
  if (pin.kind === 'tag') {
    return `${behind} commit${behind === 1 ? '' : 's'} since tag ${pin.pinned_ref}, needs a new tag`;
  }
  if (state === 'behind_not_green') return `${commits(behind)} waiting for a green gate`;
  return `${commits(behind)} not pinned yet`;
}

/**
 * Red only where something is wrong. A commit pin bumps itself and a tag that
 * trails main is a standing fact worth a look, not an alarm: both are neutral.
 * A diverged pin needs a person.
 */
export function pinTone(pin: Pin): 'neutral' | 'danger' {
  return pinStateOf(pin) === 'diverged' ? 'danger' : 'neutral';
}

export interface PinNextStep {
  text: string;
  /** In-app link, when the step has a place. */
  to: string | null;
}

/** The one next step for a pin that is not current. */
export function pinNextStep(pin: Pin): PinNextStep {
  const state = pinStateOf(pin);
  if (pin.bump_pr) {
    return { text: `bump PR #${pin.bump_pr.number} is open`, to: safeHref(pin.bump_pr.url) };
  }
  if (state === 'diverged') {
    return { text: 'the pin is not on main: check which commit should ship', to: null };
  }
  if (state === 'unknown') return { text: 'the server could not resolve this pin', to: null };
  if (pin.kind === 'tag') return { text: 'cut a tag on main, then bump the manifest', to: null };
  if (state === 'behind_not_green') {
    return { text: 'the pin bump opens once main is green', to: null };
  }
  return { text: 'the pin bump opens by itself within minutes', to: null };
}

export interface ConsumerPins {
  consumer: PinConsumer;
  /**
   * Pins a person can act on or must see: commit pins that are not current
   * (the bump is one click or opens by itself) and anything diverged.
   */
  open: Pin[];
  /**
   * Tag pins with commits since the tag. Nothing automatic or urgent can be
   * done about them (someone cuts a tag, then bumps the manifest), so they
   * fold behind one line instead of burying the actionable row.
   */
  tagged: Pin[];
  currentCount: number;
}

const OPEN_ORDER: readonly PinState[] = ['diverged', 'behind', 'behind_not_green', 'unknown'];

function byStateThenName(a: Pin, b: Pin): number {
  return (
    OPEN_ORDER.indexOf(pinStateOf(a)) - OPEN_ORDER.indexOf(pinStateOf(b)) ||
    a.dependency.localeCompare(b.dependency)
  );
}

export function splitPins(consumer: PinConsumer): ConsumerPins {
  const pins = consumer.pins ?? [];
  const notCurrent = pins.filter((pin) => pinStateOf(pin) !== 'current');
  const folds = (pin: Pin): boolean => pin.kind === 'tag' && pinStateOf(pin) !== 'diverged';
  return {
    consumer,
    open: notCurrent.filter((pin) => !folds(pin)).sort(byStateThenName),
    tagged: notCurrent.filter(folds).sort(byStateThenName),
    currentCount: pins.length - notCurrent.length,
  };
}

/** The one line the folded tag pins show while closed. */
export function taggedSummary(count: number): string {
  return count === 1
    ? '1 dependency has commits since its pinned tag'
    : `${count} dependencies have commits since their pinned tag`;
}

export interface PinScope {
  /** `?repo=owner/name`, when the page is scoped to one repository. */
  repo: string | null;
  /** `?family=`, when the page is scoped to a family. */
  family: string | null;
  /** The family's repositories as `owner/name`, once listed. */
  familyRepos: readonly string[];
}

/**
 * Consumers that belong on a page scoped to a repo or a family: the deploy
 * repo itself, or a deploy repo that pins the repo in scope (so looking at
 * jeryu-web says its commits are not in jeryu-deploy's pin yet).
 */
export function scopeConsumers(consumers: PinConsumer[], scope: PinScope): PinConsumer[] {
  return consumers.filter((consumer) => {
    if (scope.family) {
      return consumer.family === scope.family || scope.familyRepos.includes(consumer.repo);
    }
    if (!scope.repo) return true;
    return (
      consumer.repo === scope.repo ||
      (consumer.pins ?? []).some((pin) => pin.dependency === scope.repo)
    );
  });
}

/** "jeryu-web has 9 merged commits not in this repo's pin" — for Releases. */
export function behindPinLines(consumers: PinConsumer[], repo: string): string[] {
  const consumer = consumers.find((candidate) => candidate.repo === repo);
  if (!consumer) return [];
  return (consumer.pins ?? [])
    .filter((pin) => {
      const state = pinStateOf(pin);
      return pin.kind === 'commit' && (state === 'behind' || state === 'behind_not_green') && pin.behind > 0;
    })
    .map((pin) => `${shortRepo(pin.dependency)} has ${commits(pin.behind)} not in this repo's pin`);
}

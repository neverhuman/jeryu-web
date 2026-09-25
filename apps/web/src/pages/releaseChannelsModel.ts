// releaseChannelsModel.ts — where a merged pull request has got to on the
// release ladder: dev → canary → stable → production.
//
// `unreleasedModel.ts` answers the same question against a single baseline
// (production, else the newest tag). This widens it to one baseline per
// environment so a row can say "in canary, not yet in stable".
//
// Membership is ancestry: the forge only fast-forwards, so a merged PR's head
// sha IS its commit on the default branch, and the PR is in a channel exactly
// when that sha is an ancestor of what the channel runs. `compare?base=<the
// channel's sha>&head=main` lists what the channel lacks, so the sha being
// absent from that list means the channel has it — unless the compare was
// capped, which cannot prove absence. A capped or missing compare therefore
// reads `unknown`, never "released".

import type { PullRequestSummary } from '../api/types';
import type {
  CompareResponse,
  EnvironmentsResponse,
  ReleaseTagResponse,
} from '../api/types/deployments';

/** Shallowest (nearest main) first; production is the deepest channel. */
export const CHANNEL_ORDER = ['dev', 'canary', 'stable', 'production'] as const;

export type ChannelName = (typeof CHANNEL_ORDER)[number];

/** A tag-released repository has no environments: one pip, named by the tag. */
export type PipId = ChannelName | 'tag';

export const CHANNEL_LABELS: Record<ChannelName, string> = {
  dev: 'dev',
  canary: 'canary',
  stable: 'stable',
  production: 'prod',
};

/** `in`: the channel runs the change. `out`: it does not. `unknown`: cannot tell. */
export type Membership = 'in' | 'out' | 'unknown';

export interface ChannelBaseline {
  id: PipId;
  /** The release name from the deployment payload, else the channel itself. */
  name: string;
  sha: string;
  at: string | null;
}

export interface ChannelPip {
  id: PipId;
  label: string;
  membership: Membership;
  /** The release that carries the change here; null unless `membership` is `in`. */
  release: string | null;
  at: string | null;
  /** The release this pip was compared against (the baseline's name). */
  baseline?: string;
  /** Why an `unknown` pip stayed undecided: its compare was capped, or never answered. */
  undecided?: Undecided | null;
}

export type Undecided = 'capped' | 'unanswered';

/** `channels`: deployment records. `tag`: released by tag. `none`: neither. */
export type LadderKind = 'channels' | 'tag' | 'none';

export interface LadderBaselines {
  kind: LadderKind;
  baselines: ChannelBaseline[];
}

export interface ReleaseLadder {
  kind: LadderKind;
  pips: ChannelPip[];
  /** The deepest channel that runs the change, or null when none does. */
  furthest: PipId | null;
  /** The release carrying it at `furthest`; the band key on the timeline. */
  release: string | null;
  /** True when at least one pip could not be decided. */
  uncertain: boolean;
}

export const NO_LADDER: LadderBaselines = { kind: 'none', baselines: [] };

/**
 * The ladder of a view that never looked: no pips, and undecided rather than
 * unreleased. A page that does not load compares (a single repository's pull
 * request list, say) uses this so a merged PR reads "unknown", not "never
 * released".
 */
export const UNKNOWN_LADDER: ReleaseLadder = {
  kind: 'channels',
  pips: [],
  furthest: null,
  release: null,
  uncertain: true,
};

/**
 * One baseline per configured environment, deepest last. Only environments
 * with a live deployment count; an expected-but-empty environment is left out
 * rather than shown as a channel nothing can be in. With no deployment at all
 * the newest tag on the branch becomes the single baseline.
 */
export function ladderBaselines(
  environments: EnvironmentsResponse | undefined,
  releaseTag: ReleaseTagResponse | undefined
): LadderBaselines {
  const baselines: ChannelBaseline[] = [];
  for (const channel of CHANNEL_ORDER) {
    const live = environments?.environments.find((env) => env.name === channel)?.current;
    if (!live) continue;
    const release = live.deployment.payload?.['release'];
    baselines.push({
      id: channel,
      name: typeof release === 'string' && release !== '' ? release : channel,
      sha: live.deployment.sha,
      at: live.deployment.created_at,
    });
  }
  if (baselines.length > 0) return { kind: 'channels', baselines };
  if (releaseTag?.tag && releaseTag.sha) {
    return {
      kind: 'tag',
      baselines: [
        { id: 'tag', name: releaseTag.tag, sha: releaseTag.sha, at: releaseTag.tagged_at },
      ],
    };
  }
  return NO_LADDER;
}

/** Every compare this ladder needs, as `{ id, base }` pairs to fetch. */
export function ladderCompares(baselines: LadderBaselines): { id: PipId; base: string }[] {
  return baselines.baselines.map((baseline) => ({ id: baseline.id, base: baseline.sha }));
}

function membershipOf(headSha: string, compare: CompareResponse | null | undefined): Membership {
  if (!compare) return 'unknown';
  if (compare.commits.some((commit) => commit.sha === headSha)) return 'out';
  // A capped compare lists only part of what the channel lacks: absence from
  // the page it returned is not proof the channel has the change.
  return compare.truncated ? 'unknown' : 'in';
}

/**
 * The ladder for one pull request. `compares` is keyed by pip id and holds
 * `<that channel's sha>..main`; a missing entry (still loading, or failed)
 * leaves its pip `unknown`.
 *
 * Channels nest: production's commit is an ancestor of stable's, and so on up
 * to main. So a decided pip settles its neighbours — being in production means
 * being in every shallower channel, and being absent from dev means being
 * absent from every deeper one. That repair turns one good compare into a
 * complete ladder, and is what keeps a capped production compare from greying
 * out the whole row.
 */
export function releaseLadder(
  pr: Pick<PullRequestSummary, 'state' | 'head_sha'>,
  baselines: LadderBaselines,
  compares: ReadonlyMap<PipId, CompareResponse | null>
): ReleaseLadder {
  if (baselines.kind === 'none' || pr.state !== 'merged') {
    return {
      kind: baselines.kind,
      // An open or closed pull request is in no channel: it has not merged.
      pips: baselines.baselines.map((baseline) => ({
        id: baseline.id,
        label: pipLabel(baseline),
        membership: 'out' as Membership,
        release: null,
        at: null,
      })),
      furthest: null,
      release: null,
      uncertain: false,
    };
  }
  const decided = baselines.baselines.map((baseline) =>
    membershipOf(pr.head_sha, compares.get(baseline.id))
  );
  monotonize(decided);
  const pips: ChannelPip[] = baselines.baselines.map((baseline, index) => {
    const membership = decided[index] ?? 'unknown';
    return {
      id: baseline.id,
      label: pipLabel(baseline),
      membership,
      release: membership === 'in' ? baseline.name : null,
      at: membership === 'in' ? baseline.at : null,
      baseline: baseline.name,
      undecided:
        membership === 'unknown' ? (compares.get(baseline.id) ? 'capped' : 'unanswered') : null,
    };
  });
  const deepestIn = [...pips].reverse().find((pip) => pip.membership === 'in') ?? null;
  return {
    kind: baselines.kind,
    pips,
    furthest: deepestIn?.id ?? null,
    release: deepestIn?.release ?? null,
    uncertain: pips.some((pip) => pip.membership === 'unknown'),
  };
}

function pipLabel(baseline: ChannelBaseline): string {
  return baseline.id === 'tag' ? baseline.name : CHANNEL_LABELS[baseline.id];
}

/**
 * Fill in what nesting implies, in place: `in` at a deeper channel makes every
 * shallower one `in`; `out` at a shallower channel makes every deeper one `out`.
 */
function monotonize(memberships: Membership[]): void {
  for (let i = memberships.length - 1; i > 0; i -= 1) {
    if (memberships[i] === 'in' && memberships[i - 1] === 'unknown') memberships[i - 1] = 'in';
  }
  for (let i = 0; i < memberships.length - 1; i += 1) {
    if (memberships[i] === 'out' && memberships[i + 1] === 'unknown') memberships[i + 1] = 'out';
  }
}

/** The ladder in a few words, for the `Released` stage's detail line. */
export function ladderDetail(ladder: ReleaseLadder, state: string): string {
  if (state !== 'merged') return state === 'closed' ? 'not merged' : 'not yet';
  if (ladder.kind === 'none') return 'no release recorded';
  if (ladder.furthest) {
    if (ladder.furthest === 'tag') return ladder.release ?? 'released';
    const label = CHANNEL_LABELS[ladder.furthest];
    return ladder.release && ladder.release !== ladder.furthest
      ? `${label} · ${ladder.release}`
      : label;
  }
  if (ladder.uncertain) {
    const gaveUp = ladderUndecided(ladder);
    return gaveUp ? `release unknown · ${gaveUp}` : 'release unknown';
  }
  // Not "awaiting <release>": a pip names the release a channel runs NOW,
  // which is exactly the one this change is not in.
  return 'next release';
}

/**
 * Which release an undecided ladder gave up comparing against, and why, in a
 * few words: `prod v2.3 compare capped`. Null when every pip is decided; a
 * ladder that never looked (no pips at all) says it was not compared.
 */
export function ladderUndecided(ladder: ReleaseLadder): string | null {
  if (!ladder.uncertain) return null;
  if (ladder.pips.length === 0) return 'not compared';
  const pip = ladder.pips.find((candidate) => candidate.membership === 'unknown');
  if (!pip) return null;
  const against =
    pip.baseline && pip.baseline !== pip.label && pip.baseline !== pip.id
      ? `${pip.label} ${pip.baseline}`
      : pip.label;
  return pip.undecided === 'unanswered'
    ? `${against} compare did not answer`
    : `${against} compare capped`;
}

/**
 * How far the ladder got, as one of the release stage's statuses: reaching the
 * deepest channel is `done`, reaching some is `active`, reaching none is
 * `pending`, and an undecided ladder is `unknown` rather than either.
 */
export function ladderReach(ladder: ReleaseLadder): 'done' | 'active' | 'pending' | 'unknown' {
  const deepest = ladder.pips[ladder.pips.length - 1];
  if (deepest && deepest.membership === 'in') return 'done';
  if (ladder.furthest) return 'active';
  return ladder.uncertain ? 'unknown' : 'pending';
}

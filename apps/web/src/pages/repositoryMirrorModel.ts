// repositoryMirrorModel.ts — words and tones for Settings > Mirror.

import type { AutomationMirror } from '../api/types';
import type { Tone } from '../components/tone/tone';

export type MirrorSectionTone = Tone;

export function mirrorProviderName(target: string): string {
  try {
    const host = new URL(target).hostname.toLowerCase();
    if (host.includes('github')) return 'GitHub';
    const first = host.split('.')[0] ?? '';
    return first ? first[0].toUpperCase() + first.slice(1) : 'mirror';
  } catch {
    return 'mirror';
  }
}

export function mirrorTitle(mirror: AutomationMirror): string {
  return `Mirrored to ${mirrorProviderName(mirror.target)}`;
}

export function mirrorDirectionText(mirror: AutomationMirror): string {
  const provider = mirrorProviderName(mirror.target);
  const direction = mirror.direction === 'push' ? 'push' : 'pull';
  return `forge → ${provider} (${direction}), the forge is the source of truth`;
}

export function mirrorStateText(mirror: AutomationMirror): string {
  switch (mirror.state) {
    case 'in_sync':
      return 'in sync';
    case 'behind': {
      const count = mirror.behindBy;
      const commits =
        typeof count === 'number' && count > 0
          ? `${count} commit${count === 1 ? '' : 's'} behind`
          : 'behind';
      return mirror.retryPending ? `${commits} (retrying)` : commits;
    }
    case 'ahead':
      return 'ahead; needs you';
    case 'diverged':
      return 'diverged; needs you';
    default:
      return 'not checked yet';
  }
}

export function mirrorTone(mirror: AutomationMirror | null | undefined): MirrorSectionTone {
  if (!mirror) return 'unknown';
  if (mirror.state === 'ahead' || mirror.state === 'diverged') return 'human';
  if ((mirror.tagDrift?.length ?? 0) > 0) return 'human';
  if (mirror.state === 'behind' || mirror.behind || mirror.retryPending) return 'warn';
  if (mirror.state === 'in_sync') return 'ok';
  return 'unknown';
}

export function firstMirror(mirrors: readonly AutomationMirror[] | null | undefined): AutomationMirror | null {
  return mirrors?.[0] ?? null;
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : 'none';
}

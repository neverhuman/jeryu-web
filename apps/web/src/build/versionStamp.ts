// The checked-in `VERSION` file is what an operator reads to decide whether a
// deploy is current, so it must never fall behind the split tags. Releases
// stamp it with `scripts/stamp-version.sh`; the guard test beside this module
// keeps a hand edit (or a forgotten stamp) from drifting it backwards again.

/** A parsed `jeryu-web-v<major>.<minor>.<patch>-split.<n>` stamp. */
export interface SplitVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly split: number;
}

const STAMP = /^jeryu-web-v(\d+)\.(\d+)\.(\d+)-split\.(\d+)$/;

/** Parses a split version stamp, or returns null if it is not one. */
export function parseSplitVersion(stamp: string): SplitVersion | null {
  const match = STAMP.exec(stamp.trim());
  if (!match) return null;
  const [, major, minor, patch, split] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    split: Number(split),
  };
}

/** Orders two stamps: negative when `a` is older than `b`, 0 when equal. */
export function compareSplitVersions(a: SplitVersion, b: SplitVersion): number {
  return (
    a.major - b.major || a.minor - b.minor || a.patch - b.patch || a.split - b.split
  );
}

/** The newest stamp among `stamps`, ignoring anything that is not one. */
export function newestSplitVersion(stamps: readonly string[]): string | null {
  let best: { stamp: string; parsed: SplitVersion } | null = null;
  for (const stamp of stamps) {
    const parsed = parseSplitVersion(stamp);
    if (!parsed) continue;
    if (!best || compareSplitVersions(parsed, best.parsed) > 0) {
      best = { stamp: stamp.trim(), parsed };
    }
  }
  return best?.stamp ?? null;
}

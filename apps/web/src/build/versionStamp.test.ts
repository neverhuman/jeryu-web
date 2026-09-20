import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  compareSplitVersions,
  newestSplitVersion,
  parseSplitVersion,
} from './versionStamp';

/** Repository root: src/build -> src -> web -> apps -> root. */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

function checkedInVersion(): string {
  return readFileSync(join(REPO_ROOT, 'VERSION'), 'utf8').trim();
}

/** Split tags known to this clone, or null when git cannot answer. */
function splitTags(): string[] | null {
  try {
    const out = execFileSync('git', ['tag', '--list', 'jeryu-web-v*'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const tags = out.split('\n').filter((line) => line.trim() !== '');
    return tags.length > 0 ? tags : null;
  } catch {
    return null;
  }
}

describe('split version stamps', () => {
  it('parses a stamp and rejects anything else', () => {
    expect(parseSplitVersion('jeryu-web-v5.0.0-split.1')).toEqual({
      major: 5,
      minor: 0,
      patch: 0,
      split: 1,
    });
    expect(parseSplitVersion('v5.0.0')).toBeNull();
    expect(parseSplitVersion('jeryu-web-v5.0.0')).toBeNull();
  });

  it('orders by version then split counter', () => {
    const older = parseSplitVersion('jeryu-web-v4.0.0-split.9')!;
    const newer = parseSplitVersion('jeryu-web-v5.0.0-split.0')!;
    expect(compareSplitVersions(older, newer)).toBeLessThan(0);
    expect(compareSplitVersions(newer, older)).toBeGreaterThan(0);
    expect(compareSplitVersions(newer, newer)).toBe(0);
  });

  it('picks the newest stamp and ignores unrelated tags', () => {
    expect(
      newestSplitVersion([
        'jeryu-web-v4.0.0-split.1',
        'nightly',
        'jeryu-web-v5.0.0-split.1',
        'jeryu-web-v5.0.0-split.0',
      ]),
    ).toBe('jeryu-web-v5.0.0-split.1');
    expect(newestSplitVersion(['nightly'])).toBeNull();
  });
});

describe('checked-in VERSION', () => {
  it('is a well-formed split stamp', () => {
    expect(parseSplitVersion(checkedInVersion())).not.toBeNull();
  });

  it('is never behind the newest split tag in this clone', () => {
    const tags = splitTags();
    if (tags === null) return;
    const newestTag = newestSplitVersion(tags);
    if (newestTag === null) return;
    const version = parseSplitVersion(checkedInVersion())!;
    const tag = parseSplitVersion(newestTag)!;
    expect(
      compareSplitVersions(version, tag),
      `VERSION says ${checkedInVersion()} but the newest tag is ${newestTag}; ` +
        'run scripts/stamp-version.sh to restamp it',
    ).toBeGreaterThanOrEqual(0);
  });
});

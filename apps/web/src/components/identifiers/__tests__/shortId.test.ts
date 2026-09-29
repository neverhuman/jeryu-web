import { describe, expect, it } from 'vitest';

import { fullIdTitle, holdsId, shortId, shortenIds } from '../shortId';

const ID = '428377c2-6190-4a50-b306-d52d4a2f1c33';

describe('shortId', () => {
  it('keeps the first block of a UUID', () => {
    expect(shortId(ID)).toBe('428377c2');
  });

  it('shortens every UUID inside a sentence', () => {
    expect(shortenIds(`Attempt ${ID}`)).toBe('Attempt 428377c2');
    expect(
      shortenIds(`repository ${ID} and run ${ID.toUpperCase()}`)
    ).toBe('repository 428377c2 and run 428377C2');
  });

  it('leaves text without a UUID alone', () => {
    expect(shortenIds('ci/build passed')).toBe('ci/build passed');
    expect(shortenIds('jeryu:veox/redline')).toBe('jeryu:veox/redline');
    expect(holdsId('ci/build passed')).toBe(false);
  });

  it('does not mistake a short hex word or a sha for a UUID', () => {
    const sha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    expect(shortenIds(sha)).toBe(sha);
    expect(shortenIds('deadbeef')).toBe('deadbeef');
  });

  it('answers the same way when asked twice (the matcher keeps no state)', () => {
    expect(holdsId(`Attempt ${ID}`)).toBe(true);
    expect(holdsId(`Attempt ${ID}`)).toBe(true);
  });

  it('titles only the text that was shortened', () => {
    expect(fullIdTitle(`Attempt ${ID}`)).toBe(`Attempt ${ID}`);
    expect(fullIdTitle('ci/build')).toBeUndefined();
  });
});

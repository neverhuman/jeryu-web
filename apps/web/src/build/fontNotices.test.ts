import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicDir = join(process.cwd(), 'public');

const read = (name: string) => readFileSync(join(publicDir, name));
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

const notices = read('THIRD_PARTY_NOTICES.txt').toString('utf8');

describe('bundled font notices', () => {
  it('ships the unmodified JetBrains Mono OFL text next to the font files', () => {
    const ofl = read('fonts/OFL.txt').toString('utf8');
    expect(ofl).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(ofl).toContain('Copyright 2020 The JetBrains Mono Project Authors');
    expect(sha256(read('fonts/OFL.txt'))).toBe(
      'b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d',
    );
  });

  it('points at the OFL text and names the licence the fonts are under', () => {
    expect(notices).toContain('SIL Open Font License, Version 1.1');
    expect(notices).toContain('fonts/OFL.txt');
    expect(sha256(read('fonts/OFL.txt'))).toBe(
      notices.match(/OFL\.txt\nSHA-256: ([0-9a-f]{64})/)?.[1],
    );
  });

  it('records the delivered bytes of every served font file', () => {
    for (const weight of ['400', '500', '700']) {
      const name = `JetBrainsMono-${weight}.woff2`;
      const recorded = notices.match(new RegExp(`${name}\\n\\S+\\nSHA-256: ([0-9a-f]{64})`))?.[1];
      expect(recorded, `no SHA-256 recorded for ${name}`).toBeDefined();
      expect(sha256(read(`fonts/${name}`))).toBe(recorded);
    }
  });

  it('only refers to notice files that the web bundle actually serves', () => {
    expect(notices).not.toContain('DEPENDENCY_NOTICES.txt');
    expect(notices).not.toContain('web-bundles.json');
  });
});

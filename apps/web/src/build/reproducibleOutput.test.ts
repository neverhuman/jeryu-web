import { describe, expect, it } from 'vitest';
import { reproducibleFileNames, sourcemapSourcePath } from './reproducibleOutput';

describe('reproducible build output', () => {
  it('names every emitted file by chunk name and content hash only', () => {
    for (const pattern of Object.values(reproducibleFileNames)) {
      expect(pattern).toMatch(/^assets\/\[name\]-\[hash\]/);
    }
  });

  it('keeps relative sourcemap sources as they are, with forward slashes', () => {
    expect(sourcemapSourcePath('../../src/main.tsx', '/w/apps/web')).toBe('../../src/main.tsx');
    expect(sourcemapSourcePath('..\\..\\src\\main.tsx', 'C:\\w\\apps\\web')).toBe('../../src/main.tsx');
  });

  it('rewrites an absolute source under the app relative to the map file', () => {
    expect(sourcemapSourcePath('/w/apps/web/src/main.tsx', '/w/apps/web/')).toBe('../../src/main.tsx');
    expect(sourcemapSourcePath('C:\\w\\apps\\web\\src\\a.ts', 'C:\\w\\apps\\web')).toBe('../../src/a.ts');
  });

  it('refuses an absolute source outside the app instead of leaking a host path', () => {
    expect(() => sourcemapSourcePath('/home/someone/x.ts', '/w/apps/web')).toThrow(/absolute path/);
  });
});

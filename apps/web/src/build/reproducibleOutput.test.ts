import { describe, expect, it } from 'vitest';
import {
  emittedAssetNames,
  pinAssetSourcesContent,
  reproducibleFileNames,
  sourcemapSourcePath,
} from './reproducibleOutput';

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

  it('maps each emitted asset by its path in the checkout', () => {
    const names = emittedAssetNames([
      { fileName: 'assets/pearl-aGVsbG8.webp', originalFileName: 'src/pages/pearl.webp' },
      { fileName: 'assets/index-aGVsbG8.js.map', originalFileName: null },
    ]);
    expect(names.get('src/pages/pearl.webp')).toBe('assets/pearl-aGVsbG8.webp');
    expect(names.size).toBe(1);
  });

  it('pins an asset module placeholder to the asset it resolves to', () => {
    const map = {
      sources: ['../../src/pages/pearl.webp', '../../src/main.tsx'],
      sourcesContent: ['export default import.meta.ROLLDOWN_FILE_URL_8HSUfh7cJ-x$', 'const a = 1;'],
    };
    const names = new Map([['src/pages/pearl.webp', 'assets/pearl-aGVsbG8.webp']]);
    expect(pinAssetSourcesContent(map, names)).toBe(true);
    expect(map.sourcesContent).toEqual([
      'export default "assets/pearl-aGVsbG8.webp"',
      'const a = 1;',
    ]);
  });

  it('pins a placeholder with no emitted asset to the source path', () => {
    const map = {
      sources: ['../../src/pages/gone.webp'],
      sourcesContent: ['export default import.meta.ROLLDOWN_FILE_URL_VRAku6fjghkApIISiBWPzg'],
    };
    expect(pinAssetSourcesContent(map, new Map())).toBe(true);
    expect(map.sourcesContent).toEqual(['export default "../../src/pages/gone.webp"']);
  });

  it('leaves a map without asset placeholders alone', () => {
    const map = { sources: ['../../src/main.tsx'], sourcesContent: ['const a = 1;'] };
    expect(pinAssetSourcesContent(map, new Map())).toBe(false);
    expect(pinAssetSourcesContent({}, new Map())).toBe(false);
    expect(map.sourcesContent).toEqual(['const a = 1;']);
  });
});

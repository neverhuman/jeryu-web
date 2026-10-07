// Build-output settings that make `vite build` a pure function of the commit:
// jeryu-deploy pins jeryu-web by commit plus a sha256 over the whole dist, so
// the same commit must give byte-identical files wherever it is checked out.

/** Every emitted file name derives from the chunk name and its content hash. */
export const reproducibleFileNames = {
  entryFileNames: 'assets/[name]-[hash].js',
  chunkFileNames: 'assets/[name]-[hash].js',
  assetFileNames: 'assets/[name]-[hash][extname]',
} as const;

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:\//.test(path);
}

/**
 * Keep sourcemap `sources` relative to the map file (which lives in
 * `dist/assets/`), with forward slashes, so no checkout path reaches the dist.
 * An absolute source under `projectRoot` is rewritten relative to the map; one
 * outside it fails the build rather than leaking a host path.
 */
export function sourcemapSourcePath(source: string, projectRoot: string): string {
  const posix = source.replace(/\\/g, '/');
  if (!isAbsolutePath(posix)) return posix;
  const root = `${projectRoot.replace(/\\/g, '/').replace(/\/+$/, '')}/`;
  if (posix.startsWith(root)) return `../../${posix.slice(root.length)}`;
  throw new Error(`sourcemap source is an absolute path outside the web app: ${source}`);
}

/**
 * Asset modules compile to `export default import.meta.ROLLDOWN_FILE_URL_<id>`,
 * where the bundler picks a fresh random `<id>` on every build. The id never
 * reaches the shipped JS — it is resolved to the asset's URL there — but it is
 * captured in the source map's `sourcesContent`, which made each build of one
 * commit hash differently. Rewriting the placeholder to the asset's final
 * emitted file name keeps the map readable and a function of the commit.
 */
const assetModulePlaceholder = /^export default import\.meta\.ROLLDOWN_FILE_URL_[A-Za-z0-9_$-]+$/;

/** Drop the leading `./` and `../` segments a map-relative source path carries. */
function sourceKey(source: string): string {
  return source.replace(/\\/g, '/').replace(/^(?:\.\.?\/)+/, '');
}

type EmittedAsset = { readonly fileName: string; readonly originalFileName?: string | null };

/** Final emitted file name of every asset, keyed by its path in the checkout. */
export function emittedAssetNames(outputs: readonly EmittedAsset[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const output of outputs) {
    if (output.originalFileName) names.set(sourceKey(output.originalFileName), output.fileName);
  }
  return names;
}

type SourceMap = { sources?: readonly string[]; sourcesContent?: (string | null)[] };

/**
 * Replace every asset-module placeholder in `map.sourcesContent` with the
 * asset's emitted file name. Returns true when the map changed.
 */
export function pinAssetSourcesContent(map: SourceMap, assetNames: Map<string, string>): boolean {
  const contents = map.sourcesContent;
  if (!contents) return false;
  let changed = false;
  contents.forEach((content, index) => {
    if (typeof content !== 'string' || !assetModulePlaceholder.test(content.trim())) return;
    const source = map.sources?.[index];
    const fileName = source === undefined ? undefined : assetNames.get(sourceKey(source));
    contents[index] = `export default ${JSON.stringify(fileName ?? source ?? '')}`;
    changed = true;
  });
  return changed;
}

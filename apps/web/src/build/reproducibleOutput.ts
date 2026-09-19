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

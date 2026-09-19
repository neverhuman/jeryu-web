// markdownImages.ts — where a Markdown image really lives.
//
// A README says `![logo](docs/logo.png)`: a path in the repository, which the
// browser would otherwise resolve against the page URL and miss. Those go to
// the forge's raw endpoint for the same repository and ref. Absolute, external
// and data URLs are left alone.

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** The repository path a relative image `src` names, or null if it is not one. */
export function repoImagePath(src: string, docDir = ''): string | null {
  if (src === '' || src.startsWith('#') || src.startsWith('/') || EXTERNAL.test(src)) {
    return null;
  }
  const dir = docDir === '' || docDir.endsWith('/') ? docDir : `${docDir}/`;
  const url = new URL(src, `https://repo.invalid/${dir}`);
  const path = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  return path === '' ? null : path;
}

/** The `src` to load: relative paths through `imageSrc`, everything else as written. */
export function resolveImageSrc(
  src: string,
  docDir: string | undefined,
  imageSrc: ((repoPath: string) => string) | undefined
): string {
  const path = imageSrc ? repoImagePath(src, docDir) : null;
  return path !== null && imageSrc ? imageSrc(path) : src;
}

/** The directory of a repository file (`docs/a.md` → `docs/`, `README.md` → ``). */
export function dirOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash + 1);
}

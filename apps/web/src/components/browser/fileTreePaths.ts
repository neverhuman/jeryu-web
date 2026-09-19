// fileTreePaths.ts — path arithmetic for the file tree.

/** Every directory above `path`, outermost first (`a/b/c.rs` → `a`, `a/b`). */
export function ancestorsOf(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    dirs.push(parts.slice(0, i).join('/'));
  }
  return dirs;
}

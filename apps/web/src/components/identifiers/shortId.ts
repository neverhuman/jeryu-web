// shortId.ts — operator-facing text says a short id, never a whole UUID.
//
// Servers name their rows by UUID, and those ids reach the operator inside
// strings we render verbatim (a check called "Attempt 428377c2-6190-…", a
// settings side effect naming its repository). Thirty-six characters of hex
// crowd out the words around them and none of them are readable, so the
// rendered text keeps the first block and the full id travels in the `title`
// (and in the link, where there is one) so it can still be read and copied.

/** A UUID anywhere inside a sentence. */
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** The readable stand-in for one UUID: its first block. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Every UUID in `text`, shortened. Text with no UUID comes back unchanged. */
export function shortenIds(text: string): string {
  return text.replace(UUID, (id) => shortId(id));
}

/** True when shortening `text` would change it — i.e. it holds a UUID. */
export function holdsId(text: string): boolean {
  UUID.lastIndex = 0;
  return UUID.test(text);
}

/**
 * The `title` for a shortened string: the full text when it held an id (so the
 * operator can read the whole thing), otherwise none, so unshortened text does
 * not grow a tooltip that repeats what is already on screen.
 */
export function fullIdTitle(text: string): string | undefined {
  return holdsId(text) ? text : undefined;
}

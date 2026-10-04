// when.ts — the one time formatter for the web UI.
//
// Every surface that shows an instant goes through here, so a reader meets one
// relative wording ("12 min ago", "in 3 h") and one absolute wording with the
// zone spelled out. The API emits both `…Z` and `…+00:00`, so nothing compares
// timestamps as text: `instantOf` parses, `compareInstants` orders.

/** Milliseconds since the epoch, or null when there is nothing to read. */
export function instantOf(at: string | number | Date | null | undefined): number | null {
  if (at === null || at === undefined || at === '') return null;
  const ms = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

/** Oldest first; anything unreadable sorts last, whichever form it arrived in. */
export function compareInstants(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined
): number {
  const left = instantOf(a);
  const right = instantOf(b);
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

/** How long a gap reads as, without its direction: `12 min`, `3 h`, `2 days`. */
function gapText(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(ms / DAY);
  if (ms < 30 * DAY) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.round(ms / MONTH);
  return `${months} month${months === 1 ? '' : 's'}`;
}

/**
 * `just now`, `12 min ago`, `in 3 h`; an em dash when there is no instant and
 * the raw text when it does not parse, so a reader still sees what arrived.
 */
export function relativeText(
  at: string | number | Date | null | undefined,
  now: Date | number = Date.now()
): string {
  const ms = instantOf(at);
  if (ms === null) return typeof at === 'string' && at !== '' ? at : '—';
  const delta = (now instanceof Date ? now.getTime() : now) - ms;
  if (Math.abs(delta) < 45_000) return 'just now';
  return delta > 0 ? `${gapText(delta)} ago` : `in ${gapText(-delta)}`;
}

function parts(at: number, options: Intl.DateTimeFormatOptions): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(at));
  } catch {
    return null;
  }
}

/** The reader's zone as they name it: `CEST`, else its IANA id, else `UTC`. */
export function zoneLabel(): string {
  try {
    const found = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName');
    if (found) return found.value;
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * The whole instant in the reader's zone, zone named: what a relative label
 * hides, shown on hover and to a screen reader.
 */
export function absoluteText(at: string | number | Date | null | undefined): string {
  const ms = instantOf(at);
  if (ms === null) return typeof at === 'string' ? at : '';
  return parts(ms, { dateStyle: 'medium', timeStyle: 'long' }) ?? new Date(ms).toISOString();
}

/** `Sep 12, 2026`: the date alone, in the reader's zone. */
export function dateText(at: string | number | Date | null | undefined): string {
  const ms = instantOf(at);
  if (ms === null) return typeof at === 'string' ? at : '';
  return (
    parts(ms, { year: 'numeric', month: 'short', day: 'numeric' }) ??
    new Date(ms).toISOString().slice(0, 10)
  );
}

/** `14:02:31` in the reader's zone; pair it with `zoneLabel()` in a heading. */
export function clockText(at: string | number | Date | null | undefined): string {
  const ms = instantOf(at);
  if (ms === null) return typeof at === 'string' ? at : '';
  return (
    parts(ms, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) ??
    new Date(ms).toISOString().slice(11, 19)
  );
}

/** A chart axis tick: the date over a long span, the clock over a short one. */
export function tickText(at: Date | number, spanHours: number): string {
  const ms = instantOf(at);
  if (ms === null) return '';
  return spanHours > 48
    ? (parts(ms, { month: 'short', day: 'numeric' }) ?? dateText(ms))
    : (parts(ms, { hour: '2-digit', minute: '2-digit', hour12: false }) ?? clockText(ms));
}

/** A chart axis end: `Sep 19, 14:00`. */
export function stampText(at: string | number | Date): string {
  const ms = instantOf(at);
  if (ms === null) return '';
  return parts(ms, { month: 'short', day: 'numeric', hour: '2-digit' }) ?? absoluteText(ms);
}

/** `YYYY-MM-DD` in UTC: a key events are grouped by, never a label. */
export function utcDayKey(at: string | number | Date | null | undefined): string {
  const ms = instantOf(at);
  return ms === null ? '' : new Date(ms).toISOString().slice(0, 10);
}

/** The UTC day `days` after `date` (a `YYYY-MM-DD` key), as another key. */
export function shiftDayKey(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(at.getTime())) return date;
  at.setUTCDate(at.getUTCDate() + days);
  return utcDayKey(at);
}

/** An instant as the API takes it: UTC, to the second. Null when unreadable. */
export function rfc3339Seconds(at: string | number | Date | null | undefined): string | null {
  const ms = instantOf(at);
  return ms === null ? null : `${new Date(ms).toISOString().slice(0, 19)}Z`;
}

/** `YYYY-MM-DD` in the reader's zone: the day a clock time belongs to. */
export function localDayKey(at: string | number | Date | null | undefined): string {
  const ms = instantOf(at);
  if (ms === null) return '';
  const d = new Date(ms);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

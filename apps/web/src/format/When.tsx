// When.tsx — the one way the UI shows an instant.
//
// Relative text a reader can scan ("12 min ago"), with the whole instant and
// its zone in `title` and the machine form in `dateTime`, so hovering — or
// reading the markup — always answers "when exactly?".

import { absoluteText, instantOf, relativeText, rfc3339Seconds } from './when';

export function When({
  at,
  now,
  fallback = '—',
  label,
  className,
}: {
  at: string | number | Date | null | undefined;
  /** The clock to measure against; tests freeze it, pages pass their tick. */
  now?: Date | number;
  /** What to show when there is no instant at all. */
  fallback?: string;
  /** What the instant is, said before it in the title: `Last push: …`. */
  label?: string;
  className?: string;
}): JSX.Element {
  if (instantOf(at) === null) {
    const raw = typeof at === 'string' && at !== '' ? at : fallback;
    return <span className={className}>{raw}</span>;
  }
  const absolute = absoluteText(at);
  return (
    <time
      className={className}
      dateTime={rfc3339Seconds(at) ?? undefined}
      title={label ? `${label}: ${absolute}` : absolute}
    >
      {relativeText(at, now)}
    </time>
  );
}

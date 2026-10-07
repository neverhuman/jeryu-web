// InlineProse.tsx — a summary or a reason shown as its writer meant it.
//
// The spans come from `proseModel`; this puts each one in the element that
// says what it is, and nothing here turns text into markup.
//
// A summary also carries its subject as a link ("Gate failed on
// jeryu/jeryu-web#35"), and the subject can sit inside the emphasis the writer
// put around the whole sentence. So the link is handed in and placed into the
// span that names it, keeping that span's own emphasis on the words either
// side; a summary that does not name its subject gets the link after it.
// A link in the text itself goes through the router when it points inside this
// instance, and opens in its own tab when it points at the web.

import { Fragment } from 'react';
import { Link } from 'react-router-dom';

import type { EventLink } from './activityModel';
import { proseSpans, type ProseSpan } from './proseModel';

export function InlineProse({
  text,
  link = null,
}: {
  text: string;
  /** The subject of a summary, placed where the text names it. */
  link?: EventLink | null;
}): JSX.Element {
  const spans = proseSpans(text);
  const at = link ? spans.findIndex((span) => span.kind !== 'link' && span.text.includes(link.label)) : -1;
  return (
    <>
      {spans.map((span, index) =>
        link && index === at ? (
          <Fragment key={index}>{split(span, link)}</Fragment>
        ) : (
          <Fragment key={index}>{element(span)}</Fragment>
        ),
      )}
      {link && at < 0 ? (
        <>
          {spans.length > 0 ? ' ' : null}
          <Link to={link.to} className="activity-row__link">
            {link.label}
          </Link>
        </>
      ) : null}
    </>
  );
}

/** The span with the subject's words handed to the link, emphasis kept. */
function split(span: ProseSpan, link: EventLink): JSX.Element {
  const cut = span.text.indexOf(link.label);
  return (
    <>
      {element({ ...span, text: span.text.slice(0, cut) } as ProseSpan)}
      <Link to={link.to} className="activity-row__link">
        {link.label}
      </Link>
      {element({ ...span, text: span.text.slice(cut + link.label.length) } as ProseSpan)}
    </>
  );
}

function element(span: ProseSpan): JSX.Element | null {
  if (span.text === '') return null;
  if (span.kind === 'strong') return <strong>{span.text}</strong>;
  if (span.kind === 'em') return <em>{span.text}</em>;
  if (span.kind === 'code') return <code>{span.text}</code>;
  if (span.kind === 'link') {
    return span.href.startsWith('/') ? (
      <Link to={span.href} className="activity-row__link">
        {span.text}
      </Link>
    ) : (
      <a href={span.href} target="_blank" rel="noreferrer">
        {span.text}
      </a>
    );
  }
  return <>{span.text}</>;
}

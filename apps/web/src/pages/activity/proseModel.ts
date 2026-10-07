// proseModel.ts — the inline Markdown a producer writes into an event's
// summary or reason, read as spans.
//
// The reasons come from the tools that report the events, and those write for
// a Markdown reader: `**Red team: approved.**`, a `just required` in
// backticks, a link to the run. Shown as they arrive, the asterisks and
// backticks are on the screen and the emphasis is not, which is the one thing
// the writer was asking for.
//
// So the text is split here into the few spans that carry meaning in one line
// — bold, emphasis, code, link — and everything else stays the text it was.
// Only these four: a reason is a sentence, not a page, and a heading or a list
// in the middle of a row would be a worse answer than the asterisks. Nothing
// is parsed as HTML at any point, and a link is kept only when it points at
// this instance or at the web over http(s), so a `javascript:` href in a
// reason is read as the words it is made of.

/** One piece of a reason or a summary, in the form it should be shown in. */
export type ProseSpan =
  | { kind: 'text' | 'strong' | 'em' | 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

/**
 * The spans in one line of text. Code first, so a backticked `**` keeps its
 * asterisks; the link before the single-mark emphasis, so an underscore in a
 * URL does not start one.
 */
const INLINE =
  /`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\[([^\]\n]+)\]\(([^)\s]+)\)|\*([^*\n]+)\*|_([^_\n]+)_/g;

/** Where a link in a reason may point: this instance, or the web. */
const SAFE_HREF = /^(https?:\/\/|\/)/;

/**
 * A summary or a reason as spans. Plain text comes back as one text span, so
 * the common row costs one pass and no markup.
 */
export function proseSpans(text: string): ProseSpan[] {
  const spans: ProseSpan[] = [];
  let at = 0;
  INLINE.lastIndex = 0;
  for (let match = INLINE.exec(text); match; match = INLINE.exec(text)) {
    const [whole, code, strong, strongUnderscore, label, href, em, emUnderscore] = match;
    const span = spanOf({ code, strong: strong ?? strongUnderscore, label, href, em: em ?? emUnderscore });
    // A link pointing somewhere we will not follow keeps its own words, with
    // the brackets and the href gone: the sentence still reads.
    if (!span) {
      if (label === undefined) continue;
      push(spans, text.slice(at, match.index));
      push(spans, label);
      at = match.index + whole.length;
      continue;
    }
    push(spans, text.slice(at, match.index));
    spans.push(span);
    at = match.index + whole.length;
  }
  push(spans, text.slice(at));
  return spans;
}

function spanOf({
  code,
  strong,
  label,
  href,
  em,
}: {
  code?: string;
  strong?: string;
  label?: string;
  href?: string;
  em?: string;
}): ProseSpan | null {
  if (code !== undefined) return { kind: 'code', text: code };
  if (strong !== undefined) return { kind: 'strong', text: strong };
  if (label !== undefined && href !== undefined) {
    return SAFE_HREF.test(href) ? { kind: 'link', text: label, href } : null;
  }
  if (em !== undefined) return { kind: 'em', text: em };
  return null;
}

/** Text spans are joined as they come, and an empty one is not a span. */
function push(spans: ProseSpan[], text: string): void {
  if (text === '') return;
  const last = spans[spans.length - 1];
  if (last && last.kind === 'text') last.text += text;
  else spans.push({ kind: 'text', text });
}

/** The same text with its marks taken off: what a `title` or a label wants. */
export function proseText(text: string): string {
  return proseSpans(text)
    .map((span) => span.text)
    .join('');
}

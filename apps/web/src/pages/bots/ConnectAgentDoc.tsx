// ConnectAgentDoc.tsx — a link to the agent setup page the API serves.
//
// Shown on Settings and beside the agent tokens on /bots. The page is
// Markdown the server's docs route serves at a relative path, so the link
// names whichever forge served this page. It is a page to read, not an API
// call, so it is not an `endpoints` builder.

import { CONNECT_AGENT_DOC_HREF, CONNECT_AGENT_DOC_NOTE } from './botModel';

export function ConnectAgentDoc({
  testId,
  className = 'page__note',
}: {
  testId: string;
  className?: string;
}): JSX.Element {
  return (
    <p className={className} data-testid={testId}>
      <a
        href={CONNECT_AGENT_DOC_HREF}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`${testId}-link`}
      >
        Agent setup page
      </a>{' '}
      — {CONNECT_AGENT_DOC_NOTE}
    </p>
  );
}

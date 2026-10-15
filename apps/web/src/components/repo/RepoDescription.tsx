import { ExternalLink } from 'lucide-react';

/** Link the GitHub mirror notation supplied in repository descriptions. */
export function RepoDescription({ text }: { text: string }): JSX.Element {
  const parts = text.split(/(\(GitHub mirror: [A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+\))/g);
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) return part;
        const repo = part.slice('(GitHub mirror: '.length, -1);
        return (
          <a
            key={index}
            href={`https://github.com/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${part} (opens in a new window)`}
          >
            {part} <ExternalLink size={14} aria-hidden="true" />
          </a>
        );
      })}
    </>
  );
}

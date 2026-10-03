// fleet/RunnerEvaluates.tsx — the line under a runner's code that says what
// evaluates a pull request there: "evaluates with jankurai (governed) 1.6.11
// (b05c03b) · +8 tools". It is the summary of a disclosure that lists every
// tool with its version and short hash, so the whole list is one Tab and one
// Enter away. Amber when the PATH copy of the scorer is another build, or when
// this runner scores with a different build than most of its section.

import type { RunnerTool } from '../../api/types';
import { evaluatesLine, otherToolsWords, shortHash } from './runnerTools';

export function RunnerEvaluates({
  tools,
  scorerDiffers,
  testId,
}: {
  tools: readonly RunnerTool[];
  /** This runner's scorer build is not the one most of its section uses. */
  scorerDiffers: boolean;
  testId: string;
}): JSX.Element | null {
  const line = evaluatesLine(tools);
  if (!line) return null;
  const others = otherToolsWords(line.others);
  return (
    <details className="fleet__node-tools" data-testid={testId}>
      <summary>
        evaluates with{' '}
        {line.scorer ? (
          <>
            <span className={scorerDiffers ? 'fleet__tone--warn' : undefined}>
              {line.scorer}
              {line.scorerBuild ? (
                <>
                  {' '}
                  <code>{line.scorerBuild}</code>
                </>
              ) : null}
            </span>
            {scorerDiffers ? (
              <span
                className="fleet__tone--warn"
                data-testid={`${testId}-differs`}
              >
                {' '}
                · differs
              </span>
            ) : null}
            {line.pathCopy ? (
              <span
                className="fleet__tone--warn"
                data-testid={`${testId}-path`}
              >
                {' '}
                · PATH copy <code>{line.pathCopy}</code> differs
              </span>
            ) : null}
            {others ? ` · ${others}` : ''}
          </>
        ) : (
          `${line.others} tool${line.others === 1 ? '' : 's'}`
        )}
      </summary>
      <ul className="fleet__tool-list" aria-label="Evaluation tools">
        {tools.map((tool) => (
          <li key={tool.name}>
            <code>{tool.name}</code>
            {tool.version ? ` ${tool.version}` : ''}
            {tool.sha256 ? (
              <>
                {' '}
                <code title={`sha256 ${tool.sha256}`}>{shortHash(tool.sha256)}</code>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

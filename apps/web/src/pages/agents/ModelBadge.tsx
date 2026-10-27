// ModelBadge.tsx — the model an agent session runs, as its own small badge
// beside the agent's name rather than folded into it, so the two read apart at
// a glance. Presence reports `model` per session; a session that names none
// (a gate run, a tool) gets no badge, since there is no model to be unsure of.

import './ModelBadge.css';

export function ModelBadge({ model, testId }: { model: string; testId?: string }): JSX.Element {
  return (
    <span className="model-badge" title={`Model: ${model}`} data-testid={testId}>
      {model}
    </span>
  );
}

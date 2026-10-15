import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentBot } from '../AgentBot';
import type { BotAgent } from '../agentBotModel';

afterEach(cleanup);

const agent: BotAgent = { id: 'external:claude-1', harness: 'claude-code', type: 'worker', status: 'working' };

describe('AgentBot', () => {
  it('is decorative unless it is given a name', () => {
    const { container } = render(<AgentBot agent={agent} mode="badge" size={40} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveClass('agent-avatar--badge', 'agent-avatar--working');
  });

  it('names itself as an image when labelled', () => {
    render(<AgentBot agent={agent} label="claude-code, working" />);
    expect(screen.getByRole('img', { name: 'claude-code, working' })).toBeInTheDocument();
  });

  it('draws the full body taller than wide, with a body clip only in full mode', () => {
    const { container } = render(<AgentBot agent={agent} size={120} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('height', '148');
    expect(container.querySelectorAll('clipPath')).toHaveLength(2);
    expect(container.querySelector('.agent-avatar__arm--right')).not.toBeNull();
  });

  it('gives two bots on one page their own gradient ids', () => {
    const { container } = render(<><AgentBot agent={agent} /><AgentBot agent={{ ...agent, id: 'external:other' }} /></>);
    const ids = Array.from(container.querySelectorAll('linearGradient'), (node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws a bot for a hostile harness name instead of throwing', () => {
    for (const harness of ['__proto__', 'constructor']) {
      const { container, unmount } = render(<AgentBot agent={{ ...agent, harness }} />);
      expect(container.querySelector('svg.agent-avatar')).not.toBeNull();
      unmount();
    }
  });

  it('carries the status as a class so motion is pure CSS', () => {
    const { container, rerender } = render(<AgentBot agent={agent} />);
    rerender(<AgentBot agent={{ ...agent, status: 'done' }} />);
    expect(container.querySelector('svg')).toHaveClass('agent-avatar--done');
    expect(container.querySelector('.agent-avatar__bubble--done')).not.toBeNull();
  });
});

// JoinWaitlistLink.test.tsx — the waitlist link is reusable: two on one page
// keep their own descriptions.

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { JoinWaitlistLink } from '../account/JoinWaitlistLink';

const WAITLIST = { href: 'https://waitlist.example.com/join', host: 'waitlist.example.com' };

describe('JoinWaitlistLink', () => {
  it('gives each instance its own description id', () => {
    render(
      <MemoryRouter>
        <JoinWaitlistLink waitlist={WAITLIST} className="a" />
        <JoinWaitlistLink waitlist={WAITLIST} className="b" />
      </MemoryRouter>
    );
    const links = screen.getAllByRole('link', { name: 'Join the waitlist' });
    expect(links).toHaveLength(2);
    const ids = links.map((link) => link.getAttribute('aria-describedby'));
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
    links.forEach((link) =>
      expect(link).toHaveAccessibleDescription('Opens waitlist.example.com, a separate site.')
    );
    expect(document.querySelectorAll(`[id="${ids[0]}"]`)).toHaveLength(1);
  });
});

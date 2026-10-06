// UseThisWhen.test.tsx — the line under a System page's title comes from the
// registry, and says nothing at all for a destination without one.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { destinationById } from '../navDestinations';
import { UseThisWhen } from '../UseThisWhen';

describe('UseThisWhen', () => {
  it('says the registry’s line for a System destination', () => {
    render(<UseThisWhen id="nav.runners" />);
    expect(screen.getByTestId('use-this-when-nav.runners')).toHaveTextContent(
      destinationById('nav.runners')?.useWhen as string
    );
  });

  it('renders nothing for a destination that has no line', () => {
    const { container } = render(<UseThisWhen id="nav.settings" />);
    expect(container).toBeEmptyDOMElement();
  });
});

// useFamilyScope.test.tsx — the shell-wide family scope: what the URL states,
// what the tab remembers, and what every link then carries.
//
// Invented families only (acme, globex, initech): this repository is public.

import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { FAMILY_SCOPE_STORAGE_KEY } from '../familyScope';
import { FamilyScopeProvider, useFamilyScope } from '../FamilyScopeProvider';

function Probe(): JSX.Element {
  const scope = useFamilyScope();
  const { pathname, search } = useLocation();
  return (
    <div>
      <p data-testid="where">{`${pathname}${search}`}</p>
      <p data-testid="family">{scope.family}</p>
      <p data-testid="carried">{scope.carried}</p>
      <p data-testid="outside">{scope.outside}</p>
      <p data-testid="label">{scope.label}</p>
      <p data-testid="active">{String(scope.active)}</p>
      <p data-testid="work-link">{scope.scopedPath('/work')}</p>
      <p data-testid="releases-link">{scope.scopedPath('/releases')}</p>
      <p data-testid="other-family-link">{scope.scopedPath('/releases/family/initech')}</p>
      <button type="button" onClick={() => scope.setFamily('globex-split')}>
        globex
      </button>
      <button type="button" onClick={() => scope.setFamily('acme', { drop: ['todo'] })}>
        acme without the todo
      </button>
      <button type="button" onClick={() => scope.clearFamily()}>
        all
      </button>
      <button type="button" onClick={() => scope.switchToOutside()}>
        switch
      </button>
      <button type="button" onClick={() => scope.setFamily('initech', { to: '/work' })}>
        initech on Work
      </button>
    </div>
  );
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <FamilyScopeProvider>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </FamilyScopeProvider>
    </MemoryRouter>
  );
}

const click = (name: string): void => {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

const text = (id: string): string => screen.getByTestId(id).textContent ?? '';

describe('useFamilyScope', () => {
  it('reads the scope the URL states, in either spelling', () => {
    renderAt('/work?family=acme-split&todo=7');
    expect(text('family')).toBe('acme');
    expect(text('label')).toBe('acme');
    expect(text('active')).toBe('true');
  });

  it('falls back to the family this tab last chose', () => {
    window.sessionStorage.setItem(FAMILY_SCOPE_STORAGE_KEY, 'globex');
    renderAt('/runners');
    expect(text('family')).toBe('globex');
    expect(text('active')).toBe('true');
  });

  it('remembers what an address states, for the pages that state nothing', () => {
    renderAt('/releases/family/initech');
    expect(window.sessionStorage.getItem(FAMILY_SCOPE_STORAGE_KEY)).toBe('initech');
  });

  it('every family is the scope when nothing states one', () => {
    renderAt('/work');
    expect(text('family')).toBe('');
    expect(text('active')).toBe('false');
  });

  it('carries the scope into every link, in that page the way that page spells it', () => {
    renderAt('/work?family=acme');
    expect(text('work-link')).toBe('/work?family=acme');
    expect(text('releases-link')).toBe('/releases/family/acme');
    // A link that names a family of its own keeps it: it is not a bare destination.
    expect(text('other-family-link')).toBe('/releases/family/initech');
  });

  it('setting a family states it here and remembers it for the next page', () => {
    renderAt('/work?todo=7');
    click('globex');
    expect(text('where')).toBe('/work?todo=7&family=globex');
    expect(text('family')).toBe('globex');
    expect(window.sessionStorage.getItem(FAMILY_SCOPE_STORAGE_KEY)).toBe('globex');
  });

  it('drops the parameters the page asks it to drop', () => {
    renderAt('/work?todo=7');
    click('acme without the todo');
    expect(text('where')).toBe('/work?family=acme');
  });

  it('clearing shows every family, here and on the pages after this one', () => {
    renderAt('/releases/family/acme');
    click('all');
    expect(text('where')).toBe('/releases');
    expect(text('family')).toBe('');
    expect(window.sessionStorage.getItem(FAMILY_SCOPE_STORAGE_KEY)).toBeNull();
  });

  it('clearing wins over what the tab remembered', () => {
    window.sessionStorage.setItem(FAMILY_SCOPE_STORAGE_KEY, 'acme');
    renderAt('/work');
    expect(text('family')).toBe('acme');
    click('all');
    expect(text('family')).toBe('');
    expect(text('where')).toBe('/work');
  });

  it('opens another family without moving the scope, until that is asked for', () => {
    window.sessionStorage.setItem(FAMILY_SCOPE_STORAGE_KEY, 'acme');
    renderAt('/work?family=globex&todo=7');
    // The page shows the family its address states; the tab still carries acme.
    expect(text('family')).toBe('globex');
    expect(text('carried')).toBe('acme');
    expect(text('outside')).toBe('globex');
    // And a link out of this page carries the scope, not the visited family.
    expect(text('work-link')).toBe('/work?family=acme');
    expect(window.sessionStorage.getItem(FAMILY_SCOPE_STORAGE_KEY)).toBe('acme');

    click('switch');
    expect(text('carried')).toBe('globex');
    expect(text('outside')).toBe('');
    expect(window.sessionStorage.getItem(FAMILY_SCOPE_STORAGE_KEY)).toBe('globex');
  });

  it('takes the family to another page when one is asked for', () => {
    renderAt('/work/7');
    click('initech on Work');
    expect(text('where')).toBe('/work?family=initech');
    expect(text('family')).toBe('initech');
    expect(text('outside')).toBe('');
  });

  it('works where browser storage does not', () => {
    const real = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new DOMException('disabled', 'SecurityError');
        },
        setItem: () => {
          throw new DOMException('disabled', 'SecurityError');
        },
        removeItem: () => {
          throw new DOMException('disabled', 'SecurityError');
        },
      },
    });
    try {
      renderAt('/work');
      click('globex');
      expect(text('family')).toBe('globex');
      expect(text('where')).toBe('/work?family=globex');
    } finally {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: real });
    }
  });

  it('outside the provider, every family is in scope and a link is untouched', () => {
    render(
      <MemoryRouter initialEntries={['/work?family=acme']}>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    );
    expect(text('family')).toBe('');
    expect(text('work-link')).toBe('/work');
  });
});

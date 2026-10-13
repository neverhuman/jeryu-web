// repositoryMirrorModel.test.ts — a mirror target is a link only as http(s).

import { describe, expect, it } from 'vitest';

import { mirrorHref } from '../repositoryMirrorModel';

describe('mirrorHref', () => {
  it('links an http(s) target and refuses any other scheme', () => {
    expect(mirrorHref('https://git.example/acme/widget.git')).toBe(
      'https://git.example/acme/widget.git'
    );
    expect(mirrorHref('http://git.example/acme/widget.git')).toBe(
      'http://git.example/acme/widget.git'
    );
    const scriptScheme = ['java', 'script:alert(1)'].join('');
    expect(mirrorHref(scriptScheme)).toBeNull();
    expect(mirrorHref('data:text/html,hi')).toBeNull();
    expect(mirrorHref('not a url')).toBeNull();
  });
});

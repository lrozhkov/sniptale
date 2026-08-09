import { describe, expect, it } from 'vitest';
import { canonicalizeSurfaceCss, projectCanonicalSurfaceCss } from './surface-css';

describe('Surface CSS grammar', () => {
  it('canonicalizes declarations without a DOM and preserves backdrop function order', () => {
    expect(
      canonicalizeSurfaceCss(
        'color:#fff; backdrop-filter: blur(0px) saturate(120%) brightness(1.040);'
      )
    ).toBe(
      ['backdrop-filter: blur(0px) saturate(1.2) brightness(1.04);', 'color: #fff;'].join('\n')
    );
    expect(projectCanonicalSurfaceCss('backdrop-filter: blur(16px);')).toEqual({
      backdropFilter: 'blur(16px)',
    });
  });

  it.each([
    'backdrop-filter: blur(-1px);',
    'backdrop-filter: blur(41px);',
    'backdrop-filter: blur(1e2px);',
    'backdrop-filter: blur(1.2345px);',
    'backdrop-filter: blur(1px) blur(2px);',
    'backdrop-filter: hue-rotate(20deg);',
    'backdrop-filter: saturate(301%);',
    'backdrop-filter: contrast(3.001); trailing',
    'background: #fff; background-color: #000;',
    'position: fixed;',
    'color: red; width: 1px;',
    'background-image: url(https://example.test/x);',
    'background-image: src("https://example.test/x");',
    'background-image: s\\72 c("https://example.test/x");',
    'background-image: s/**/rc("https://example.test/x");',
    'color: var(--secret);',
    'color: red !important;',
    'color: red !/**/important;',
  ])('fails the whole value closed for %s', (value) => {
    expect(canonicalizeSurfaceCss(value)).toBeNull();
  });

  it('enforces declaration and character budgets', () => {
    expect(canonicalizeSurfaceCss(`${' '.repeat(4_000)}x`)).toBeNull();
    expect(
      canonicalizeSurfaceCss(Array.from({ length: 33 }, (_, index) => `x-${index}: 1`).join(';'))
    ).toBeNull();
  });
});

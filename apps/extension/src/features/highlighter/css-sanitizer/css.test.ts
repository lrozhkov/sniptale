// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

describe('css-sanitizer validateCssString', () => {
  it('reports blocked props while preserving safe styles', async () => {
    const { validateCssString } = await import('./css');

    expect(
      validateCssString('font-size: 16px; margin-top: 10px; padding-left: 4px; color: green;')
    ).toEqual({
      blockedProps: ['margin-top', 'padding-left'],
      hasBlockedProps: true,
      rawError: null,
      styles: {
        color: 'green',
        fontSize: '16px',
      },
    });
  });

  it('recognizes shorthands that CSSOM expands into multiple longhand entries', async () => {
    const { validateCssString } = await import('./css');

    expect(validateCssString('border: 20px dashed blue; box-shadow: 0 0 4px red;')).toMatchObject({
      rawError: null,
      styles: {
        border: '20px dashed blue',
        boxShadow: '0 0 4px red',
      },
    });
  });

  it.each([
    'made-up: 1; color: red;',
    'color: red; broken',
    'background-image: u&#114;l(https://attacker.example/pixel);',
    'background-image: url(https://attacker.example/pixel);',
    'background-image: image-set("https://attacker.example/pixel" 1x);',
    'background-image: var(--page-image);',
    'color: red !important;',
  ])('fails closed when any declaration is not recognized: %s', async (css) => {
    const { validateCssString } = await import('./css');
    expect(validateCssString(css)).toMatchObject({
      blockedProps: [],
      hasBlockedProps: false,
      rawError: 'shared.runtime.cssRecognitionFailed',
      styles: {},
    });
  });

  it('accounts for quoted separators, escapes, and comments without splitting declarations', async () => {
    const { validateCssString } = await import('./css');
    expect(
      validateCssString('font-family: "A; B\\ C"; /* keep ; inside comment */ color: rgb(1, 2, 3);')
    ).toMatchObject({
      rawError: null,
      styles: { color: 'rgb(1, 2, 3)', fontFamily: '"A; B C"' },
    });
  });

  it.each([
    'color: red; /* unclosed',
    'font-family: "unclosed;',
    'filter: drop-shadow(0 0 2px red;',
    'filter: drop-shadow(0 0 2px red));',
  ])('rejects unbalanced declaration syntax: %s', async (css) => {
    const { validateCssString } = await import('./css');
    expect(validateCssString(css)).toMatchObject({
      blockedProps: [],
      hasBlockedProps: false,
      styles: {},
    });
    expect(validateCssString(css).rawError).not.toBeNull();
  });
});

describe('css-sanitizer empty input', () => {
  it('returns an empty success payload for empty css input', async () => {
    const { validateCssString } = await import('./css');

    expect(validateCssString('')).toEqual({
      blockedProps: [],
      hasBlockedProps: false,
      rawError: null,
      styles: {},
    });
  });
});

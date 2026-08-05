// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { resolveStepBadgeCustomCss, validateStepBadgeCustomCss } from './step-badge-custom-css';

it('resolves independent safe badge and text decorations', () => {
  expect(
    resolveStepBadgeCustomCss(`
[badge]
border-radius: 6px;
box-shadow: 0 2px 6px #0004;
[text]
font-style: italic;
text-transform: uppercase;
`)
  ).toMatchObject({
    error: null,
    styles: {
      badge: { borderRadius: '6px', boxShadow: '0 2px 6px #0004' },
      text: { fontStyle: 'italic', textTransform: 'uppercase' },
    },
  });
});

it('rejects geometry, unknown sections, and unsafe values without returning partial styles', () => {
  expect(resolveStepBadgeCustomCss('[badge]\nposition: fixed;').error).toBe('blocked');
  expect(resolveStepBadgeCustomCss('[badge]\nwidth: 200px;').error).toBe('blocked');
  expect(resolveStepBadgeCustomCss('[value]\ncolor: red;').error).toBe('syntax');
  expect(resolveStepBadgeCustomCss('[badge]\nbackground: url(https://example.com/x);').error).toBe(
    'unsafe'
  );
  expect(resolveStepBadgeCustomCss('[text]\ncolor: var(--page-color);').error).toBe('unsafe');
  expect(
    resolveStepBadgeCustomCss('[badge]\nbackground: src("https://example.com/x");').error
  ).toBe('unsafe');
  expect(
    resolveStepBadgeCustomCss('[badge]\nbackground: image("https://example.com/x");').error
  ).toBe('unsafe');
});

it('parses quoted delimiters and comments without widening the property policy', () => {
  expect(
    validateStepBadgeCustomCss(
      '[text]\nfont-family: "A; B"; /* harmless comment */ text-shadow: 0 0 1px #000;'
    )
  ).toEqual({ blockedProperties: [], error: null });
  expect(validateStepBadgeCustomCss('   ')).toEqual({ blockedProperties: [], error: null });
  expect(validateStepBadgeCustomCss('[badge]\nwidth: 1px; height: 2px;')).toEqual({
    blockedProperties: ['width', 'height'],
    error: 'blocked',
  });
});

it.each([
  '[badge]\ncolor red;',
  '[badge]\n: red;',
  '[badge]\ncolor: ;',
  '[badge]\n1color: red;',
  '[badge]\ncolor: red !important;',
  '[badge]\ncolor: rgb(1, 2, 3;',
  '[badge]\ncolor: "red;',
  '[badge]\ncolor: red; /* open',
  '[badge]\ncolor: rgb(1, 2, 3));',
])('rejects malformed declarations before persistence: %s', (value) => {
  expect(validateStepBadgeCustomCss(value).error).toBe('syntax');
});

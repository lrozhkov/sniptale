// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { validateCssDeclaration } from './validation';

it('normalizes an allowed direct CSS declaration', () => {
  const element = document.createElement('div');
  expect(validateCssDeclaration(element, { property: 'color', value: '#ff0000' })).toEqual(
    expect.objectContaining({
      property: 'color',
      source: 'inspector',
      status: 'valid',
      value: 'rgb(255, 0, 0)',
    })
  );
});

it('rejects URL and CSS variable payloads', () => {
  const element = document.createElement('div');
  expect(validateCssDeclaration(element, { property: 'box-shadow', value: 'url(x)' }).status).toBe(
    'invalid'
  );
  expect(
    validateCssDeclaration(element, { property: 'color', value: 'var(--host-color)' }).status
  ).toBe('invalid');
});

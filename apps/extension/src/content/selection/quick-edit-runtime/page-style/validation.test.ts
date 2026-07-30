// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { validateCssDeclaration } from './validation';

describe('page-style canonical declaration validation', () => {
  const element = document.createElement('div');

  it('normalizes safe values, removal, and important priority', () => {
    expect(
      validateCssDeclaration(element, {
        priority: 'IMPORTANT',
        property: 'color',
        value: 'rgb(255, 0, 0)',
      })
    ).toMatchObject({
      priority: 'important',
      property: 'color',
      status: 'valid',
      value: 'rgb(255, 0, 0)',
    });
    expect(validateCssDeclaration(element, { property: 'color', value: null })).toMatchObject({
      priority: '',
      status: 'valid',
      value: '',
    });
  });

  it('rejects unsafe syntax, variables, malformed priority, and unsupported properties', () => {
    expect(
      validateCssDeclaration(element, { property: 'color', value: 'var(--page-color)' })
    ).toMatchObject({ status: 'invalid' });
    expect(
      validateCssDeclaration(element, {
        property: 'background-image',
        value: 'url(https://tracker.test/pixel.png)',
      })
    ).toMatchObject({ status: 'invalid' });
    expect(
      validateCssDeclaration(element, {
        priority: 'urgent',
        property: 'color',
        value: 'red',
      })
    ).toMatchObject({ status: 'invalid' });
    expect(
      validateCssDeclaration(element, {
        property: 'color',
        value: 'red',
        ...({ property: 'position' } as object),
      })
    ).toMatchObject({ status: 'invalid' });
  });

  it('accepts only the exact trusted blob URL produced by the asset resolver', () => {
    expect(
      validateCssDeclaration(element, {
        assetUrl: 'blob:https://example.test/asset',
        property: 'background-image',
        source: 'resolved-asset',
        value: 'url("blob:https://example.test/asset")',
      })
    ).toMatchObject({ source: 'resolved-asset', status: 'valid' });
    expect(
      validateCssDeclaration(element, {
        assetUrl: 'blob:https://example.test/asset',
        property: 'background-image',
        source: 'resolved-asset',
        value: 'url("blob:https://attacker.test/other")',
      })
    ).toMatchObject({ status: 'invalid' });
  });

  it.each([
    'image-set("https://tracker.test/pixel.png" 1x)',
    '-webkit-image-set("data:image/png;base64,abc" 1x)',
    'image("https://tracker.test/pixel.png")',
    'i\\6d age-set("https://tracker.test/escaped.png" 1x)',
  ])('rejects quoted URL-bearing image function %s', (value) => {
    expect(
      validateCssDeclaration(element, {
        property: 'background-image',
        value,
      })
    ).toMatchObject({ status: 'invalid' });
  });
});

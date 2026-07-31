import { describe, expect, it } from 'vitest';
import { isPageStyleProperty, PAGE_STYLE_ALLOWED_PROPERTIES } from '.';

describe('page style declaration contract', () => {
  it('accepts only the direct design-review property allowlist', () => {
    expect(PAGE_STYLE_ALLOWED_PROPERTIES).toContain('background-color');
    expect(PAGE_STYLE_ALLOWED_PROPERTIES).toContain('box-shadow');
    expect(PAGE_STYLE_ALLOWED_PROPERTIES).not.toContain('background-image');
    expect(isPageStyleProperty('color')).toBe(true);
    expect(isPageStyleProperty('background-image')).toBe(false);
  });
});

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  createParserContext,
  createParserSection,
} from '../../../../../../../../tooling/test/support/content/parsers/generic/form-fields';

describe('form-fields test helpers', () => {
  it('creates stable parser sections for owner-local specs', () => {
    expect(createParserSection('Billing form')).toEqual({
      type: 'section',
      id: 'section-billing-form',
      title: 'Billing form',
      children: [],
      selected: true,
    });
  });

  it('creates parser contexts with canonical metadata and original-element passthrough', () => {
    const section = createParserSection('Existing section');
    const context = createParserContext('https://example.test/portal/', section);
    const node = document.createElement('div');

    expect(context.currentSection).toBe(section);
    expect(context.result.structure).toEqual([section]);
    expect(context.result.meta?.url).toBe('https://example.test/portal/');
    expect(context.getOriginalElementFn?.(node)).toBe(node);
  });
});

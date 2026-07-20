// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { findFieldElementById } from './field-search';

const mocks = vi.hoisted(() => ({
  fallback: vi.fn(),
}));

vi.mock('./legacy-fallback', () => ({
  findElementWithLegacyFallback: mocks.fallback,
}));

afterEach(() => {
  document.body.replaceChildren();
  mocks.fallback.mockReset();
});

function buildTree(): ParsedDOMTree {
  return {
    context: 'test',
    title: 'Test page',
    structure: [
      {
        type: 'section',
        id: 'section-1',
        title: 'Общая информация',
        selected: false,
        children: [
          {
            type: 'field',
            id: 'field-row-dynamic-field',
            label: 'Стоимость',
            selector: '#row-dynamic-field .FormField-EA__fieldBody a',
            selected: false,
            value: '123',
            valueType: 'link',
          },
        ],
      },
    ],
  };
}

describe('field-search', () => {
  it('returns the matching field node and resolved element', () => {
    const target = document.createElement('a');
    mocks.fallback.mockReturnValue(target);

    const result = findFieldElementById('field-row-dynamic-field', buildTree());

    expect(result?.element).toBe(target);
    expect(result?.node.id).toBe('field-row-dynamic-field');
  });

  it('returns null when the field is missing or legacy resolution fails', () => {
    mocks.fallback.mockReturnValue(null);

    expect(findFieldElementById('missing', buildTree())).toBeNull();
  });
});

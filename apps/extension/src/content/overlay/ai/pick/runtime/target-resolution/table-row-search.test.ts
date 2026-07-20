// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { findTableRowElementById } from './table-row-search';

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
            type: 'table',
            id: 'table-comments',
            headers: ['Автор', 'Дата', 'Текст'],
            selected: false,
            rows: [
              {
                id: 'comment-comment$104306031',
                selected: false,
                selector: '#comment\\$104306031',
                data: {
                  Автор: 'Тестов Тест Тестович',
                  Дата: '01.01.2000 10:00',
                  Текст: 'Старый текст',
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('table-row-search', () => {
  it('returns the matching table row node and resolved element', () => {
    const target = document.createElement('div');
    mocks.fallback.mockReturnValue(target);

    const result = findTableRowElementById('comment-comment$104306031', buildTree());

    expect(result?.element).toBe(target);
    expect(result?.node.id).toBe('comment-comment$104306031');
  });

  it('returns null when the row is missing or legacy resolution fails', () => {
    mocks.fallback.mockReturnValue(null);

    expect(findTableRowElementById('missing', buildTree())).toBeNull();
  });
});

// @vitest-environment jsdom

import { expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import type { GenericContentExtraction } from '../types';
import {
  hasExplicitSearchSignal,
  mergeGenericExtractions,
  resolveGenericFallbackTitle,
} from './helpers';

function createContext(overrides?: Partial<TraversalContext>): TraversalContext {
  return {
    currentSection: null,
    globalFieldIndex: 1,
    globalTableIndex: 1,
    pendingFields: new Map<string, never[]>(),
    processedAttrLists: new Set<HTMLTableElement>(),
    processedCommentContainers: new Set<HTMLElement>(),
    processedComments: new Set<HTMLElement>(),
    processedFieldElements: new Set<HTMLElement>(),
    processedTables: new Set<HTMLTableElement>(),
    result: {
      context: 'test',
      title: 'Tree title',
      structure: [],
      meta: {
        profile: {
          vendor: 'generic',
          appFamily: 'generic-web',
          pageKind: 'content',
          pipelineId: 'generic-structured',
          confidence: 0.8,
          matchedSignals: [],
          preferredRoots: ['body'],
        },
        title: 'Canonical title',
        url: 'https://example.test/search?q=browser',
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
    ...overrides,
  };
}

function createExtraction(id: string, title: string, value: string): GenericContentExtraction {
  return {
    sections: [
      {
        type: 'section',
        id: `section-${id}`,
        title,
        kind: 'narrative',
        children: [
          {
            type: 'field',
            id: `field-${id}`,
            label: 'Text',
            value,
            valueType: 'string',
            contentRole: 'paragraph',
          },
        ],
      },
    ],
    blocks: [
      {
        id: `block-${id}`,
        sectionId: `section-${id}`,
        kind: 'paragraph',
        text: value,
      },
    ],
  };
}

it('prefers canonical context metadata for generic fallback titles and search signals', () => {
  const ctx = createContext();

  expect(resolveGenericFallbackTitle(ctx, 'Документация')).toBe('Canonical title');
  expect(hasExplicitSearchSignal(ctx)).toBe(true);
});

it('falls back to tree metadata and rejects invalid search URLs without explicit signals', () => {
  const ctx = createContext();
  ctx.result.title = 'Tree fallback title';
  delete ctx.result.meta;

  expect(resolveGenericFallbackTitle(ctx, 'Документация')).toBe('Tree fallback title');
  expect(hasExplicitSearchSignal(ctx)).toBe(false);
});

it('returns false for malformed search URLs and empty search extractions', () => {
  const ctx = createContext();
  ctx.result.meta = {
    ...ctx.result.meta!,
    title: 'Tree title',
    url: 'http://%',
  };

  expect(hasExplicitSearchSignal(ctx)).toBe(false);
});

it('keeps distinct same-title sections when their content differs', () => {
  const merged = mergeGenericExtractions(
    createExtraction('docs', 'Overview', 'Docs-focused summary'),
    createExtraction('article', 'Overview', 'Article-focused summary')
  );

  expect(merged.sections).toHaveLength(2);
  expect(merged.blocks).toHaveLength(2);
});

it('keeps table-backed sections distinct and propagates secondary replaceStructure', () => {
  const primary = createExtraction('docs', 'Overview', 'Docs-focused summary');
  const secondary: GenericContentExtraction = {
    sections: [
      {
        type: 'section',
        id: 'section-table',
        title: 'Overview',
        children: [
          {
            type: 'table',
            id: 'table-1',
            headers: ['Key', 'Value'],
            rows: [
              {
                id: 'row-1',
                selected: true,
                data: { Key: 'Status', Value: 'Open' },
                selector: 'table tr:first-child',
              },
            ],
          },
        ],
      },
    ],
    blocks: [
      {
        id: 'block-table',
        sectionId: 'section-table',
        kind: 'data-table',
        tableRef: 'table-1',
      },
    ],
    replaceStructure: true,
  };

  const merged = mergeGenericExtractions(primary, secondary);

  expect(merged.sections).toHaveLength(2);
  expect(merged.blocks).toHaveLength(2);
  expect(merged.replaceStructure).toBe(true);
});

it('keeps generic sections distinct when only trailing field text differs past the old merge limit', () => {
  const merged = mergeGenericExtractions(
    createExtraction('docs', 'Overview', `${'A'.repeat(80)}docs`),
    createExtraction('article', 'Overview', `${'A'.repeat(80)}article`)
  );

  expect(merged.sections).toHaveLength(2);
  expect(merged.blocks).toHaveLength(2);
});

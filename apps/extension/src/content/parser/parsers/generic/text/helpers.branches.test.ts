// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import type { GenericContentExtraction } from '../types';
import { mergeGenericExtractions, shouldPreferSearchExtraction } from './helpers';

function createContext(url = 'https://example.test/article'): TraversalContext {
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
      title: 'Canonical title',
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
        url,
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
  };
}

function createNarrativeExtraction(
  id: string,
  title: string,
  value: string
): GenericContentExtraction {
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

function createDocsExtraction(): GenericContentExtraction {
  return {
    sections: [
      {
        type: 'section',
        id: 'section-docs',
        title: 'Reference',
        kind: 'narrative',
        children: [
          {
            type: 'table',
            id: 'table-docs',
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
          {
            type: 'field',
            id: 'field-docs',
            label: 'Summary',
            value: 'Documentation narrative field',
            valueType: 'string',
            contentRole: 'paragraph',
          },
        ],
      },
    ],
    blocks: [
      {
        id: 'block-docs',
        sectionId: 'section-docs',
        kind: 'paragraph',
        text: 'Documentation narrative field',
      },
    ],
  };
}

function registerMergeExtractionTests() {
  it('rejects empty search extractions before scoring', () => {
    expect(
      shouldPreferSearchExtraction(
        { sections: [], blocks: [] },
        createDocsExtraction(),
        createNarrativeExtraction('article', 'Overview', 'Article'),
        createContext(),
        document.createElement('main')
      )
    ).toBe(false);
  });

  it('returns secondary extraction when primary has no sections', () => {
    const secondary = createNarrativeExtraction('secondary', 'Reference', 'Secondary text');

    expect(mergeGenericExtractions({ sections: [], blocks: [] }, secondary)).toEqual(secondary);
  });

  it('drops duplicate secondary sections and blocks with the same merge key', () => {
    const primary = createNarrativeExtraction('docs', 'Overview', 'Canonical summary');
    const secondary = createNarrativeExtraction('article', 'Overview', 'Canonical summary');

    const merged = mergeGenericExtractions(primary, secondary);

    expect(merged.sections).toHaveLength(1);
    expect(merged.blocks).toHaveLength(1);
  });
}

function registerSearchPreferenceTests() {
  it('prefers search extraction when canonical metadata explicitly signals search intent', () => {
    const root = document.createElement('main');

    expect(
      shouldPreferSearchExtraction(
        createNarrativeExtraction('search', 'Результаты поиска', 'Result'),
        createDocsExtraction(),
        createNarrativeExtraction('article', 'Overview', 'Article'),
        createContext('https://example.test/search?q=browser'),
        root
      )
    ).toBe(true);
  });

  it('prefers search extraction when it is the only non-empty extraction', () => {
    const root = document.createElement('main');

    expect(
      shouldPreferSearchExtraction(
        createNarrativeExtraction('search', 'Результаты поиска', 'Result'),
        { sections: [], blocks: [] },
        { sections: [], blocks: [] },
        createContext(),
        root
      )
    ).toBe(true);
  });

  it('keeps docs/article extraction when search score does not clear the threshold', () => {
    const root = document.createElement('main');
    root.append(document.createElement('p'));

    expect(
      shouldPreferSearchExtraction(
        createNarrativeExtraction('search', 'Результаты поиска', 'Result'),
        createDocsExtraction(),
        createNarrativeExtraction('article', 'Overview', 'Article'),
        createContext(),
        root
      )
    ).toBe(false);
  });
}

describe('generic helpers branches', () => {
  registerMergeExtractionTests();
  registerSearchPreferenceTests();
});

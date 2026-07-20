// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import { createNarrativeField } from './narrative-fields.helpers';

function createContext(): TraversalContext {
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
      title: 'Narrative',
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
        title: 'Narrative',
        url: 'https://example.test/article',
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('createNarrativeField', () => {
  it('returns null for empty or too-short narrative text', () => {
    const ctx = createContext();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'short';

    expect(
      createNarrativeField(paragraph, ctx, {
        contentRole: 'paragraph',
        label: 'Текст',
        minLength: 20,
      })
    ).toBeNull();
  });

  it('creates editable narrative fields and truncates long text consistently', () => {
    const ctx = createContext();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Narrative '.repeat(20);
    document.body.append(paragraph);

    const field = createNarrativeField(paragraph, ctx, {
      contentRole: 'paragraph',
      label: 'Текст',
      minLength: 10,
      maxLength: 30,
    });

    expect(field).toMatchObject({
      label: 'Текст',
      valueType: 'string',
      contentRole: 'paragraph',
      editable: true,
    });
    expect(field?.value).toHaveLength(30);
    expect(field?.value.endsWith('...')).toBe(true);
    expect(field?.evidence?.[0]?.excerpt).toBe(field?.value);
    expect(paragraph.getAttribute('data-sniptale-id')).toBe(field?.id);
    expect(ctx.globalFieldIndex).toBe(2);
  });
});

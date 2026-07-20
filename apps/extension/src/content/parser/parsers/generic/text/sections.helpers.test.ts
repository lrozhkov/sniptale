import { describe, expect, it } from 'vitest';
import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TraversalContext } from '../../types';
import { appendFieldsToTitledSection, ensureTitledSection } from './sections.helpers';

function createContext(): TraversalContext {
  return {
    currentSection: null,
    globalFieldIndex: 0,
    globalTableIndex: 0,
    processedAttrLists: new Set(),
    processedCommentContainers: new Set(),
    processedComments: new Set(),
    processedFieldElements: new Set(),
    processedTables: new Set(),
    result: { context: '', structure: [], title: '' },
    sectionElements: [],
    sectionIndex: 0,
  };
}

function createSection(title: string): SectionNode {
  return {
    children: [],
    id: `${title}-section`,
    selected: true,
    title,
    type: 'section',
  };
}

function runCurrentSectionReuseTest() {
  it('reuses the current section when the title already matches', () => {
    const ctx = createContext();
    const section = createSection('Детали');
    ctx.currentSection = section;
    ctx.result.structure.push(section);

    expect(ensureTitledSection({ ctx, title: 'Детали' })).toBe(section);
  });
}

function runResultTreeReuseTest() {
  it('reuses a matching section from the result tree when requested', () => {
    const ctx = createContext();
    const existing = createSection('Дополнительные параметры');
    ctx.result.structure.push(existing);

    expect(
      ensureTitledSection({ ctx, reuseExisting: true, title: 'Дополнительные параметры' })
    ).toBe(existing);
    expect(ctx.currentSection).toBe(existing);
  });
}

function runSectionCreationTest() {
  it('creates a fresh titled section when no reusable section exists', () => {
    const ctx = createContext();

    const section = ensureTitledSection({ ctx, title: 'Новая секция' });

    expect(section).toMatchObject({
      children: [],
      selected: true,
      title: 'Новая секция',
      type: 'section',
    });
    expect(ctx.result.structure).toEqual([section]);
  });
}

function runAppendFieldsTest() {
  it('appends fields through the titled-section helper seam', () => {
    const ctx = createContext();

    const section = appendFieldsToTitledSection({
      ctx,
      fields: [
        {
          id: 'field-1',
          label: 'Стоимость',
          selected: true,
          type: 'field',
          value: '800',
          valueType: 'string',
        },
      ],
      title: 'Дополнительные параметры',
    });

    expect(section.children).toEqual([
      expect.objectContaining({
        label: 'Стоимость',
        value: '800',
      }),
    ]);
  });
}

describe('generic parser section helpers', () => {
  runCurrentSectionReuseTest();
  runResultTreeReuseTest();
  runSectionCreationTest();
  runAppendFieldsTest();
});

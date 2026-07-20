// @vitest-environment jsdom

import { expect, it } from 'vitest';

import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { buildSectionFields } from './narrative';

function createNarrativeTree(): ParsedDOMTree {
  return {
    context: 'Docs',
    title: 'Narrative page',
    structure: [
      {
        type: 'section',
        id: 'section-narrative',
        title: 'Overview',
        kind: 'narrative',
        children: [],
      },
    ],
    blocks: [
      {
        id: 'block-paragraph',
        sectionId: 'section-narrative',
        kind: 'paragraph',
        text: 'Narrative paragraph',
      },
      {
        id: 'block-list',
        sectionId: 'section-narrative',
        kind: 'list',
        items: ['First bullet'],
      },
      {
        id: 'block-code',
        sectionId: 'section-narrative',
        kind: 'code',
        text: 'const value = 1;',
      },
    ],
  };
}

function createStructuredTree(): ParsedDOMTree {
  return {
    context: 'Portal',
    title: 'Structured page',
    structure: [
      {
        type: 'section',
        id: 'section-structured',
        title: 'Structured fields',
        children: [
          {
            type: 'field',
            id: 'field-link',
            label: 'Attachment',
            value: 'Open linked attachment',
            valueType: 'string',
            contentRole: 'paragraph',
            linkRef: 'attachment-1',
          },
        ],
      },
    ],
  };
}

it('builds narrative export fields from canonical blocks', () => {
  const tree = createNarrativeTree();

  expect(buildSectionFields(tree, tree.structure[0]!)).toEqual([
    {
      label: 'Абзац',
      value: 'Narrative paragraph',
      type: 'string',
      contentRole: 'paragraph',
      linkRef: undefined,
    },
    {
      label: 'Элемент списка',
      value: 'First bullet',
      type: 'string',
      contentRole: 'list-item',
      linkRef: undefined,
    },
    {
      label: 'Код',
      value: 'const value = 1;',
      type: 'string',
      contentRole: 'paragraph',
      linkRef: undefined,
    },
  ]);
});

it('preserves optional contentRole and linkRef for structured fields', () => {
  const tree = createStructuredTree();

  expect(buildSectionFields(tree, tree.structure[0]!)).toEqual([
    {
      label: 'Attachment',
      value: 'Open linked attachment',
      type: 'string',
      contentRole: 'paragraph',
      linkRef: 'attachment-1',
    },
  ]);
});

import { describe, expect, it } from 'vitest';
import type { ParsedDOMTree, TargetRef } from '@sniptale/runtime-contracts/dom-tree';
import {
  convertTreeToMarkdown,
  estimateTokens,
  formatDataForAI,
  formatDataForAIJSON,
} from './format';

function createProfileFields(): ParsedDOMTree['structure'][number]['children'] {
  return [
    {
      type: 'field',
      id: 'field-name',
      label: 'Name',
      value: 'Alice',
      valueType: 'string',
    },
    {
      type: 'field',
      id: 'field-link',
      label: 'Portal',
      value: 'Example|Site\nDocs',
      valueType: 'link',
      linkRef: 'https://example.com',
    },
    {
      type: 'field',
      id: 'field-avatar',
      label: 'Avatar',
      value: 'avatar.png',
      valueType: 'image',
    },
    {
      type: 'field',
      id: 'field-paragraph',
      label: 'Текст',
      value: 'The Web was invented by Tim Berners-Lee at CERN.',
      valueType: 'string',
      contentRole: 'paragraph',
    },
    {
      type: 'field',
      id: 'field-list-item',
      label: 'Список 1',
      value: 'HTTP',
      valueType: 'string',
      contentRole: 'list-item',
    },
  ];
}

function createAssetsTable(): ParsedDOMTree['structure'][number]['children'][number] {
  return {
    type: 'table',
    id: 'table-assets',
    headers: ['Status', 'Name', 'Screenshot'],
    excludedColumns: ['Status'],
    rows: [
      {
        id: 'row-1',
        selected: true,
        data: {
          Status: 'done',
          Name: 'Workstation',
          Screenshot: 'screen-1.png',
        },
        cellTypes: {
          Status: 'status',
          Name: 'string',
          Screenshot: 'image',
        },
        selector: '#row-1',
      },
      {
        id: 'row-2',
        selected: false,
        data: {
          Status: 'pending',
          Name: 'Laptop',
          Screenshot: 'screen-2.png',
        },
        cellTypes: {
          Status: 'status',
          Name: 'string',
          Screenshot: 'image',
        },
        selector: '#row-2',
      },
    ],
  };
}

function createParsedTreeFixture(): ParsedDOMTree {
  return {
    context: 'Demo context',
    title: 'Demo page',
    structure: [
      {
        type: 'section',
        id: 'section-profile',
        title: 'Profile',
        children: [...createProfileFields(), createAssetsTable()],
      },
    ],
  };
}

function createNarrativeTargetRef(
  editable: boolean,
  sniptaleId: string,
  selector: string
): TargetRef {
  return {
    anchorStrategy: editable ? 'sniptale' : 'selector-chain',
    editable,
    realmId: 'document',
    selectors: [selector],
    ...(editable ? { sniptaleId } : {}),
  };
}

function createBlockNarrativeFields(): ParsedDOMTree['structure'][number]['children'] {
  return [
    {
      type: 'field',
      id: 'block-paragraph-field-1',
      label: 'Текст 1',
      value: 'Editable paragraph',
      valueType: 'string',
      contentRole: 'paragraph',
      selected: true,
      editable: true,
      targetRef: createNarrativeTargetRef(true, 'block-paragraph', 'p'),
    },
    {
      type: 'field',
      id: 'block-list-field-1',
      label: 'Список 1',
      value: 'Read only item',
      valueType: 'string',
      contentRole: 'list-item',
      selected: true,
      editable: false,
    },
  ];
}

function createBlockNarrativeBlocks(): NonNullable<ParsedDOMTree['blocks']> {
  return [
    {
      id: 'block-paragraph',
      sectionId: 'section-article',
      kind: 'paragraph',
      text: 'Editable paragraph',
      targetRef: createNarrativeTargetRef(true, 'block-paragraph', 'p'),
    },
    {
      id: 'block-list',
      sectionId: 'section-article',
      kind: 'list',
      items: ['Read only item'],
      targetRef: createNarrativeTargetRef(false, 'block-list', 'ul'),
    },
  ];
}

function createBlockNarrativeFixture(): ParsedDOMTree {
  return {
    context: 'Docs',
    title: 'Narrative demo',
    structure: [
      {
        type: 'section',
        id: 'section-article',
        title: 'Article',
        kind: 'narrative',
        children: createBlockNarrativeFields(),
      },
    ],
    blocks: createBlockNarrativeBlocks(),
  };
}

function expectEditableJsonPayload(formatted: {
  i: string;
  f: Array<{ id: string; n: string; c: string; new: string }>;
  t: Array<{ ttl: string; r: Array<{ id: string; d: Record<string, string> }> }>;
}): void {
  expect(formatted.i).toContain('Редактирование: Demo page');
  expect(formatted.f).toEqual([
    { id: 'field-name', n: 'Name', c: 'Alice', new: '' },
    { id: 'field-link', n: 'Portal', c: 'Example|Site\nDocs', new: '' },
    {
      id: 'field-paragraph',
      n: 'Текст',
      c: 'The Web was invented by Tim Berners-Lee at CERN.',
      new: '',
    },
    { id: 'field-list-item', n: 'Список 1', c: 'HTTP', new: '' },
  ]);
  expect(formatted.t).toEqual([
    {
      ttl: 'Profile',
      r: [{ id: 'row-1', d: { Name: 'Workstation' }, new: { Name: '' } }],
    },
  ]);
}

function registerEditablePayloadFormattingTests() {
  it('formats selected editable fields and rows for AI json', () => {
    const formatted = JSON.parse(formatDataForAIJSON(createParsedTreeFixture())) as {
      i: string;
      f: Array<{ id: string; n: string; c: string; new: string }>;
      t: Array<{ ttl: string; r: Array<{ id: string; d: Record<string, string> }> }>;
    };

    expectEditableJsonPayload(formatted);
  });

  it('omits table rows from AI payloads when no rows are selected', () => {
    const tree = createParsedTreeFixture();
    const section = tree.structure[0];
    if (!section) {
      throw new Error('Expected section fixture');
    }
    const table = section.children.find((child) => child.type === 'table');

    if (!table || table.type !== 'table') {
      throw new Error('Expected table fixture');
    }

    table.rows = table.rows.map((row) => ({ ...row, selected: false }));

    const formatted = JSON.parse(formatDataForAIJSON(tree)) as {
      t: Array<{ ttl: string; r: Array<{ id: string }> }>;
    };
    const markdown = formatDataForAI(tree);

    expect(formatted.t).toEqual([]);
    expect(markdown).not.toContain('| row_id |');
  });
}

function registerMarkdownFormattingTests() {
  it('formats editable markdown tables for AI prompts', () => {
    const markdown = formatDataForAI(createParsedTreeFixture());

    expect(markdown).toContain('| field_id | field_name | current_value | new_value |');
    expect(markdown).toContain('| field-name | Name | Alice | |');
    expect(markdown).toContain('| field-link | Portal | Example\\|Site<br />Docs | |');
    expect(markdown).toContain('| row_id | 1. Status | 2. Name | 3. Screenshot |');
    expect(markdown).toContain('(не редактируется)');
    expect(markdown).toContain('new_3. Screenshot');
  });

  it('keeps block-derived narrative paragraphs editable but skips read-only list items', () => {
    const formatted = JSON.parse(formatDataForAIJSON(createBlockNarrativeFixture())) as {
      f: Array<{ id: string; n: string; c: string; new: string }>;
    };

    expect(formatted.f).toEqual([
      {
        id: 'block-paragraph-field-1',
        n: 'Текст 1',
        c: 'Editable paragraph',
        new: '',
      },
    ]);
  });
}

function registerMarkdownConversionTests() {
  it('converts parsed trees to markdown and estimates tokens', () => {
    const markdown = convertTreeToMarkdown(createParsedTreeFixture());

    expect(markdown).toContain('# Demo page');
    expect(markdown).toContain('*Demo context*');
    expect(markdown).toContain('[Example\\|Site<br>Docs](https://example.com)');
    expect(markdown).toContain('The Web was invented by Tim Berners-Lee at CERN.');
    expect(markdown).toContain('- HTTP');
    expect(markdown).toContain('| Status | Name | Screenshot |');
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdef')).toBe(2);
  });
}

describe('dom-tree-parser ai format facade', () => {
  registerEditablePayloadFormattingTests();
  registerMarkdownFormattingTests();
  registerMarkdownConversionTests();
});

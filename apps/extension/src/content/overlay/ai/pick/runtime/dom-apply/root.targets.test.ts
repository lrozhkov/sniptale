// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { applyAIChanges, findAIChangeTargets, markSelectedInTree } from '.';

afterEach(() => {
  document.body.replaceChildren();
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

function appendDynamicFieldFixture() {
  const field = document.createElement('div');
  field.id = 'row-dynamic-field';

  const body = document.createElement('div');
  body.className = 'FormField-EA__fieldBody';
  const link = document.createElement('a');
  link.href = '#cost';
  link.textContent = '123';
  body.append(link);

  field.append(body);
  document.body.append(field);

  return { link };
}

function appendCommentFixture() {
  const comment = document.createElement('div');
  comment.id = 'comment$104306031';
  comment.setAttribute('data-comment-row', 'true');
  document.body.append(comment);
  return { comment };
}

describe('ai-pick tree selection mapping', () => {
  it('marks selected sections, fields, tables, and rows in the parsed tree', () => {
    const tree = buildTree();

    const markedTree = markSelectedInTree(
      tree,
      new Set(['section-1', 'field-row-dynamic-field', 'comment-comment$104306031'])
    );
    const sections = markedTree.sections ?? [];

    expect(sections[0]).toMatchObject({
      id: 'section-1',
      selected: true,
      children: [
        { id: 'field-row-dynamic-field', selected: true },
        {
          id: 'table-comments',
          selected: true,
          rows: [{ id: 'comment-comment$104306031', selected: true }],
        },
      ],
    });
    expect(markedTree.structure).toBe(markedTree.sections);
  });

  it('marks parent sections and tables when only descendant rows are selected', () => {
    const tree = buildTree();
    const markedTree = markSelectedInTree(tree, new Set(['comment-comment$104306031']));
    const section = markedTree.sections?.[0];
    const table = section?.children[1];

    expect(section?.selected).toBe(true);
    expect(section?.children[0]).toMatchObject({
      id: 'field-row-dynamic-field',
      selected: false,
    });
    expect(table).toMatchObject({
      id: 'table-comments',
      selected: true,
      rows: [{ id: 'comment-comment$104306031', selected: true }],
    });
  });
});

describe('ai-pick target discovery', () => {
  it('finds unique field and table-row targets while skipping missing changes', () => {
    const { link } = appendDynamicFieldFixture();
    const { comment } = appendCommentFixture();

    const targets = findAIChangeTargets(buildTree(), [
      {
        type: 'field',
        fieldId: 'field-row-dynamic-field',
        fieldName: 'Стоимость',
        newValue: '123321',
      },
      {
        type: 'field',
        fieldId: 'field-row-dynamic-field',
        fieldName: 'Стоимость',
        newValue: '123000',
      },
      {
        type: 'tableRow',
        rowId: 'comment-comment$104306031',
        columnEdits: { Текст: 'Новый комментарий' },
      },
      {
        type: 'field',
        fieldId: 'field-missing',
        fieldName: 'Отсутствует',
        newValue: '0',
      },
    ]);

    expect(targets).toHaveLength(2);
    expect(targets[0]).toBe(link);
    expect(targets[1]).toBe(comment);
  });
});

describe('applyAIChanges missing targets', () => {
  it('counts missing field and table-row targets without reporting fake applies', () => {
    const result = applyAIChanges(buildTree(), [
      {
        type: 'field',
        fieldId: 'field-missing',
        fieldName: 'Стоимость',
        newValue: '123321',
      },
      {
        type: 'tableRow',
        rowId: 'comment-missing',
        columnEdits: {
          Текст: 'Новый комментарий',
        },
      },
    ]);

    expect(result).toEqual({ appliedCount: 0, notFoundCount: 2 });
  });
});

// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { findAIChangeTargets } from '.';

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
  document.body.append(comment);
  return { comment };
}

function shouldFindUniqueTargetsAcrossFieldsAndTableRows(): void {
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
}

function shouldPreferSelectorTargetsBeforeNodeIdFallback(): void {
  const tree = buildTree();
  tree.structure[0]!.children[0] = {
    ...(tree.structure[0]!.children[0] as (typeof tree.structure)[0]['children'][0]),
    targetRef: {
      anchorStrategy: 'sniptale',
      editable: false,
      realmId: 'realm-1',
      selectors: ['.field-target'],
    },
  };

  const fallback = document.createElement('div');
  fallback.className = 'field-target';
  document.body.appendChild(fallback);

  const targets = findAIChangeTargets(tree, [
    {
      type: 'field',
      fieldId: 'field-row-dynamic-field',
      fieldName: 'Стоимость',
      newValue: '456',
    },
  ]);

  expect(targets).toEqual([fallback]);
}

describe('ai-pick dom-apply target resolution', () => {
  it(
    'finds unique field and table-row targets while skipping missing changes',
    shouldFindUniqueTargetsAcrossFieldsAndTableRows
  );

  it(
    'uses target selectors from dom targets before falling back to node ids',
    shouldPreferSelectorTargetsBeforeNodeIdFallback
  );
});

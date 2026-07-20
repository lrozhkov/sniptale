// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { applyAIChanges } from '.';

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
        selected: true,
        children: [
          {
            type: 'field',
            id: 'field-row-dynamic-field',
            label: 'Стоимость',
            selector: '#row-dynamic-field .FormField-EA__fieldBody a',
            selected: true,
            value: '123',
            valueType: 'link',
          },
          {
            type: 'table',
            id: 'table-comments',
            headers: ['Автор', 'Дата', 'Текст'],
            rows: [
              {
                id: 'comment-comment$104306031',
                selected: true,
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
  field.className = 'FormField-EA__field FormField-EA__fieldRead';
  const info = document.createElement('div');
  info.className = 'FormField-EA__fieldInfo';
  info.textContent = 'Стоимость';
  const body = document.createElement('div');
  body.className = 'FormField-EA__fieldBody';
  const link = document.createElement('a');
  link.href = '#cost';
  link.textContent = '123';
  body.append(link);
  field.append(info, body);
  document.body.append(field);
  return { field, link };
}

function appendCommentFixture() {
  const comment = document.createElement('div');
  comment.id = 'comment$104306031';
  comment.setAttribute('data-comment-row', 'true');
  const text = document.createElement('div');
  text.className = 'Comment__text';
  text.textContent = 'Старый текст';
  comment.append(text);
  document.body.append(comment);
  return { fieldText: text, fieldWrapper: comment };
}

describe('ai-pick dom-apply apply flow', () => {
  it('updates field and table-row targets while preserving structure', () => {
    const { field, link } = appendDynamicFieldFixture();
    const { fieldText } = appendCommentFixture();

    const result = applyAIChanges(buildTree(), [
      {
        type: 'field',
        fieldId: 'field-row-dynamic-field',
        fieldName: 'Стоимость',
        newValue: '123321',
      },
      {
        type: 'tableRow',
        rowId: 'comment-comment$104306031',
        columnEdits: {
          Текст: 'Новый комментарий',
        },
      },
    ]);

    expect(result).toEqual({ appliedCount: 2, notFoundCount: 0 });
    expect(field.querySelector('.FormField-EA__fieldInfo')?.textContent).toBe('Стоимость');
    expect(link.textContent).toBe('123321');
    expect(fieldText.textContent).toBe('Новый комментарий');
  });
});

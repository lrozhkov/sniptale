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

  const author = document.createElement('div');
  author.className = 'Comment__author';
  author.textContent = 'Тестов Тест Тестович';

  const date = document.createElement('div');
  date.className = 'Comment__date';
  date.textContent = '01.01.2000 10:00';

  const text = document.createElement('div');
  text.className = 'Comment__text';
  text.textContent = 'Старый текст';

  comment.append(author, date, text);
  document.body.append(comment);

  return { comment, text };
}

function appendSummaryFieldFixture() {
  const field = document.createElement('span');
  field.dataset['sniptaleId'] = 'field-created-at';
  field.className = 'TextBoxWithIcon__attribute';
  const separator = document.createElement('span');
  separator.className = 'TextBoxWithIcon__separator';
  separator.textContent = '14.10.2025 18:09';
  field.append('Дата создания: ', separator);
  document.body.append(field);
  return field;
}

function buildSummaryFieldTree(): ParsedDOMTree {
  return {
    context: 'test',
    title: 'Test page',
    structure: [
      {
        type: 'section',
        id: 'section-summary',
        title: 'Общая информация',
        selected: true,
        children: [
          {
            type: 'field',
            id: 'field-created-at',
            label: 'Дата создания',
            selector: '.TextBoxWithIcon__attribute',
            selected: true,
            value: '14.10.2025 18:09',
            valueType: 'string',
          },
        ],
      },
    ],
  };
}

function appendStyledDynamicFieldFixture() {
  const field = document.createElement('div');
  field.id = 'row-dynamic-field-styled';
  field.className = 'FormField-EA__field FormField-EA__fieldRead';

  const info = document.createElement('div');
  info.className = 'FormField-EA__fieldInfo';
  info.textContent = 'Стоимость';

  const body = document.createElement('div');
  body.className = 'FormField-EA__fieldBody';
  const controlBox = document.createElement('div');
  controlBox.className = 'FormField-EA__controlBox';
  const control = document.createElement('div');
  control.className = 'FormField-EA__control';
  const layoutWrap = document.createElement('div');
  layoutWrap.className = 'DynamicValue__layout';
  const valueWrap = document.createElement('div');
  valueWrap.className = 'DynamicValue__content';
  const valueText = document.createElement('span');
  valueText.className = 'DynamicValue__text';
  valueText.textContent = '123';

  valueWrap.append(valueText);
  layoutWrap.append(valueWrap);
  control.append(layoutWrap);
  controlBox.append(control);
  body.append(controlBox);
  field.append(info, body);
  document.body.append(field);

  return field;
}

function buildStyledDynamicFieldTree(): ParsedDOMTree {
  return {
    context: 'test',
    title: 'Test page',
    structure: [
      {
        type: 'section',
        id: 'section-1',
        title: 'Дополнительные параметры',
        selected: true,
        children: [
          {
            type: 'field',
            id: 'field-row-dynamic-field-styled',
            label: 'Стоимость',
            selector: '#row-dynamic-field-styled .FormField-EA__controlBox',
            selected: true,
            value: '123',
            valueType: 'string',
          },
        ],
      },
    ],
  };
}

describe('applyAIChanges selector fallbacks', () => {
  it('falls back to selectors for stale field and comment row snapshots', () => {
    const { field, link } = appendDynamicFieldFixture();
    const { text } = appendCommentFixture();

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
    expect(text.textContent).toBe('Новый комментарий');
  });
});

describe('applyAIChanges composite labels', () => {
  it('preserves composite labels when updating inline summary fields', () => {
    const field = appendSummaryFieldFixture();

    const result = applyAIChanges(buildSummaryFieldTree(), [
      {
        type: 'field',
        fieldId: 'field-created-at',
        fieldName: 'Дата создания',
        newValue: '15.10.2025 10:00',
      },
    ]);

    expect(result).toEqual({ appliedCount: 1, notFoundCount: 0 });
    expect(field.textContent).toBe('Дата создания: 15.10.2025 10:00');
    expect(field.querySelector('.TextBoxWithIcon__separator')?.textContent).toBe(
      '15.10.2025 10:00'
    );
  });
});

describe('applyAIChanges structured values', () => {
  it('updates the deepest text leaf without removing styled wrappers', () => {
    const field = appendStyledDynamicFieldFixture();

    const result = applyAIChanges(buildStyledDynamicFieldTree(), [
      {
        type: 'field',
        fieldId: 'field-row-dynamic-field-styled',
        fieldName: 'Стоимость',
        newValue: '123321',
      },
    ]);

    expect(result).toEqual({ appliedCount: 1, notFoundCount: 0 });
    expect(field.querySelector('.FormField-EA__fieldInfo')?.textContent).toBe('Стоимость');
    expect(field.querySelector('.DynamicValue__text')?.textContent).toBe('123321');
    expect(field.querySelector('.FormField-EA__controlBox')).not.toBeNull();
    expect(field.querySelector('.DynamicValue__content')).not.toBeNull();
  });
});

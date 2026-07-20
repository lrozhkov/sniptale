import { describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { finalizeParsedDocument } from '../../ir/finalize-parsed-document';
import { formatDataForAIJSON } from './format';

type ParsedSection = ParsedDOMTree['structure'][number];
type ParsedChild = ParsedSection['children'][number];

function createDuplicateDynamicFieldsFixture(): ParsedDOMTree {
  return finalizeParsedDocument({
    context: 'Naumen SD',
    title: 'RP10001',
    structure: [
      createSection('section-form', 'Форма', [
        createRecipientField('field-form-recipient'),
        createAttachmentTable('table-form-files'),
      ]),
      createSection('section-classification', 'Классификация запроса', [
        createRecipientField('field-classification-recipient'),
      ]),
      createSection('section-attrs', 'Атрибуты', [
        createDescriptionField('field-attrs-description'),
        createRecipientField('field-attrs-recipient'),
        createRegisteredAtField('field-attrs-registered-at'),
      ]),
      createSection('section-description', 'Описание запроса', [
        createDescriptionField('field-description'),
      ]),
      createSection('section-source', 'Источник запроса', [
        createRegisteredAtField('field-source-registered-at'),
      ]),
      createSection('section-files', 'Файлы', [createAttachmentTable('table-files')]),
      createSection('section-comments-a', 'Комментарии', [createCommentsTable('table-comments-a')]),
      createSection('section-comments-b', 'Комментарии', [createCommentsTable('table-comments-b')]),
      createSection('section-checklist', 'Чек-лист', []),
    ],
  });
}

function createSection(id: string, title: string, children: ParsedChild[]): ParsedSection {
  return {
    type: 'section',
    id,
    title,
    children,
  };
}

function createRecipientField(id: string): ParsedChild {
  return {
    type: 'field',
    id,
    label: 'Получатель услуг',
    value: 'Менеджер процесса управления событиями',
    valueType: 'link',
    linkRef: 'employee$1001',
    selected: true,
  };
}

function createDescriptionField(id: string): ParsedChild {
  return {
    type: 'field',
    id,
    label: 'Описание',
    value: 'Запрос создан при обработке события 1001',
    valueType: 'string',
    selected: true,
  };
}

function createRegisteredAtField(id: string): ParsedChild {
  return {
    type: 'field',
    id,
    label: 'Дата/время регистрации',
    value: '22.11.2024 14:26',
    valueType: 'string',
    selected: true,
  };
}

function createAttachmentTable(id: string): ParsedChild {
  return {
    type: 'table',
    id,
    headers: ['Имя файла', 'Размер', 'Дата создания', 'Автор', 'Связанные запросы', 'Описание'],
    rows: [
      {
        id: `${id}-row`,
        selected: true,
        selector: '',
        data: {
          Автор: 'Тестов Тест Тестович',
          'Дата создания': '01.01.2000 10:00',
          'Имя файла': 'example-attachment.png',
          Описание: '—',
          Размер: '2 КБ',
          'Связанные запросы': 'RP10001',
        },
      },
    ],
  };
}

function createCommentsTable(id: string): ParsedChild {
  return {
    type: 'table',
    id,
    headers: ['Автор', 'Дата', 'Текст'],
    rows: [
      {
        id: `${id}-row`,
        selected: true,
        selector: '',
        data: {
          Автор: 'Тестов Тест Тестович',
          Дата: '01.01.2000 10:01',
          Текст: 'Тест [file_1001]',
        },
      },
    ],
  };
}

describe('AI editable payload deduplication', () => {
  it('keeps explicit GWT sections instead of broad dynamic-fields form copies', () => {
    const formatted = JSON.parse(formatDataForAIJSON(createDuplicateDynamicFieldsFixture())) as {
      f: Array<{ id: string; n: string; c: string; new: string }>;
      t: Array<{ ttl: string; r: Array<{ id: string }> }>;
    };

    expect(formatted.f).toEqual([
      {
        id: 'field-classification-recipient',
        n: 'Получатель услуг',
        c: 'Менеджер процесса управления событиями',
        new: '',
      },
      {
        id: 'field-description',
        n: 'Описание',
        c: 'Запрос создан при обработке события 1001',
        new: '',
      },
      {
        id: 'field-source-registered-at',
        n: 'Дата/время регистрации',
        c: '22.11.2024 14:26',
        new: '',
      },
    ]);
    expect(formatted.t.map(({ ttl, r }) => ({ ttl, rowIds: r.map((row) => row.id) }))).toEqual([
      { ttl: 'Файлы', rowIds: ['table-files-row'] },
      { ttl: 'Комментарии', rowIds: ['table-comments-a-row'] },
    ]);
  });
});

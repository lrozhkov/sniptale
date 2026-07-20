import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageProfile, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { normalizeLegacyTree } from './normalize-legacy-tree';

const PROFILE: PageProfile = {
  vendor: 'generic',
  appFamily: 'generic-web',
  pageKind: 'content',
  pipelineId: 'generic-structured',
  confidence: 0.9,
  matchedSignals: [],
  preferredRoots: ['body'],
};

type ParsedSection = ParsedDOMTree['structure'][number];
type ParsedChild = ParsedSection['children'][number];

function createLegacyTree(): ParsedDOMTree {
  return {
    context: 'legacy-host',
    title: 'Legacy Title',
    structure: [],
  };
}

function createDuplicateGwtTree(): ParsedDOMTree {
  return {
    context: 'naumen',
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
      createSection('section-checklist-prep', 'Подготовка чек-листа', []),
      createSection('section-resolution', 'Описание решения', []),
    ],
  };
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
  };
}

function createDescriptionField(id: string): ParsedChild {
  return {
    type: 'field',
    id,
    label: 'Описание',
    value: 'Запрос создан при обработке события 1001',
    valueType: 'string',
  };
}

function createRegisteredAtField(id: string): ParsedChild {
  return {
    type: 'field',
    id,
    label: 'Дата/время регистрации',
    value: '22.11.2024 14:26',
    valueType: 'string',
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

function expectGenericFormDuplicateFieldsDropped(): void {
  const documentData = normalizeLegacyTree(createDuplicateGwtTree(), PROFILE, {
    pageUrl: 'https://support.example.invalid/sd/operator/#uuid:serviceCall$1001',
  });

  expect(documentData.structure.map((section) => section.title)).toEqual([
    'Классификация запроса',
    'Описание запроса',
    'Источник запроса',
    'Файлы',
    'Комментарии',
  ]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeLegacyTree', () => {
  it('prefers explicit page metadata over global window state', () => {
    const documentData = normalizeLegacyTree(createLegacyTree(), PROFILE, {
      pageContext: 'snapshot.example',
      pageTitle: 'Snapshot Title',
      pageUrl: 'https://snapshot.example/path',
    });

    expect(documentData.context).toBe('snapshot.example');
    expect(documentData.title).toBe('Snapshot Title');
    expect(documentData.meta?.title).toBe('Snapshot Title');
    expect(documentData.meta?.url).toBe('https://snapshot.example/path');
  });

  it('does not infer missing parser metadata from the global location', () => {
    const globalHref = 'https://global.example/global-page';
    vi.stubGlobal('window', { location: { href: globalHref } });

    const documentData = normalizeLegacyTree(createLegacyTree(), PROFILE);

    expect(documentData.meta?.url).toBe('');
    expect(documentData.meta?.url).not.toBe(globalHref);
  });

  it('preserves legacy-tree url metadata when explicit trace url is absent', () => {
    const documentData = normalizeLegacyTree(
      {
        ...createLegacyTree(),
        meta: {
          profile: PROFILE,
          title: 'Legacy Title',
          url: 'https://legacy.example/path',
          warnings: [],
        },
      },
      PROFILE
    );

    expect(documentData.meta?.url).toBe('https://legacy.example/path');
  });

  it(
    'drops generic form fields when explicit GWT sections own the same property',
    expectGenericFormDuplicateFieldsDropped
  );
});

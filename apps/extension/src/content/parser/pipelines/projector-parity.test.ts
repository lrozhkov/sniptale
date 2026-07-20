// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
import { formatDataForAI, formatDataForAIJSON } from '../dom-tree-parser/ai/editable-format';
import { convertTreeToMarkdown } from '../dom-tree-parser/ai/markdown';
import { buildExportData } from '../export-manager/formats/data';

function createMainSection(): ParsedDocument['structure'][number] {
  return {
    type: 'section',
    id: 'section-main',
    title: 'Основная информация',
    children: [
      {
        type: 'field',
        id: 'field-description',
        label: 'Описание',
        value: 'Тест списков стоимости',
        valueType: 'string',
        selected: true,
      },
      {
        type: 'field',
        id: 'field-service',
        label: 'Головная услуга',
        value: 'Серверное оборудование MAP',
        valueType: 'link',
        linkRef: '/operator/#uuid:serviceCall$123',
        selected: true,
      },
      {
        type: 'table',
        id: 'table-assets',
        headers: ['Название', 'Системный статус'],
        selected: true,
        rows: [
          {
            id: 'row-asset-1',
            selected: true,
            data: {
              Название: 'Антивирусное ПО (6912)',
              'Системный статус': 'Активно',
            },
            cellTypes: {
              Название: 'string',
              'Системный статус': 'string',
            },
            selector: '#row-asset-1',
          },
        ],
      },
    ],
  };
}

function createCommentsSection(): ParsedDocument['structure'][number] {
  return {
    type: 'section',
    id: 'section-comments',
    title: 'Комментарии',
    children: [
      {
        type: 'table',
        id: 'table-comments',
        headers: ['Автор', 'Дата', 'Текст'],
        selected: true,
        rows: [
          {
            id: 'comment-1',
            selected: true,
            data: {
              Автор: 'Тестов Тест Тестович',
              Дата: '01.01.2000 10:00',
              Текст: 'Тест',
            },
            cellTypes: {
              Автор: 'string',
              Дата: 'string',
              Текст: 'string',
            },
            selector: '#comment-1',
          },
        ],
      },
    ],
  };
}

function createNarrativeSection(): ParsedDocument['structure'][number] {
  return {
    type: 'section',
    id: 'section-narrative',
    title: 'История',
    children: [
      {
        type: 'field',
        id: 'field-paragraph-1',
        label: 'Текст',
        value: 'The Web was invented by Tim Berners-Lee at CERN.',
        valueType: 'string',
        contentRole: 'paragraph',
        selected: true,
      },
      {
        type: 'field',
        id: 'field-list-1',
        label: 'Список 1',
        value: 'HTTP',
        valueType: 'string',
        contentRole: 'list-item',
        selected: true,
      },
    ],
  };
}

function createCanonicalDocumentFixture(): ParsedDocument {
  return {
    context: 'test',
    title: 'Карточка КЕ',
    structure: [createMainSection(), createCommentsSection(), createNarrativeSection()],
    meta: {
      title: 'Карточка КЕ',
      url: 'https://example.test/operator/card',
      warnings: [],
      profile: {
        vendor: 'naumen-sd-gwt',
        appFamily: 'naumen-sd',
        pageKind: 'object-card',
        pipelineId: 'naumen-sd-gwt',
        confidence: 0.99,
        matchedSignals: [],
        preferredRoots: ['body'],
      },
    },
  };
}

function expectAiProjection(aiJson: {
  f: Array<{ id: string; n: string; c: string }>;
  t: Array<{ ttl: string; r: Array<{ id: string; d: Record<string, string> }> }>;
}) {
  expect(aiJson.f).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'field-description',
        n: 'Описание',
        c: 'Тест списков стоимости',
      }),
      expect.objectContaining({
        id: 'field-service',
        n: 'Головная услуга',
        c: 'Серверное оборудование MAP',
      }),
    ])
  );
  expect(aiJson.t).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ttl: 'Основная информация',
        r: expect.arrayContaining([
          expect.objectContaining({
            id: 'row-asset-1',
            d: expect.objectContaining({
              Название: 'Антивирусное ПО (6912)',
              'Системный статус': 'Активно',
            }),
          }),
        ]),
      }),
      expect.objectContaining({
        ttl: 'Комментарии',
        r: expect.arrayContaining([
          expect.objectContaining({
            id: 'comment-1',
            d: expect.objectContaining({
              Автор: 'Тестов Тест Тестович',
              Дата: '01.01.2000 10:00',
              Текст: 'Тест',
            }),
          }),
        ]),
      }),
    ])
  );
}

function expectAiMarkdownProjection(aiMarkdown: string): void {
  expect(aiMarkdown).toContain('| field-description | Описание | Тест списков стоимости | |');
  expect(aiMarkdown).toContain(
    '| field-service | Головная услуга | Серверное оборудование MAP | |'
  );
}

function expectMarkdownProjection(markdown: string): void {
  expect(markdown).toContain('## Основная информация');
  expect(markdown).toContain('- **Описание:** Тест списков стоимости');
  expect(markdown).toContain(
    '- **Головная услуга:** [Серверное оборудование MAP](/operator/#uuid:serviceCall$123)'
  );
  expect(markdown).toContain('## История');
  expect(markdown).toContain('The Web was invented by Tim Berners-Lee at CERN.');
  expect(markdown).toContain('- HTTP');
  expect(markdown).toContain('| Автор | Дата | Текст |');
  expect(markdown).toContain('| Тестов Тест Тестович | 01.01.2000 10:00 | Тест |');
}

function expectExportProjection(exportData: ReturnType<typeof buildExportData>): void {
  expect(exportData.sections).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: 'Основная информация',
        fields: expect.arrayContaining([
          expect.objectContaining({
            label: 'Описание',
            value: 'Тест списков стоимости',
          }),
          expect.objectContaining({
            label: 'Головная услуга',
            value: 'Серверное оборудование MAP',
            linkRef: '/operator/#uuid:serviceCall$123',
          }),
        ]),
        tables: expect.arrayContaining([
          expect.objectContaining({
            headers: ['Название', 'Системный статус'],
          }),
        ]),
      }),
      expect.objectContaining({
        title: 'Комментарии',
        tables: expect.arrayContaining([
          expect.objectContaining({
            headers: ['Автор', 'Дата', 'Текст'],
          }),
        ]),
      }),
      expect.objectContaining({
        title: 'История',
        fields: expect.arrayContaining([
          expect.objectContaining({
            label: 'Текст',
            value: 'The Web was invented by Tim Berners-Lee at CERN.',
            contentRole: 'paragraph',
          }),
          expect.objectContaining({
            label: 'Список 1',
            value: 'HTTP',
            contentRole: 'list-item',
          }),
        ]),
      }),
    ])
  );
}

function expectTextProjections(
  aiMarkdown: string,
  markdown: string,
  exportData: ReturnType<typeof buildExportData>
): void {
  expectAiMarkdownProjection(aiMarkdown);
  expectMarkdownProjection(markdown);
  expectExportProjection(exportData);
}

describe('parser projector parity', () => {
  it('keeps shared extraction patterns consistent across AI, markdown, and export json', () => {
    const documentData = createCanonicalDocumentFixture();
    const aiJson = JSON.parse(formatDataForAIJSON(documentData)) as {
      f: Array<{ id: string; n: string; c: string }>;
      t: Array<{ ttl: string; r: Array<{ id: string; d: Record<string, string> }> }>;
    };
    const aiMarkdown = formatDataForAI(documentData);
    const markdown = convertTreeToMarkdown(documentData);
    const exportData = buildExportData(documentData);

    expectAiProjection(aiJson);
    expectTextProjections(aiMarkdown, markdown, exportData);
  });
});

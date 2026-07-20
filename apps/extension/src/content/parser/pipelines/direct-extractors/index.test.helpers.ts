import { expect } from 'vitest';
import type {
  FieldNode,
  ParsedDocument,
  SectionNode,
  TableNode,
  TableRow,
} from '@sniptale/runtime-contracts/dom-tree';
import type { createEmptyDocument } from './index.test.fixtures';

type TestDocument = ReturnType<typeof createEmptyDocument> | ParsedDocument;

function getSections(documentData: TestDocument): SectionNode[] {
  return documentData.structure;
}

function getFields(documentData: TestDocument): FieldNode[] {
  return getSections(documentData).flatMap((section) =>
    section.children.filter((child): child is FieldNode => child.type === 'field')
  );
}

function getTables(documentData: TestDocument): TableNode[] {
  return getSections(documentData).flatMap((section) =>
    section.children.filter((child): child is TableNode => child.type === 'table')
  );
}

function findFieldByLabel(documentData: TestDocument, label: string): FieldNode | undefined {
  return getFields(documentData).find((field) => field.label === label);
}

function findTableByHeaders(documentData: TestDocument, headers: string[]): TableNode | undefined {
  return getTables(documentData).find((table) => {
    return (
      table.headers.length === headers.length &&
      table.headers.every((header, index) => header === headers[index])
    );
  });
}

function findRow(
  table: TableNode | undefined,
  predicate: (row: TableRow) => boolean
): TableRow | undefined {
  return table?.rows.find(predicate);
}

function expectSectionTitles(documentData: TestDocument, expectedTitles: string[]): void {
  const titles = getSections(documentData).map((section) => section.title);
  expectedTitles.forEach((title) => {
    expect(titles).toContain(title);
  });
}

export function expectStandardGwtExtraction(documentData: TestDocument): void {
  expectSectionTitles(documentData, ['Основная информация', 'Комментарии']);

  const descriptionField = findFieldByLabel(documentData, 'Описание');
  expect(descriptionField?.value).toBe('Тест списков стоимости');

  const serviceField = findFieldByLabel(documentData, 'Головная услуга');
  expect(serviceField?.value).toBe('Серверное оборудование MAP');
  expect(serviceField?.valueType).toBe('link');

  const assetsTable = findTableByHeaders(documentData, ['Название', 'Системный статус']);
  const assetsRow = findRow(
    assetsTable,
    (row) => row.data['Название'] === 'Антивирусное ПО (6912)'
  );
  expect(assetsRow?.data['Системный статус']).toBe('Активно');

  const commentsTable = findTableByHeaders(documentData, ['Автор', 'Дата', 'Текст']);
  const commentRow = findRow(commentsTable, (row) => row.data['Автор'] === 'Тестов Тест Тестович');
  expect(commentRow?.data['Дата']).toBe('01.01.2000 10:00');
  expect(commentRow?.data['Текст']).toBe('Тест');
}

export function expectGenericNarrativeExtraction(documentData: TestDocument): void {
  expectSectionTitles(documentData, [
    'Типовые схемы развертывания',
    'Типовые наборы компонентов систем на базе SD Pro',
  ]);

  const values = getFields(documentData).map((field) => field.value);
  expect(values).toContain(
    'Системы, построенные на основе SD Pro, могут быть развернуты в различных конфигурациях.'
  );
  expect(values).toContain(
    'Продуктивный стенд в инфраструктуре клиента определяется предполагаемым количеством ' +
      'одновременно работающих пользователей.'
  );
}

export function expectGenericDocsExtraction(documentData: TestDocument): void {
  expectSectionTitles(documentData, [
    'Типовые схемы развертывания',
    'Типы компонентов систем SD Pro',
  ]);

  const values = getFields(documentData).map((field) => field.value);
  expect(values).toContain(
    'Системы, построенные на основе SD Pro, могут быть развернуты в различных конфигурациях.'
  );

  const codeField = getFields(documentData).find((field) => {
    return field.label.startsWith('Код');
  });
  expect(codeField?.value).toBe('sd_pro_small');
}

export function expectGenericSearchExtraction(documentData: TestDocument): void {
  expectSectionTitles(documentData, ['Результаты поиска']);

  const resultsTable = findTableByHeaders(documentData, [
    'Заголовок',
    'Ссылка',
    'Описание',
    'Источник',
  ]);
  expect(resultsTable).toBeDefined();

  const firstResult = findRow(resultsTable, (row) => {
    return row.data['Заголовок'] === 'Результат 1: инструкция по ключам Windows';
  });
  expect(firstResult?.data['Ссылка']).toBe('https://example.com/result-1');
  expect(firstResult?.data['Источник']).toBe('example.com');
}

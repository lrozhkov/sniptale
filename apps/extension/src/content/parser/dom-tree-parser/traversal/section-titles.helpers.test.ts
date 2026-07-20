import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  debugMock: vi.fn(),
  isConcatenatedValuesMock: vi.fn((value: string) => value === 'concat'),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: mocks.debugMock }),
}));
vi.mock('../../dom-utils/dom-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../dom-utils/dom-helpers')>()),
  isConcatenatedValues: mocks.isConcatenatedValuesMock,
}));

import {
  filterSectionsWithContent,
  finalizeSectionTitles,
  mergeSectionsByTitle,
} from './section-titles.helpers';

beforeEach(() => {
  vi.clearAllMocks();
});

it('filters out sections without fields or tables', () => {
  const sections = [
    { children: [], title: 'Empty', type: 'section' },
    { children: [{ type: 'field' }], title: 'Filled', type: 'section' },
  ];

  expect(filterSectionsWithContent(sections as never)).toEqual([sections[1]]);
});

it('normalizes titles, infers garbage titles, and merges duplicates', () => {
  const sections = [
    {
      children: [{ label: 'Логин', type: 'field' }],
      title: 'Секция 1',
      type: 'section',
    },
    {
      children: [{ headers: ['Статус', 'Ключ'], type: 'table' }],
      title: 'Статус:',
      type: 'section',
    },
    {
      children: [{ label: 'Имя', type: 'field' }],
      title: 'Статус',
      type: 'section',
    },
  ];

  const merged = mergeSectionsByTitle(sections as never);

  expect(merged).toHaveLength(2);
  expect(merged[0]?.title).toBe('Данные учетной записи');
  expect(merged[1]?.title).toBe('Статус');
  expect(merged[1]?.children).toHaveLength(2);
  expect(mocks.debugMock).toHaveBeenCalled();
});

it('finalizes titles for unresolved garbage sections when inference is available', () => {
  const sections = [
    {
      children: [{ headers: ['Автор', 'Дата', 'Текст'], type: 'table' }],
      title: 'concat',
      type: 'section',
    },
  ];

  finalizeSectionTitles(sections as never);

  expect(sections[0]?.title).toBe('Комментарии');
});

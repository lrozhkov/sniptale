import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  debugMock: vi.fn(),
  isConcatenatedValuesMock: vi.fn(() => false),
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

function createSection(title: string, children: any[]) {
  return { children, title, type: 'section' } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('filters sections without content and merges duplicate normalized titles', () => {
  const sections = [
    createSection('Секция 1', [{ label: 'Логин', type: 'field' }]),
    createSection('Комментарии:', [{ headers: ['Автор'], type: 'table' }]),
    createSection('Комментарии', [{ label: 'Имя', type: 'field' }]),
    createSection('Пусто', [{ type: 'text' }]),
  ];

  const merged = mergeSectionsByTitle(filterSectionsWithContent(sections));
  const firstSection = merged[0];
  const secondSection = merged[1];

  expect(merged).toHaveLength(2);
  expect(firstSection?.title).toBe('Данные учетной записи');
  expect(secondSection?.title).toBe('Комментарии');
  expect(secondSection?.children).toHaveLength(2);
});

it('finalizes garbage titles by inferring a better title from section content', () => {
  const sections = [createSection('A', [{ label: 'Лицензия', type: 'field' }])];

  finalizeSectionTitles(sections);

  expect(sections[0].title).toBe('Лицензирование');
});

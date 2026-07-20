// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import { parsePortalHomepageSection } from './homepage-section.helpers';

function createContext(): TraversalContext {
  return {
    currentSection: null,
    globalFieldIndex: 1,
    globalTableIndex: 1,
    pendingFields: new Map<string, never[]>(),
    processedAttrLists: new Set<HTMLTableElement>(),
    processedCommentContainers: new Set<HTMLElement>(),
    processedComments: new Set<HTMLElement>(),
    processedFieldElements: new Set<HTMLElement>(),
    processedTables: new Set<HTMLTableElement>(),
    result: {
      context: 'test',
      title: 'Portal homepage',
      structure: [],
      meta: {
        profile: {
          vendor: 'generic',
          appFamily: 'generic-web',
          pageKind: 'content',
          pipelineId: 'generic-structured',
          confidence: 0.8,
          matchedSignals: [],
          preferredRoots: ['body'],
        },
        title: 'Portal homepage',
        url: 'https://example.test/portal/',
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
    getOriginalElementFn: (node) => node,
  };
}

function appendTextElement(parent: HTMLElement, selectorClass: string, text: string, tag = 'div') {
  const element = document.createElement(tag);
  element.className = selectorClass;
  element.textContent = text;
  parent.append(element);
  return element;
}

function buildSearchBlock() {
  const block = document.createElement('div');
  block.className = 'SearchBlock__root';
  appendTextElement(block, 'SearchBlock__headerTitle', 'Поиск услуг');
  appendTextElement(block, 'SearchBlock__headerComment', 'Найдите нужный сервис');
  appendTextElement(block, 'CreateServiceCall__block', 'Создать запрос', 'a');
  return block;
}

function buildServiceSectionWithoutRequestNumber() {
  const section = document.createElement('div');
  section.className = 'Section__root';
  appendTextElement(section, 'Title__titleLabel', 'История запросов');
  const card = appendTextElement(section, 'ServiceCall__serviceCall', '');
  appendTextElement(card, 'ServiceCall__serviceAndComponent', 'Почта');
  appendTextElement(card, 'ServiceCall__specificDate', '01.02.2026');
  appendTextElement(card, 'ServiceCall__serviceCallType', 'Инцидент');
  appendTextElement(card, 'ServiceCall__statusContainer', 'В работе');
  appendTextElement(card, 'ServiceCall__propertyValueMultiline', 'Нужно восстановить доступ');
  return section;
}

function buildServiceSectionWithEmptyRequestTitle() {
  const section = document.createElement('div');
  section.className = 'Section__root';
  appendTextElement(section, 'Title__titleLabel', 'Запросы');
  const card = appendTextElement(section, 'ServiceCall__serviceCall', '');
  appendTextElement(card, 'ServiceCall__serviceCallTitle', '');
  appendTextElement(card, 'ServiceCall__serviceAndComponent', 'VPN');
  appendTextElement(card, 'ServiceCall__specificDate', '05.02.2026');
  appendTextElement(card, 'ServiceCall__serviceCallType', 'Изменение');
  appendTextElement(card, 'ServiceCall__statusContainer', 'Новый');
  appendTextElement(card, 'ServiceCall__propertyValueMultiline', 'Добавить доступ');
  return section;
}

function buildCategorySection() {
  const section = document.createElement('div');
  section.className = 'Section__root';
  appendTextElement(section, 'Title__titleLabel', 'Популярное');
  const category = appendTextElement(section, 'Category__category', '');
  appendTextElement(category, 'Category__serviceLink', 'Сброс пароля', 'a');
  appendTextElement(category, 'Category__more', 'Еще >', 'a');
  return section;
}

function buildCategorySectionWithEmptyTitleAndService() {
  const section = document.createElement('div');
  section.className = 'Section__root';
  appendTextElement(section, 'Title__titleLabel', 'Категории');
  const category = appendTextElement(section, 'Category__category', '');
  appendTextElement(category, 'Category__titleText', '', 'a');
  appendTextElement(category, 'Category__serviceLink', '', 'a');
  appendTextElement(category, 'Category__more', 'Еще >', 'a');
  return section;
}

function buildPollSection() {
  const section = document.createElement('div');
  section.className = 'Section__root';
  appendTextElement(section, 'Title__titleLabel', 'Опросы');
  const poll = appendTextElement(section, 'Poll__pollCard', '');
  appendTextElement(poll, 'PollControl__option', 'Да');
  appendTextElement(poll, 'PollControl__option', 'Нет');
  return section;
}

function buildPollSectionWithEmptyTitleAndOption() {
  const section = document.createElement('div');
  section.className = 'Section__root';
  appendTextElement(section, 'Title__titleLabel', 'Опросы');
  const poll = appendTextElement(section, 'Poll__pollCard', '');
  appendTextElement(poll, 'Poll__titleText', '');
  appendTextElement(poll, 'PollControl__option', 'Да');
  appendTextElement(poll, 'PollControl__option', '');
  return section;
}

function buildFooterBlock() {
  const footer = document.createElement('div');
  footer.className = 'Footer__footerBlock';
  appendTextElement(footer, 'Footer__footerBlockCaption', 'Полезные ссылки');
  appendTextElement(footer, '', 'База знаний', 'a');
  appendTextElement(footer, '', '   ', 'a');
  return footer;
}

afterEach(() => {
  document.body.replaceChildren();
});

function registerSearchAndServiceTests() {
  it('parses search blocks into canonical portal fields', () => {
    const ctx = createContext();
    const result = parsePortalHomepageSection(buildSearchBlock(), ctx);

    expect(result.newSection?.title).toBe('Поиск услуг');
    expect(result.fields?.map((field) => field.label)).toEqual([
      'Заголовок',
      'Комментарий',
      'Основное действие',
    ]);
    expect(ctx.result.structure).toHaveLength(1);
  });

  it('uses fallback request numbering for service cards without explicit ids', () => {
    const ctx = createContext();
    const result = parsePortalHomepageSection(buildServiceSectionWithoutRequestNumber(), ctx);

    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Запрос 1 / Номер запроса', value: 'Запрос 1' }),
        expect.objectContaining({ label: 'Запрос 1 / Услуга', value: 'Почта' }),
        expect.objectContaining({
          label: 'Запрос 1 / Описание',
          value: 'Нужно восстановить доступ',
        }),
      ])
    );
  });

  it('falls back when the request title element exists but is blank', () => {
    const result = parsePortalHomepageSection(
      buildServiceSectionWithEmptyRequestTitle(),
      createContext()
    );

    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Запрос 1 / Номер запроса', value: 'Запрос 1' }),
        expect.objectContaining({ label: 'Запрос 1 / Услуга', value: 'VPN' }),
      ])
    );
  });
}

function registerCategoryAndFooterTests() {
  it('parses category and poll cards with fallback titles', () => {
    const categoryResult = parsePortalHomepageSection(buildCategorySection(), createContext());
    const pollResult = parsePortalHomepageSection(buildPollSection(), createContext());

    expect(categoryResult.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Категория 1', value: 'Категория 1' }),
        expect.objectContaining({ label: 'Категория 1 / Услуги', value: 'Сброс пароля, Еще >' }),
      ])
    );
    expect(pollResult.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Опрос 1', value: 'Опрос 1' }),
        expect.objectContaining({ label: 'Опрос 1 / Варианты', value: 'Да, Нет' }),
      ])
    );
  });

  it('handles blank category and poll titles through helper fallbacks', () => {
    const categoryResult = parsePortalHomepageSection(
      buildCategorySectionWithEmptyTitleAndService(),
      createContext()
    );
    const pollResult = parsePortalHomepageSection(
      buildPollSectionWithEmptyTitleAndOption(),
      createContext()
    );

    expect(categoryResult.fields).toEqual([
      expect.objectContaining({ label: '/ Услуги', value: 'Еще >' }),
    ]);
    expect(pollResult.fields).toEqual([
      expect.objectContaining({ label: '/ Варианты', value: 'Да' }),
    ]);
  });

  it('keeps only non-empty footer links as fields', () => {
    const result = parsePortalHomepageSection(buildFooterBlock(), createContext());

    expect(result.fields).toEqual([
      expect.objectContaining({ label: 'Ссылка 1', value: 'База знаний' }),
    ]);
  });
}

function registerEmptySectionTest() {
  it('drops empty sections and resets current section when no fields are collected', () => {
    const ctx = createContext();
    const emptySection = document.createElement('div');
    emptySection.className = 'Section__root';

    const result = parsePortalHomepageSection(emptySection, ctx);

    expect(result).toEqual({ skipChildren: true });
    expect(ctx.result.structure).toEqual([]);
    expect(ctx.currentSection).toBeNull();
  });
}

describe('portal-homepage section helpers', () => {
  registerSearchAndServiceTests();
  registerCategoryAndFooterTests();
  registerEmptySectionTest();
});

// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { parseDOMTree } from '../../../dom-tree-parser';
import type { TraversalContext } from '../../types';
import { extractPortalHomepageSections, PortalHomepageParser } from './homepage';
import { buildPortalHomepageFixture } from './homepage.test.fixtures';

function createContext(pageUrl = 'https://example.test/portal/'): TraversalContext {
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
      title: 'Portal',
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
        title: 'Portal',
        url: pageUrl,
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
    getOriginalElementFn: (node) => node,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  document.title = '';
  window.history.replaceState({}, '', '/');
});

function registerIntegrationTest() {
  it('captures portal homepage sections without falling back to a generic form dump', () => {
    buildPortalHomepageFixture();

    const tree = parseDOMTree();

    expect(tree.structure.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        'Мы здесь, чтобы помочь вам',
        'Ожидают согласования',
        'Популярные услуги',
        'Статьи базы знаний',
      ])
    );

    const fields = tree.structure.flatMap((section) =>
      section.children.filter((child) => child.type === 'field')
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Заголовок', value: 'Мы здесь, чтобы помочь вам' }),
        expect.objectContaining({ label: 'RP9244 / Номер запроса', value: 'RP9244' }),
        expect.objectContaining({ label: 'RP9244 / Услуга', value: 'Интернет и Wi-Fi' }),
        expect.objectContaining({
          label: 'RP9244 / Описание',
          value: 'Плановые работы по очистке парка компьютеров от пыли',
        }),
        expect.objectContaining({
          label: 'Категория 1',
          value: 'Категория услуг [Мелихов]',
        }),
        expect.objectContaining({
          label: 'Категория услуг [Мелихов] / Услуги',
          value: 'Техническая сервисная поддержка, Еще >',
        }),
        expect.objectContaining({ label: 'Ссылка 1', value: '111222333' }),
      ])
    );

    expect(tree.structure.map((section) => section.title)).not.toContain('Форма');
  });
}

function registerParserShellTest() {
  it('accepts only portal section roots in the canonical portal context', () => {
    const parser = new PortalHomepageParser();
    const root = document.createElement('div');
    root.className = 'Main__root';
    const section = document.createElement('div');
    section.className = 'Section__root';
    root.append(section);

    expect(parser.canParse(section, createContext())).toBe(true);
    expect(parser.canParse(root, createContext())).toBe(false);
  });

  it('rejects matching section roots outside the canonical portal pathname', () => {
    const parser = new PortalHomepageParser();
    const section = document.createElement('div');
    section.className = 'Section__root';

    expect(parser.canParse(section, createContext('https://example.test/requests/42'))).toBe(false);
    expect(
      extractPortalHomepageSections(section, createContext('https://example.test/requests/42'))
    ).toEqual([]);
  });
}

function registerSectionExtractionTest() {
  it('extracts portal homepage sections from both root and nested section matches', () => {
    const ctx = createContext();
    const root = document.createElement('div');
    root.className = 'Section__root';
    const title = document.createElement('div');
    title.className = 'Title__titleLabel';
    title.textContent = 'Корневой раздел';
    root.append(title);
    const category = document.createElement('div');
    category.className = 'Category__category';
    const service = document.createElement('a');
    service.className = 'Category__serviceLink';
    service.textContent = 'Сброс пароля';
    category.append(service);
    root.append(category);

    const nestedFooter = document.createElement('div');
    nestedFooter.className = 'Footer__footerBlock';
    const caption = document.createElement('div');
    caption.className = 'Footer__footerBlockCaption';
    caption.textContent = 'Ссылки';
    nestedFooter.append(caption);
    const link = document.createElement('a');
    link.textContent = 'Полезно';
    nestedFooter.append(link);
    root.append(nestedFooter);

    const sections = extractPortalHomepageSections(root, ctx);

    expect(sections).toHaveLength(2);
    expect(sections.map((section) => section.title)).toEqual(['Корневой раздел', 'Ссылки']);
  });
}

describe('portal homepage parser', () => {
  registerIntegrationTest();
  registerParserShellTest();
  registerSectionExtractionTest();
});

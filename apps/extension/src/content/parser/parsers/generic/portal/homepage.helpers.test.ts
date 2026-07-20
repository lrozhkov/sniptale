// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import { isPortalHomepage } from '../text/page-context.helpers';
import {
  buildPortalField,
  createPortalSection,
  getElementText,
  resolvePortalSectionTitle,
} from './homepage.helpers';

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
  window.history.replaceState({}, '', '/');
});

function registerMetadataTests() {
  it('uses canonical page metadata instead of live location', () => {
    window.history.replaceState({}, '', '/elsewhere/');

    const mainRoot = document.createElement('div');
    mainRoot.className = 'Main__root';

    expect(isPortalHomepage(createContext('https://example.test/portal/'), mainRoot)).toBe(true);
    expect(isPortalHomepage(createContext('https://example.test/dashboard/'), mainRoot)).toBe(
      false
    );
  });

  it('requires the portal main root in the parsed scope', () => {
    const container = document.createElement('div');

    expect(isPortalHomepage(createContext('https://example.test/portal/'), container)).toBe(false);
  });
}

function registerPortalFieldTests() {
  it('creates portal sections on the traversal context', () => {
    const ctx = createContext();
    const section = createPortalSection(ctx, 'Популярные услуги');

    expect(section.title).toBe('Популярные услуги');
    expect(ctx.result.structure).toEqual([section]);
    expect(ctx.currentSection).toBe(section);
  });

  it('builds portal fields only for non-empty labels and values', () => {
    const source = document.createElement('button');
    source.textContent = 'Создать';
    const ctx = createContext();

    const field = buildPortalField(ctx, ' Действие ', ' Создать ', source);

    expect(field).toMatchObject({ label: 'Действие', value: 'Создать', valueType: 'string' });
    expect(field).not.toHaveProperty('linkRef');
    expect(buildPortalField(ctx, '  ', 'Создать', source)).toBeNull();
    expect(buildPortalField(ctx, 'Действие', '   ', source)).toBeNull();
  });
}

function registerTextAndTitleTests() {
  it('returns element text or an empty fallback payload', () => {
    const fallback = document.createElement('div');
    fallback.textContent = 'Fallback';
    const child = document.createElement('span');
    child.textContent = '  Полезная ссылка  ';

    expect(getElementText(child, fallback)).toEqual({
      sourceElement: child,
      value: 'Полезная ссылка',
    });
    expect(getElementText(null, fallback)).toEqual({
      sourceElement: fallback,
      value: '',
    });
  });

  it('resolves titles from known candidates and tag fallbacks', () => {
    const titledSection = document.createElement('section');
    const title = document.createElement('a');
    title.className = 'Title__title__href';
    title.textContent = 'Каталог сервисов';
    titledSection.append(title);

    const fallbackFooter = document.createElement('footer');
    fallbackFooter.className = 'Footer__footerBlock';

    expect(resolvePortalSectionTitle(titledSection)).toBe('Каталог сервисов');
    expect(resolvePortalSectionTitle(fallbackFooter)).toBe('Раздел');
  });
}

describe('portal-homepage helpers', () => {
  registerMetadataTests();
  registerPortalFieldTests();
  registerTextAndTitleTests();
});

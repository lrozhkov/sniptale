// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import { isPortalHomepage } from './page-context.helpers';

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
  };
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, '', '/');
});

function registerPortalScopeTests() {
  it('recognizes portal context for document roots and nested descendants under the main root', () => {
    const mainRoot = document.createElement('div');
    mainRoot.className = 'Main__root';
    const nestedCard = document.createElement('div');
    mainRoot.append(nestedCard);
    document.body.append(mainRoot);

    expect(isPortalHomepage(createContext(), nestedCard)).toBe(true);
    expect(isPortalHomepage(createContext(), document)).toBe(true);
  });
}

function registerMetadataFallbackTests() {
  it('returns false when canonical page metadata has no url or the url is malformed', () => {
    const mainRoot = document.createElement('div');
    mainRoot.className = 'Main__root';

    const missingUrlContext = createContext();
    delete missingUrlContext.result.meta;
    const malformedUrlContext = createContext('http://%');

    expect(isPortalHomepage(missingUrlContext, mainRoot)).toBe(false);
    expect(isPortalHomepage(malformedUrlContext, mainRoot)).toBe(false);
  });
}

describe('generic page-context helpers', () => {
  registerPortalScopeTests();
  registerMetadataFallbackTests();
});

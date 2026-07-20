// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { determinePageContext } from './page-context';

describe('dom-tree traversal page context', () => {
  it('prefers vendor-specific context labels', () => {
    const root = document.createElement('main');
    root.innerHTML = '<h1>Ticket 42</h1>';

    expect(
      determinePageContext(
        root,
        {
          vendor: 'naumen-sd-gwt',
          appFamily: 'naumen',
          pageKind: 'ticket',
          pipelineId: 'generic-safe-fallback',
          confidence: 1,
          matchedSignals: [],
          preferredRoots: [],
        },
        {
          pageTitle: 'Fallback',
          pageUrl: 'https://example.com/ticket',
          pageHostname: 'example.com',
        }
      )
    ).toEqual({ context: 'Naumen SD', title: 'Ticket 42' });
  });

  it('falls back to generic context and page title metadata when needed', () => {
    const root = document.createElement('main');

    expect(
      determinePageContext(root, undefined, {
        pageTitle: 'Metadata title',
        pageUrl: 'https://example.com/service/123',
        pageHostname: 'example.com',
      })
    ).toEqual({ context: 'Карточка услуги', title: 'Metadata title' });
  });
});

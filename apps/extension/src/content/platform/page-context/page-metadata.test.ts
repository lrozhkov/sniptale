// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  resolveExportManagerPageMetadata,
  resolveLiveTraversalPageMetadata,
} from './page-metadata';

it('captures traversal page metadata from the live page boundary', () => {
  document.title = 'Live parser title';
  window.history.replaceState({}, '', '/parser/live-page');

  expect(resolveLiveTraversalPageMetadata()).toEqual({
    pageHostname: window.location.hostname,
    pageTitle: 'Live parser title',
    pageUrl: window.location.href,
  });
});

it('prefers canonical parsed-tree metadata for export-manager consumers', () => {
  expect(
    resolveExportManagerPageMetadata({
      context: 'Portal',
      title: 'Tree title',
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
        title: 'Canonical title',
        url: 'https://example.test/canonical',
        warnings: [],
      },
    })
  ).toEqual({
    pageTitle: 'Canonical title',
    pageUrl: 'https://example.test/canonical',
  });
});

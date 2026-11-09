// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { BrowserDomAnnotationRecord } from '../../../parser/page-preparation/annotations';
import { FeedbackList } from './list';

it('never exposes foreign evidence through query membership, including trusted script input', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const local: BrowserDomAnnotationRecord = {
    annotationId: 1,
    creationOrder: 1,
    comment: 'local-comment-token',
    propertyChanges: [],
    evidence: {
      fileLabel: 'Local page',
      frame: { kind: 'top-document' },
      locator: 'button',
      nodePosition: { x: 0, y: 0 },
      pageUrl: location.href,
      targetPath: 'local-path-token',
      targetSelector: 'local-selector-token',
      targetText: 'local-text-token',
      viewport: { width: 1280, height: 560 },
    },
  };
  const foreign = {
    ...local,
    annotationId: 2,
    comment: 'foreign-comment-token',
    evidence: {
      ...local.evidence,
      pageUrl: 'https://foreign.example.test/private',
      targetPath: 'foreign-path-token',
      targetSelector: 'foreign-selector-token',
      targetText: 'foreign-text-token',
    },
  };
  const malformed = {
    ...foreign,
    annotationId: 3,
    evidence: { ...foreign.evidence, pageUrl: 'invalid url' },
  };
  const render = (query: string) => {
    act(() => {
      root.render(
        <FeedbackList
          filter="all"
          query={query}
          records={[local, foreign, malformed]}
          onOpenRecord={() => false}
        />
      );
    });
    return Array.from(container.querySelectorAll('[data-annotation-id]'), (element) =>
      element.getAttribute('data-annotation-id')
    );
  };
  try {
    expect(render('')).toEqual(['1', '2', '3']);
    for (const field of ['comment', 'path', 'selector', 'text']) {
      expect(render(`foreign-${field}-token`)).toEqual([]);
      expect(render(`local-${field}-token`)).toEqual(['1']);
    }
    expect(render('token')).toEqual(['1']);
    expect(render('unmatched')).toEqual([]);
    expect(render('   ')).toEqual(['1', '2', '3']);
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

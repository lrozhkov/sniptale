// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { CapturedPageSnapshot } from '../../page-snapshot/types';

const buildPageSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock('../../page-snapshot/runtime', () => ({
  buildPageSnapshot: buildPageSnapshotMock,
}));

const { parseDOMTreeAfterIframePreflight, parsePageSnapshotAfterIframePreflight } =
  await import('.');

function createSnapshot(): CapturedPageSnapshot {
  return {
    iframeReadiness: { pendingIframes: [], timedOut: false, totalIframes: 0 },
    liveRoot: document.body,
    pageHostname: 'example.test',
    pageProfile: {
      appFamily: 'generic-web',
      confidence: 0.75,
      matchedSignals: [],
      pageKind: 'content',
      pipelineId: 'generic-structured',
      preferredRoots: ['body'],
      vendor: 'generic',
    },
    pageTitle: 'Page',
    pageUrl: 'https://example.test/',
    payloads: [],
    profileTrace: [],
    rootCandidates: ['body'],
    rootSelectionTrace: { candidateSelectors: ['body'] },
    virtualRoot: document.body.cloneNode(true) as HTMLElement,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  buildPageSnapshotMock.mockResolvedValue(createSnapshot());
});

it('keeps parser source optional and defaults the canonical parser path to the current document', async () => {
  await parsePageSnapshotAfterIframePreflight('default-source');

  expect(buildPageSnapshotMock).toHaveBeenCalledWith('default-source', undefined);
});

it('passes an injected parser source to the page snapshot builder', async () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const iframeDocument = iframe.contentDocument!;
  const source = {
    document: iframeDocument,
    pageTitle: 'Saved page',
    pageUrl: 'https://example.test/saved',
    root: iframeDocument.body,
  };

  await parsePageSnapshotAfterIframePreflight('iframe-source', source);

  expect(buildPageSnapshotMock).toHaveBeenCalledWith('iframe-source', source);
});

it('keeps the legacy DOMTree parser entrypoint as a compatibility alias', async () => {
  await parseDOMTreeAfterIframePreflight('legacy-source');

  expect(buildPageSnapshotMock).toHaveBeenCalledWith('legacy-source', undefined);
});

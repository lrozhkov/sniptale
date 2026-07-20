// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PageProfile, ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
import type { CapturedPageSnapshot } from '../../page-snapshot/types';

const { parseRootThroughPipelineMock } = vi.hoisted(() => ({
  parseRootThroughPipelineMock: vi.fn(),
}));

vi.mock('../orchestration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../orchestration')>()),
  parseRootThroughPipeline: parseRootThroughPipelineMock,
}));

import { normalizeWithRoot } from './normalization';

const pageProfile: PageProfile = {
  vendor: 'generic',
  appFamily: 'generic-web',
  pageKind: 'content',
  pipelineId: 'generic-structured',
  confidence: 0.9,
  matchedSignals: [{ id: 'article-root', source: 'dom', strength: 'hard' }],
  preferredRoots: ['article', 'body'],
};

const parsedDocument: ParsedDocument = {
  context: 'example.test',
  sections: [],
  structure: [],
  title: 'Captured page',
};

const expectedCandidateEvaluations = [
  {
    source: 'semantic-root',
    selector: 'article',
    score: 100,
    textLength: 80,
    linkDensity: 0,
    reasons: ['structured'],
    selected: true,
  },
  {
    source: 'fallback-body',
    selector: 'body',
    score: 10,
    textLength: 100,
    linkDensity: 0,
    reasons: ['fallback'],
    selected: false,
  },
];

function createSnapshot(resolveOriginalElement?: (virtualElement: Node) => Node | null) {
  const virtualRoot = document.createElement('main');
  return {
    iframeReadiness: { pendingIframes: [], timedOut: false, totalIframes: 0 },
    liveRoot: document.body,
    virtualRoot,
    ...(resolveOriginalElement === undefined ? {} : { resolveOriginalElement }),
    pageUrl: 'https://example.test/captured',
    pageTitle: 'Captured page',
    pageHostname: 'example.test',
    payloads: [
      {
        id: 'payload-1',
        kind: 'json' as const,
        locator: '#payload',
        source: 'script-tag' as const,
        schemaTextHint: true,
        textLength: 42,
      },
    ],
    pageProfile,
    profileTrace: pageProfile.matchedSignals,
    rootCandidates: ['article', 'body'],
    rootSelectionTrace: {
      candidateSelectors: ['article', 'body'],
      candidateEvaluations: [
        {
          source: 'semantic-root',
          selector: 'article',
          score: 100,
          textLength: 80,
          linkDensity: 0,
          reasons: ['structured'],
          selected: false,
        },
        {
          source: 'fallback-body',
          selector: 'body',
          score: 10,
          textLength: 100,
          linkDensity: 0,
          reasons: ['fallback'],
          selected: true,
        },
      ],
      selectedSelector: 'body',
      selectedTagName: 'body',
    },
  } satisfies CapturedPageSnapshot;
}

function registerSelectedRootTest(): void {
  it('rebuilds snapshot trace and delegates the selected root to canonical orchestration', () => {
    const resolveOriginalElement = vi.fn();
    const snapshot = createSnapshot(resolveOriginalElement);
    const parseRoot = document.createElement('article');

    expect(normalizeWithRoot(snapshot, parseRoot, 'article')).toEqual({
      documentData: parsedDocument,
    });
    expect(parseRootThroughPipelineMock).toHaveBeenCalledWith({
      pageMetadata: {
        pageHostname: snapshot.pageHostname,
        pageTitle: snapshot.pageTitle,
        pageUrl: snapshot.pageUrl,
      },
      pageProfile,
      parseRoot,
      resolveOriginalElement,
      trace: {
        detectorTrace: pageProfile.matchedSignals,
        payloadTrace: [
          {
            id: 'payload-1',
            kind: 'json',
            locator: '#payload',
            source: 'script-tag',
            schemaTextHint: true,
            textLength: 42,
          },
        ],
        rootSelection: {
          candidateSelectors: ['article', 'body'],
          candidateEvaluations: expectedCandidateEvaluations,
          selectedSelector: 'article',
          selectedTagName: 'article',
        },
      },
    });
  });
}

function registerFallbackRootTest(): void {
  it('omits absent selection and resolver while retaining the fallback root tag', () => {
    const snapshot = createSnapshot();

    normalizeWithRoot(snapshot, snapshot.virtualRoot, undefined);

    expect(parseRootThroughPipelineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parseRoot: snapshot.virtualRoot,
        trace: expect.objectContaining({
          rootSelection: expect.objectContaining({ selectedTagName: 'main' }),
        }),
      })
    );
    expect(parseRootThroughPipelineMock.mock.calls[0]?.[0]).not.toHaveProperty(
      'resolveOriginalElement'
    );
  });
}

describe('normalizeWithRoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseRootThroughPipelineMock.mockReturnValue(parsedDocument);
  });

  registerSelectedRootTest();
  registerFallbackRootTest();
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';

const {
  countDocumentQualityMock,
  normalizeWithRootMock,
  resolveCandidateRootsMock,
  resolveParserPipelineRegistryMock,
} = vi.hoisted(() => ({
  countDocumentQualityMock: vi.fn(),
  normalizeWithRootMock: vi.fn(),
  resolveCandidateRootsMock: vi.fn(),
  resolveParserPipelineRegistryMock: vi.fn(),
}));

vi.mock('../registry', () => ({
  resolveParserPipelineRegistry: resolveParserPipelineRegistryMock,
}));

vi.mock('./candidate-roots', () => ({
  resolveCandidateRoots: resolveCandidateRootsMock,
}));

vi.mock('./normalization', () => ({
  normalizeWithRoot: normalizeWithRootMock,
}));

vi.mock('./scoring', () => ({
  countDocumentQuality: countDocumentQualityMock,
}));

import { parseCapturedPage } from '.';

function createSnapshot() {
  return {
    iframeReadiness: {
      pendingIframes: [],
      timedOut: false,
      totalIframes: 0,
    },
    liveRoot: { id: 'live-root' } as unknown as HTMLElement,
    virtualRoot: { id: 'virtual-root' } as unknown as HTMLElement,
    pageUrl: 'https://example.test/page',
    pageTitle: 'Page',
    pageHostname: 'example.test',
    pageProfile: {
      vendor: 'generic',
      appFamily: 'generic-web',
      pageKind: 'content',
      pipelineId: 'generic-structured',
      confidence: 0.8,
      matchedSignals: [],
      preferredRoots: ['main'],
    },
    payloads: [],
    preferredRoot: undefined,
    profileTrace: [],
    rootCandidates: [],
    rootSelectionTrace: {
      candidateSelectors: ['main'],
      selectedSelector: 'main',
      selectedTagName: 'main',
    },
  };
}

function createDocument(id: string): ParsedDocument {
  return {
    context: 'test',
    title: id,
    structure: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveParserPipelineRegistryMock.mockReturnValue({
    trace: { rootStrategy: 'preferred-root' },
  });
});

function registerRootScoreToleranceTest() {
  it('prefers a root with a materially better root score within the score tolerance window', () => {
    const firstDocument = createDocument('first');
    const secondDocument = createDocument('second');

    resolveCandidateRootsMock.mockReturnValue([
      { element: { id: 'first' }, selector: '#first', rootScore: 10, containerSize: 8, depth: 1 },
      { element: { id: 'second' }, selector: '#second', rootScore: 50, containerSize: 8, depth: 1 },
    ]);
    normalizeWithRootMock
      .mockReturnValueOnce({ documentData: firstDocument })
      .mockReturnValueOnce({ documentData: secondDocument });
    countDocumentQualityMock.mockReturnValueOnce(100).mockReturnValueOnce(97);

    const result = parseCapturedPage(createSnapshot() as never);

    expect(result).toBe(secondDocument);
  });
}

function registerTieBreakSelectionTest() {
  it('breaks equal-score ties by smaller container, then better root score, then deeper depth', () => {
    const smallestDocument = createDocument('smallest');
    const higherRootScoreDocument = createDocument('higher-root-score');
    const deeperDocument = createDocument('deeper');

    resolveCandidateRootsMock.mockReturnValue([
      {
        element: { id: 'largest' },
        selector: '#largest',
        rootScore: 10,
        containerSize: 12,
        depth: 1,
      },
      {
        element: { id: 'smallest' },
        selector: '#smallest',
        rootScore: 10,
        containerSize: 6,
        depth: 1,
      },
      {
        element: { id: 'higher-root-score' },
        selector: '#higher-root-score',
        rootScore: 20,
        containerSize: 6,
        depth: 1,
      },
      { element: { id: 'deeper' }, selector: '#deeper', rootScore: 20, containerSize: 6, depth: 3 },
    ]);
    normalizeWithRootMock
      .mockReturnValueOnce({ documentData: createDocument('largest') })
      .mockReturnValueOnce({ documentData: smallestDocument })
      .mockReturnValueOnce({ documentData: higherRootScoreDocument })
      .mockReturnValueOnce({ documentData: deeperDocument });
    countDocumentQualityMock.mockReturnValue(100);

    const result = parseCapturedPage(createSnapshot() as never);

    expect(result).toBe(deeperDocument);
  });
}

function registerVirtualRootFallbackTest() {
  it('falls back to virtual-root normalization when candidate roots are empty', () => {
    const fallbackDocument = createDocument('fallback');
    const snapshot = createSnapshot();

    resolveCandidateRootsMock.mockReturnValue([]);
    normalizeWithRootMock.mockReturnValue({ documentData: fallbackDocument });

    const result = parseCapturedPage(snapshot as never);

    expect(result).toBe(fallbackDocument);
    expect(normalizeWithRootMock).toHaveBeenCalledWith(snapshot, snapshot.virtualRoot, undefined);
  });
}

function runIndexBranchesSuite() {
  registerRootScoreToleranceTest();
  registerTieBreakSelectionTest();
  registerVirtualRootFallbackTest();
}

describe('parse-page index branch selection', runIndexBranchesSuite);

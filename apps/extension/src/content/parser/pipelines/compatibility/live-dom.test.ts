// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PageProfile, ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';

const { parseRootThroughPipelineMock } = vi.hoisted(() => ({
  parseRootThroughPipelineMock: vi.fn(),
}));

vi.mock('../orchestration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../orchestration')>()),
  parseRootThroughPipeline: parseRootThroughPipelineMock,
}));

import { parseLiveDomThroughPipeline } from './live-dom';

const pageProfile: PageProfile = {
  vendor: 'generic',
  appFamily: 'generic-web',
  pageKind: 'content',
  pipelineId: 'generic-structured',
  confidence: 0.9,
  matchedSignals: [],
  preferredRoots: ['article', 'body'],
};

const pageMetadata = {
  pageHostname: 'example.test',
  pageTitle: 'Example page',
  pageUrl: 'https://example.test/article',
};

const parsedDocument: ParsedDocument = {
  context: 'Example',
  sections: [],
  structure: [],
  title: 'Example page',
};

describe('parseLiveDomThroughPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseRootThroughPipelineMock.mockReturnValue(parsedDocument);
  });

  it('delegates full-page parsing and live trace ownership to canonical orchestration', () => {
    const resolveOriginalElement = vi.fn();

    expect(
      parseLiveDomThroughPipeline({
        pageMetadata,
        pageProfile,
        parseRoot: document.body,
        resolveOriginalElement,
      })
    ).toBe(parsedDocument);

    expect(parseRootThroughPipelineMock).toHaveBeenCalledWith({
      pageMetadata,
      pageProfile,
      parseRoot: document.body,
      resolveOriginalElement,
      trace: {
        detectorTrace: pageProfile.matchedSignals,
        payloadTrace: [],
        rootSelection: { candidateSelectors: pageProfile.preferredRoots },
      },
    });
  });

  it('routes a custom root through the same entry without inventing a resolver', () => {
    const parseRoot = document.createElement('section');

    parseLiveDomThroughPipeline({ pageMetadata, pageProfile, parseRoot });

    expect(parseRootThroughPipelineMock).toHaveBeenCalledWith({
      pageMetadata,
      pageProfile,
      parseRoot,
      trace: {
        detectorTrace: pageProfile.matchedSignals,
        payloadTrace: [],
        rootSelection: { candidateSelectors: pageProfile.preferredRoots },
      },
    });
  });
});

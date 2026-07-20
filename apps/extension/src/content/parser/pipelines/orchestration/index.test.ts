// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  PageProfile,
  ParsedDocument,
  ParsedDOMTree,
} from '@sniptale/runtime-contracts/dom-tree';

const {
  applyDirectExtractorsMock,
  backendParseMock,
  normalizeLegacyTreeMock,
  resolveDomTreeParserBackendMock,
  resolveParserPipelineRegistryMock,
} = vi.hoisted(() => ({
  applyDirectExtractorsMock: vi.fn(),
  backendParseMock: vi.fn(),
  normalizeLegacyTreeMock: vi.fn(),
  resolveDomTreeParserBackendMock: vi.fn(),
  resolveParserPipelineRegistryMock: vi.fn(),
}));

vi.mock('../../backends', () => ({
  resolveDomTreeParserBackend: resolveDomTreeParserBackendMock,
}));

vi.mock('../../ir/normalize-legacy-tree', () => ({
  normalizeLegacyTree: normalizeLegacyTreeMock,
}));

vi.mock('../direct-extractors', () => ({
  applyDirectExtractors: applyDirectExtractorsMock,
}));

vi.mock('../registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../registry')>()),
  resolveParserPipelineRegistry: resolveParserPipelineRegistryMock,
}));

import { ParserBackendExecutionError } from './errors';
import { parseRootThroughPipeline } from '.';

const pageProfile: PageProfile = {
  vendor: 'generic',
  appFamily: 'generic-web',
  pageKind: 'content',
  pipelineId: 'generic-structured',
  confidence: 0.9,
  matchedSignals: [{ id: 'semantic-root', source: 'dom', strength: 'hard' }],
  preferredRoots: ['article', 'body'],
};

const pageMetadata = {
  pageHostname: 'example.test',
  pageTitle: 'Example page',
  pageUrl: 'https://example.test/article',
};

const pipeline = {
  registry: {},
  trace: {
    parserNames: ['ParserA'],
    registryId: 'generic-structured',
    rootStrategy: 'preferred-root',
  },
};

const backendTree: ParsedDOMTree = {
  context: 'Backend context',
  sections: [],
  structure: [],
  title: 'Backend title',
};

const normalizedDocument: ParsedDocument = {
  context: 'Normalized context',
  sections: [],
  structure: [],
  title: 'Example page',
};

const finalDocument: ParsedDocument = {
  ...normalizedDocument,
  blocks: [],
};

const rootSelection = {
  candidateSelectors: ['article', 'body'],
  selectedSelector: 'article',
  selectedTagName: 'article',
};

function createRequest() {
  return {
    pageMetadata,
    pageProfile,
    parseRoot: document.createElement('article'),
    resolveOriginalElement: vi.fn(),
    trace: {
      detectorTrace: pageProfile.matchedSignals,
      payloadTrace: [
        {
          id: 'payload-1',
          kind: 'json' as const,
          locator: '#payload',
          source: 'script-tag' as const,
          textLength: 42,
        },
      ],
      rootSelection,
    },
  };
}

function registerOrchestrationOrderTest(): void {
  it('owns registry, backend, normalization, direct extraction, and trace order', () => {
    const request = createRequest();

    expect(parseRootThroughPipeline(request)).toBe(finalDocument);
    expect(resolveParserPipelineRegistryMock).toHaveBeenCalledWith(pageProfile);
    expect(backendParseMock).toHaveBeenCalledWith({
      pageMetadata,
      pageProfile,
      parseRoot: request.parseRoot,
      pipeline,
      resolveOriginalElement: request.resolveOriginalElement,
    });
    expect(normalizeLegacyTreeMock).toHaveBeenCalledWith(backendTree, pageProfile, {
      detectorTrace: pageProfile.matchedSignals,
      pageContext: pageMetadata.pageHostname,
      pageTitle: pageMetadata.pageTitle,
      pageUrl: pageMetadata.pageUrl,
      payloadTrace: request.trace.payloadTrace,
      pipelineTrace: pipeline.trace,
      rootSelection,
    });
    expect(applyDirectExtractorsMock).toHaveBeenCalledWith(
      normalizedDocument,
      request.parseRoot,
      pageProfile,
      pageMetadata,
      request.resolveOriginalElement
    );
    expect(backendParseMock.mock.invocationCallOrder[0]).toBeLessThan(
      normalizeLegacyTreeMock.mock.invocationCallOrder[0] ?? 0
    );
    expect(normalizeLegacyTreeMock.mock.invocationCallOrder[0]).toBeLessThan(
      applyDirectExtractorsMock.mock.invocationCallOrder[0] ?? 0
    );
  });
}

function registerBackendFailureTest(): void {
  it('adds backend context, preserves the cause, and stops later stages', () => {
    const cause = new Error('TreeWalker failed');
    backendParseMock.mockImplementation(() => {
      throw cause;
    });

    expect(() => parseRootThroughPipeline(createRequest())).toThrow(
      expect.objectContaining({
        name: 'ParserBackendExecutionError',
        backendId: 'legacy-tree-walker',
        pipelineId: 'generic-structured',
        profileId: 'generic/content',
        cause,
      })
    );

    try {
      parseRootThroughPipeline(createRequest());
    } catch (error) {
      expect(error).toBeInstanceOf(ParserBackendExecutionError);
      expect((error as Error).message).not.toContain(pageMetadata.pageUrl);
    }
    expect(normalizeLegacyTreeMock).not.toHaveBeenCalled();
    expect(applyDirectExtractorsMock).not.toHaveBeenCalled();
  });
}

describe('parseRootThroughPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveParserPipelineRegistryMock.mockReturnValue(pipeline);
    resolveDomTreeParserBackendMock.mockReturnValue({
      id: 'legacy-tree-walker',
      parse: backendParseMock,
    });
    backendParseMock.mockReturnValue(backendTree);
    normalizeLegacyTreeMock.mockReturnValue(normalizedDocument);
    applyDirectExtractorsMock.mockReturnValue(finalDocument);
  });

  registerOrchestrationOrderTest();
  registerBackendFailureTest();
});

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PageProfile, ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';

const {
  buildVirtualDomSnapshotMock,
  parseLiveDomThroughPipelineMock,
  resolveLiveTraversalPageMetadataMock,
  resolvePageProfileMock,
} = vi.hoisted(() => ({
  buildVirtualDomSnapshotMock: vi.fn(),
  parseLiveDomThroughPipelineMock: vi.fn(),
  resolveLiveTraversalPageMetadataMock: vi.fn(),
  resolvePageProfileMock: vi.fn(),
}));

vi.mock('../../platform/page-context/page-metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/page-context/page-metadata')>()),
  resolveLiveTraversalPageMetadata: resolveLiveTraversalPageMetadataMock,
}));

vi.mock('../pipelines/compatibility/live-dom', () => ({
  parseLiveDomThroughPipeline: parseLiveDomThroughPipelineMock,
}));

vi.mock('../page-profile', () => ({
  resolvePageProfile: resolvePageProfileMock,
}));

vi.mock('./traversal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./traversal')>()),
  buildVirtualDomSnapshot: buildVirtualDomSnapshotMock,
}));

import { parseDOMTree } from '.';

const detectedProfile: PageProfile = {
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

function registerFullPageDelegationTest(): void {
  it('assembles full-page live inputs and delegates parsing to the compatibility adapter', () => {
    expect(parseDOMTree()).toBe(parsedDocument);

    expect(resolvePageProfileMock).toHaveBeenCalledWith(document);
    expect(buildVirtualDomSnapshotMock).toHaveBeenCalledOnce();
    expect(parseLiveDomThroughPipelineMock).toHaveBeenCalledWith({
      pageMetadata,
      pageProfile: detectedProfile,
      parseRoot: document.body,
      resolveOriginalElement:
        buildVirtualDomSnapshotMock.mock.results[0]?.value.resolveOriginalElement,
    });
  });
}

function registerCustomRootTest(): void {
  it('keeps custom-root parsing on the same adapter without a virtual snapshot', () => {
    const customRoot = document.createElement('section');

    parseDOMTree(customRoot);

    expect(resolvePageProfileMock).not.toHaveBeenCalled();
    expect(buildVirtualDomSnapshotMock).not.toHaveBeenCalled();
    expect(parseLiveDomThroughPipelineMock).toHaveBeenCalledWith({
      pageMetadata,
      pageProfile: expect.objectContaining({
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'custom-root',
        pipelineId: 'generic-structured',
      }),
      parseRoot: customRoot,
      resolveOriginalElement: undefined,
    });
  });
}

function registerResolverOmissionTest(): void {
  it('omits the original-element resolver when the virtual snapshot does not expose it', () => {
    buildVirtualDomSnapshotMock.mockReturnValue({
      root: document.body,
    });

    parseDOMTree();

    expect(parseLiveDomThroughPipelineMock).toHaveBeenCalledWith({
      pageMetadata,
      pageProfile: detectedProfile,
      parseRoot: document.body,
    });
  });
}

describe('parseDOMTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
    parseLiveDomThroughPipelineMock.mockReturnValue(parsedDocument);
    resolvePageProfileMock.mockReturnValue({
      confidence: detectedProfile.confidence,
      matchedSignals: detectedProfile.matchedSignals,
      profile: detectedProfile,
    });
    resolveLiveTraversalPageMetadataMock.mockReturnValue(pageMetadata);
    buildVirtualDomSnapshotMock.mockReturnValue({
      root: document.body,
      resolveOriginalElement: vi.fn(),
    });
  });

  registerFullPageDelegationTest();
  registerCustomRootTest();
  registerResolverOmissionTest();
});

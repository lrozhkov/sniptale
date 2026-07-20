import type { PageProfile, ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
import { parseRootThroughPipeline } from '../orchestration';

type PageMetadata = {
  pageHostname: string;
  pageTitle: string;
  pageUrl: string;
};

type OriginalElementResolver = (virtualElement: Node) => Node | null;

type LiveDomCompatibilityRequest = {
  pageMetadata: PageMetadata;
  pageProfile: PageProfile;
  parseRoot: HTMLElement;
  resolveOriginalElement?: OriginalElementResolver;
};

// Live DOM remains a compatibility input, while orchestration and backend selection stay canonical.
export function parseLiveDomThroughPipeline(request: LiveDomCompatibilityRequest): ParsedDocument {
  const { pageMetadata, pageProfile, parseRoot, resolveOriginalElement } = request;
  return parseRootThroughPipeline({
    pageMetadata,
    pageProfile,
    parseRoot,
    ...(resolveOriginalElement === undefined ? {} : { resolveOriginalElement }),
    trace: {
      detectorTrace: pageProfile.matchedSignals,
      payloadTrace: [],
      rootSelection: {
        candidateSelectors: pageProfile.preferredRoots,
      },
    },
  });
}

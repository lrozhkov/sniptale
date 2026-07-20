import type { DocumentBlock, PageProfile, SectionNode } from '@sniptale/runtime-contracts/dom-tree';

type DirectExtractionPageContext = {
  pageHostname: string;
  pageTitle: string;
  pageUrl: string;
};

type DirectExtractionResult = {
  blocks?: DocumentBlock[];
  replaceStructure?: boolean;
  sections: SectionNode[];
};

type DirectExtractor = (
  root: HTMLElement,
  profile: PageProfile,
  pageContext: DirectExtractionPageContext
) => DirectExtractionResult;

type DirectExtractorMap = Partial<Record<PageProfile['vendor'], DirectExtractor>>;

export function resolveDirectExtractorForProfile(
  profile: PageProfile,
  extractors: DirectExtractorMap
): DirectExtractor | null {
  return extractors[profile.vendor] ?? null;
}

export type { DirectExtractionPageContext, DirectExtractionResult, DirectExtractorMap };

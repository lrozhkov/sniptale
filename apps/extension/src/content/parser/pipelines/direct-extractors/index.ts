import type { PageProfile, ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
import { finalizeParsedDocument } from '../../ir/finalize-parsed-document';
import { setGetOriginalElementFn } from '../../dom-utils/dom-helpers';
import {
  resolveDirectExtractorForProfile,
  type DirectExtractionPageContext,
  type DirectExtractionResult,
} from '../registry/direct-extractor-routes';
import { extractGenericSections } from './generic';
import { mergeDirectExtractionSections } from './helpers';
import { extractNaumenPortalSections, extractNaumenSdSections } from './naumen';

const DIRECT_EXTRACTORS = {
  generic: extractGenericSections,
  'naumen-portal': extractNaumenPortalSections,
  'naumen-sd-gwt': extractNaumenSdSections,
} as const;

type OriginalElementResolver = (virtualElement: Node) => Node | null;

function runWithOriginalElementResolver<T>(
  resolver: OriginalElementResolver | undefined,
  action: () => T
): T {
  if (!resolver) {
    return action();
  }

  setGetOriginalElementFn(resolver);
  try {
    return action();
  } finally {
    setGetOriginalElementFn(null);
  }
}

export function applyDirectExtractors(
  documentData: ParsedDocument,
  root: HTMLElement,
  profile: PageProfile,
  pageContext: DirectExtractionPageContext,
  resolveOriginalElement?: OriginalElementResolver
): ParsedDocument {
  const directExtractor = resolveDirectExtractorForProfile(profile, DIRECT_EXTRACTORS);
  const directExtraction: DirectExtractionResult = directExtractor
    ? runWithOriginalElementResolver(resolveOriginalElement, () =>
        directExtractor(root, profile, pageContext)
      )
    : { sections: [] };

  if (directExtraction.sections.length === 0) {
    return finalizeParsedDocument(documentData);
  }

  const currentSections = documentData.sections ?? documentData.structure;
  const mergedSections = directExtraction.replaceStructure
    ? directExtraction.sections
    : mergeDirectExtractionSections(currentSections, directExtraction.sections);

  return finalizeParsedDocument({
    ...documentData,
    sections: mergedSections,
    structure: mergedSections,
    ...(directExtraction.blocks === undefined ? {} : { blocks: directExtraction.blocks }),
  });
}

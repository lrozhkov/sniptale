import type { PageProfile, SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { normalizeLegacyTree } from '../../ir/normalize-legacy-tree';
import type {
  DirectExtractionPageContext,
  DirectExtractionResult,
} from '../registry/direct-extractor-routes';

export function normalizeDirectSections(
  sections: SectionNode[],
  profile: PageProfile,
  pageContext: DirectExtractionPageContext
): DirectExtractionResult {
  if (sections.length === 0) {
    return { sections: [] };
  }

  const normalized = normalizeLegacyTree(
    {
      context: pageContext.pageHostname,
      structure: sections,
      title: pageContext.pageTitle,
    },
    profile,
    {
      pageContext: pageContext.pageHostname,
      pageTitle: pageContext.pageTitle,
      pageUrl: pageContext.pageUrl,
    }
  );

  return {
    sections: normalized.sections ?? normalized.structure,
  };
}

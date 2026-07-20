import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import { initContext } from '../../dom-tree-parser/traversal';
import { extractGenericContent } from '../../parsers/generic';
import type {
  DirectExtractionPageContext,
  DirectExtractionResult,
} from '../registry/direct-extractor-routes';

export function extractGenericSections(
  root: HTMLElement,
  profile: PageProfile,
  pageContext: DirectExtractionPageContext
): DirectExtractionResult {
  const ctx = initContext(profile, undefined, {
    pageHostname: pageContext.pageHostname,
    pageTitle: pageContext.pageTitle,
    pageUrl: pageContext.pageUrl,
  });
  if (profile.pageKind !== 'content') {
    return { sections: [] };
  }

  return extractGenericContent(root, ctx);
}

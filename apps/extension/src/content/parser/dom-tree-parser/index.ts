import type { PageProfile, ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
import { resolveLiveTraversalPageMetadata } from '../../platform/page-context/page-metadata';
import { parseLiveDomThroughPipeline } from '../pipelines/compatibility/live-dom';
import { resolvePageProfile } from '../page-profile';
import { buildVirtualDomSnapshot } from './traversal';

const CUSTOM_ROOT_FALLBACK_PROFILE: PageProfile = {
  vendor: 'generic',
  appFamily: 'generic-web',
  pageKind: 'custom-root',
  pipelineId: 'generic-structured',
  confidence: 0.75,
  matchedSignals: [],
  preferredRoots: [],
};

export function parseDOMTree(rootElement?: HTMLElement): ParsedDocument {
  const pageProfile = rootElement
    ? CUSTOM_ROOT_FALLBACK_PROFILE
    : resolvePageProfile(document).profile;
  const virtualDomSnapshot = rootElement ? undefined : buildVirtualDomSnapshot();

  return parseLiveDomThroughPipeline({
    pageMetadata: resolveLiveTraversalPageMetadata(),
    pageProfile,
    parseRoot: rootElement ?? virtualDomSnapshot?.root ?? document.body,
    ...(virtualDomSnapshot?.resolveOriginalElement === undefined
      ? {}
      : { resolveOriginalElement: virtualDomSnapshot.resolveOriginalElement }),
  });
}

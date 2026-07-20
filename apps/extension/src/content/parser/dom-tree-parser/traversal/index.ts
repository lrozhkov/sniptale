import type {
  PageProfile,
  ParsedDOMTree,
  PipelineTrace,
} from '@sniptale/runtime-contracts/dom-tree';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  resolveLiveTraversalPageMetadata,
  type TraversalPageMetadata,
} from '../../../platform/page-context/page-metadata';
import type { TraversalContext } from '../../parsers';
import { MVS_APPLICATION_CODE } from '../mvs/constants';
import { isQuicklyHidden } from '../../dom-utils/dom-helpers';
import {
  shouldRejectTreeWalkerContext,
  shouldRejectVirtualIframeSubtree,
  shouldRejectTreeWalkerClassList,
  shouldRejectTreeWalkerTag,
  shouldSkipActionPanel,
} from './helpers';
import {
  filterSectionsWithContent,
  finalizeSectionTitles,
  mergeSectionsByTitle,
} from './section-titles.helpers';
import { embedVirtualIframe } from './iframe.helpers';
import {
  buildVirtualNodeMappings,
  flattenOpenShadowRoots,
  resolveStreamedVirtualContent,
} from './virtual-dom.helpers';

const logger = createLogger({ namespace: 'ContentDomTreeTraversal' });

export { determinePageContext } from './page-context';
export type { TraversalPageMetadata } from '../../../platform/page-context/page-metadata';
export type VirtualDomOriginalElementResolver = (virtualElement: Node) => Node | null;

interface VirtualDomSnapshot {
  root: HTMLElement;
  resolveOriginalElement: VirtualDomOriginalElementResolver;
}

interface BuildVirtualDomSnapshotOptions {
  documentRoot?: Document;
  root?: HTMLElement;
}

function shouldRejectTreeWalkerElement(element: Element, tagName: string, classList: DOMTokenList) {
  return (
    !element.tagName ||
    shouldRejectTreeWalkerTag(tagName) ||
    shouldRejectTreeWalkerClassList(classList) ||
    isQuicklyHidden(element)
  );
}

function shouldSkipTreeWalkerElement(element: Element, classList: DOMTokenList, elementId: string) {
  if (element.getAttribute('data-virtual-iframe') === 'true') {
    if (shouldRejectVirtualIframeSubtree(element)) {
      return NodeFilter.FILTER_REJECT;
    }

    if (
      element.getAttribute('data-application-code') === MVS_APPLICATION_CODE ||
      element.getAttribute('data-application-code') === 'dynamicFields'
    ) {
      return null;
    }

    return NodeFilter.FILTER_SKIP;
  }

  if (elementId === 'gwt-debug-title' && element.tagName.toUpperCase() === 'SPAN') {
    return NodeFilter.FILTER_SKIP;
  }

  if (shouldSkipActionPanel(element, classList, elementId)) {
    return NodeFilter.FILTER_SKIP;
  }

  return null;
}

export const treeWalkerFilter: NodeFilter = {
  acceptNode(node: Node): number {
    const element = node as Element;

    const tagName = element.tagName.toUpperCase();
    const classList = element.classList;
    if (shouldRejectTreeWalkerElement(element, tagName, classList)) {
      return NodeFilter.FILTER_REJECT;
    }

    const elementId = (element as HTMLElement).id;
    const skipResult = shouldSkipTreeWalkerElement(element, classList, elementId);
    if (skipResult !== null) {
      return skipResult;
    }

    const rejectResult = shouldRejectTreeWalkerContext(element);
    if (rejectResult !== null) {
      return rejectResult;
    }

    return NodeFilter.FILTER_ACCEPT;
  },
};

export function initContext(
  profile?: PageProfile,
  pipelineTrace?: PipelineTrace,
  pageMetadata: TraversalPageMetadata = resolveLiveTraversalPageMetadata()
): TraversalContext {
  return {
    result: {
      context: pageMetadata.pageHostname,
      title: pageMetadata.pageTitle,
      structure: [],
      sections: [],
      meta: {
        profile: profile ?? {
          vendor: 'unknown',
          appFamily: 'unknown',
          pageKind: 'unknown',
          pipelineId: 'generic-safe-fallback',
          confidence: 0,
          matchedSignals: [],
          preferredRoots: [],
        },
        title: pageMetadata.pageTitle,
        url: pageMetadata.pageUrl,
        warnings: [],
        ...(pipelineTrace === undefined ? {} : { pipelineTrace }),
      },
    },
    currentSection: null,
    sectionIndex: 0,
    globalFieldIndex: 0,
    globalTableIndex: 0,
    processedTables: new Set(),
    processedAttrLists: new Set(),
    processedFieldElements: new Set(),
    processedCommentContainers: new Set(),
    processedComments: new Set(),
    sectionElements: [],
    ...(profile === undefined ? {} : { pageProfile: profile }),
    ...(pipelineTrace === undefined ? {} : { pipelineTrace }),
  };
}

export function postProcessResult(result: ParsedDOMTree): ParsedDOMTree {
  const filteredSections = filterSectionsWithContent(result.structure);
  const mergedSections = mergeSectionsByTitle(filteredSections);
  finalizeSectionTitles(mergedSections);
  const normalizedSections = filterSectionsWithContent(mergedSections);

  logger.debug('Post-processing complete', {
    sectionCount: normalizedSections.length,
  });

  return {
    ...result,
    sections: normalizedSections,
    structure: normalizedSections,
  };
}

export function buildVirtualDomSnapshot(
  options: BuildVirtualDomSnapshotOptions = {}
): VirtualDomSnapshot {
  const documentRoot = options.documentRoot ?? document;
  const originalRoot = options.root ?? documentRoot.body;
  const virtualToOriginalMap = new Map<Node, Node>();
  const originalToVirtualMap = new Map<Node, Node>();
  const virtualBody = originalRoot.cloneNode(true) as HTMLElement;
  buildVirtualNodeMappings({
    virtualToOriginalMap,
    originalToVirtualMap,
    virtual: virtualBody,
    original: originalRoot,
  });

  flattenOpenShadowRoots({ root: originalRoot, virtualToOriginalMap, originalToVirtualMap });
  resolveStreamedVirtualContent(virtualBody);

  const originalIframes = Array.from(originalRoot.querySelectorAll('iframe'));
  logger.debug('Building virtual DOM', { iframeCount: originalIframes.length });

  for (const originalIframe of originalIframes) {
    try {
      embedVirtualIframe({
        originalIframe,
        virtualBody,
        virtualToOriginalMap,
      });
    } catch (error) {
      logger.warn('Cannot embed iframe', {
        error,
        iframeId: originalIframe.id || originalIframe.src,
      });
    }
  }

  return {
    root: virtualBody,
    resolveOriginalElement: (virtualElement: Node) => {
      return virtualToOriginalMap.get(virtualElement) || null;
    },
  };
}

export function buildVirtualDOM(): HTMLElement {
  return buildVirtualDomSnapshot().root;
}

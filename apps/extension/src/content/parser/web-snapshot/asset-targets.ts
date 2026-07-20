import { isSafeWebSnapshotUrl } from '../../../features/web-snapshot/public';
import { SELECTED_SRCSET_CANDIDATE_ATTRIBUTE } from '../page-preparation/snapshot/responsive-assets';
import { isHiddenAssetElement, removeAssetReference } from './asset-dom';

const DOCUMENT_NODE_TYPE = 9;

export type AssetTarget = {
  attribute: 'href' | 'poster' | 'src' | 'srcset';
  element: Element;
  url: string;
};
export type AssetTargetWarning = {
  reason: string;
  url: string;
};
type AssetTargetCollection = {
  targets: AssetTarget[];
  warnings: AssetTargetWarning[];
};
type AssetUrlContext = {
  baseUrl: string;
  pageOrigin: string;
};
type CollectAssetTargetOptions = {
  baseUrl?: string | undefined;
};

type SrcsetCandidate = {
  descriptor: string;
  url: string;
};

export function parseSrcset(value: string): SrcsetCandidate[] {
  return value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => {
      const [url = '', ...descriptorParts] = candidate.split(/\s+/);
      return { descriptor: descriptorParts.join(' '), url };
    })
    .filter((candidate) => candidate.url.length > 0);
}

export function serializeSrcset(candidates: SrcsetCandidate[]): string {
  return candidates
    .map((candidate) =>
      candidate.descriptor ? `${candidate.url} ${candidate.descriptor}` : candidate.url
    )
    .join(', ');
}

function createSkippedWarning(url: string, reason: string): AssetTargetWarning {
  return { reason, url };
}

function resolveCandidateUrl(element: Element, value: string, baseUrl: string): string | null {
  try {
    return new URL(value, baseUrl || element.ownerDocument.baseURI).href;
  } catch {
    return null;
  }
}

function createSelectedSrcsetTarget(
  element: Element,
  value: string,
  warnings: AssetTargetWarning[],
  baseUrl: string
): AssetTarget | null {
  const selectedAttribute = element.getAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE);
  element.removeAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE);
  const selectedUrl = selectedAttribute
    ? resolveCandidateUrl(element, selectedAttribute, baseUrl)
    : null;
  const candidates = parseSrcset(value);
  const selectedCandidate = selectedUrl
    ? candidates.find(
        (candidate) => resolveCandidateUrl(element, candidate.url, baseUrl) === selectedUrl
      )
    : null;

  for (const candidate of candidates) {
    if (candidate !== selectedCandidate) {
      warnings.push(
        createSkippedWarning(candidate.url, 'web snapshot srcset candidate was not selected')
      );
    }
  }

  if (!selectedCandidate) {
    removeAssetReference(element, 'srcset');
    return null;
  }

  const selectedSrcset = serializeSrcset([selectedCandidate]);
  element.setAttribute('srcset', selectedSrcset);
  return { attribute: 'srcset', element, url: selectedSrcset };
}

function pushVisibleAssetTarget(
  root: ParentNode,
  warnings: AssetTargetWarning[],
  targets: AssetTarget[],
  target: AssetTarget
): void {
  if (target.attribute !== 'href' && isHiddenAssetElement(target.element, root)) {
    removeAssetReference(target.element, target.attribute);
    warnings.push(createSkippedWarning(target.url, 'web snapshot asset is hidden or offscreen'));
    return;
  }

  targets.push(target);
}

function isElementOfType(
  element: Element,
  constructorName: 'HTMLImageElement',
  fallbackTagName: string
): boolean {
  const elementConstructor = element.ownerDocument.defaultView?.[constructorName];

  return elementConstructor
    ? element instanceof elementConstructor
    : element.tagName.toLowerCase() === fallbackTagName;
}

function hasSelectedPictureSource(element: Element, selectedSrcsetElements: WeakSet<Element>) {
  if (!isElementOfType(element, 'HTMLImageElement', 'img')) {
    return false;
  }

  const picture = element.closest('picture');
  return picture
    ? Array.from(picture.querySelectorAll('source[srcset]')).some((source) =>
        selectedSrcsetElements.has(source)
      )
    : false;
}

function shouldSkipFallbackAsset(
  element: Element,
  selectedSrcsetElements: WeakSet<Element>
): boolean {
  return (
    selectedSrcsetElements.has(element) || hasSelectedPictureSource(element, selectedSrcsetElements)
  );
}

function resolveRootDocument(root: ParentNode): Document {
  if ('nodeType' in root && root.nodeType === DOCUMENT_NODE_TYPE) {
    return root as Document;
  }

  const ownerDocument = (root as Node).ownerDocument;
  if (ownerDocument) {
    return ownerDocument;
  }

  if (typeof document !== 'undefined') {
    return document;
  }

  throw new Error('Cannot collect web snapshot assets without a document.');
}

export function collectAssetTargets(
  root: ParentNode,
  options: CollectAssetTargetOptions = {}
): AssetTargetCollection {
  const targets: AssetTarget[] = [];
  const warnings: AssetTargetWarning[] = [];
  const selectedSrcsetElements = new WeakSet<Element>();
  const baseUrl = options.baseUrl ?? resolveRootDocument(root).baseURI;

  for (const element of root.querySelectorAll('img[srcset], source[srcset]')) {
    const url = element.getAttribute('srcset');
    if (url) {
      const selectedTarget = createSelectedSrcsetTarget(element, url, warnings, baseUrl);
      if (selectedTarget) {
        selectedSrcsetElements.add(element);
        pushVisibleAssetTarget(root, warnings, targets, selectedTarget);
      }
    }
  }

  for (const element of root.querySelectorAll('img[src], source[src], video[poster]')) {
    const attribute = element.hasAttribute('poster') ? 'poster' : 'src';
    const url = element.getAttribute(attribute);
    if (url) {
      if (shouldSkipFallbackAsset(element, selectedSrcsetElements)) {
        removeAssetReference(element, attribute);
        warnings.push(createSkippedWarning(url, 'web snapshot fallback asset was not selected'));
        continue;
      }
      pushVisibleAssetTarget(root, warnings, targets, { attribute, element, url });
    }
  }

  for (const element of root.querySelectorAll('link[rel~="stylesheet"][href]')) {
    const url = element.getAttribute('href');
    if (url) {
      targets.push({ attribute: 'href', element, url });
    }
  }

  return { targets, warnings };
}

function resolveSafeAssetUrl(value: string, baseUrl: string): string | null {
  if (!isSafeWebSnapshotUrl(value, baseUrl)) {
    return null;
  }

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

export function collectBackgroundFetchUrls(
  targets: AssetTarget[],
  context: AssetUrlContext
): string[] {
  const urls = new Set<string>();

  for (const target of targets) {
    const values =
      target.attribute === 'srcset'
        ? parseSrcset(target.url).map((candidate) => candidate.url)
        : [target.url];

    for (const value of values) {
      const resolvedUrl = resolveSafeAssetUrl(value, context.baseUrl);
      if (resolvedUrl && new URL(resolvedUrl).origin !== context.pageOrigin) {
        urls.add(resolvedUrl);
      }
    }
  }

  return Array.from(urls);
}

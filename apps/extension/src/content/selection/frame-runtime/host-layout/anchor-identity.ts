import { getIframeDocument, isIframeAccessible, walkAllDocuments } from '../../../platform/frame';
import { parseCompositeSelector } from '../../../platform/frame/selectors';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const TRANSIENT_CONNECTED_ANCHOR_ATTRIBUTE = 'data-sniptale-id';

const ANCHOR_FINGERPRINT_ATTRIBUTE_NAMES = [
  'data-sniptale-id',
  'id',
  'href',
  'src',
  'name',
  'type',
  'role',
  'aria-label',
] as const;

type AnchorFingerprintPart = {
  attributes: ReadonlyArray<readonly [string, string]>;
  tagName: string;
};

type ConnectedAnchorFingerprint = {
  ancestor: AnchorFingerprintPart | null;
  target: AnchorFingerprintPart;
};

export type AnchorFingerprint = AnchorFingerprintPart & {
  ancestor: AnchorFingerprintPart | null;
  connected: ConnectedAnchorFingerprint;
  hasStableDiscriminator: boolean;
};

type AnchorCandidateResolution =
  | { kind: 'resolved'; element: HTMLElement }
  | { kind: 'missing' }
  | { kind: 'ambiguous' };

function readStableAttribute(
  element: HTMLElement,
  name: (typeof ANCHOR_FINGERPRINT_ATTRIBUTE_NAMES)[number]
) {
  if (name === 'href' || name === 'src') {
    const raw = element.getAttribute(name);
    if (!raw) return null;
    try {
      return new URL(raw, element.ownerDocument.baseURI).href;
    } catch {
      return raw;
    }
  }
  return element.getAttribute(name);
}

function createFingerprintPart(
  element: HTMLElement,
  includeTransientConnectedAttribute = true
): AnchorFingerprintPart {
  const attributes = ANCHOR_FINGERPRINT_ATTRIBUTE_NAMES.flatMap((name) => {
    if (!includeTransientConnectedAttribute && name === TRANSIENT_CONNECTED_ANCHOR_ATTRIBUTE) {
      return [];
    }
    const value = readStableAttribute(element, name)?.trim();
    return value ? ([[name, value]] as const) : [];
  });
  return { attributes, tagName: element.tagName.toLowerCase() };
}

function findStableAncestor(
  element: HTMLElement,
  includeTransientConnectedAttribute = true
): AnchorFingerprintPart | null {
  let current = element.parentElement;
  let depth = 0;
  while (current && depth < 5) {
    const part = createFingerprintPart(current, includeTransientConnectedAttribute);
    if (part.attributes.length > 0) {
      return part;
    }
    current = current.parentElement;
    depth += 1;
  }
  return null;
}

export function createAnchorFingerprint(element: HTMLElement): AnchorFingerprint {
  const part = createFingerprintPart(element);
  const ancestor = findStableAncestor(element);
  return {
    ...part,
    ancestor,
    connected: {
      ancestor: findStableAncestor(element, false),
      target: createFingerprintPart(element, false),
    },
    hasStableDiscriminator: part.attributes.length > 0 || Boolean(ancestor?.attributes.length),
  };
}

function arePartsEqual(left: AnchorFingerprintPart | null, right: AnchorFingerprintPart | null) {
  if (left === null || right === null) return left === right;
  if (left.tagName !== right.tagName || left.attributes.length !== right.attributes.length) {
    return false;
  }
  return left.attributes.every(([name, value], index) => {
    const candidate = right.attributes[index];
    return candidate?.[0] === name && candidate[1] === value;
  });
}

function areAnchorFingerprintsEqual(left: AnchorFingerprint, right: AnchorFingerprint): boolean {
  return arePartsEqual(left, right) && arePartsEqual(left.ancestor, right.ancestor);
}

/**
 * Keeps the already accepted DOM node stable while parser-owned locator ids come and go.
 * Replacement candidates still use the strict fingerprint comparison above.
 */
export function areConnectedAnchorFingerprintsEqual(
  left: AnchorFingerprint,
  right: AnchorFingerprint
): boolean {
  return (
    arePartsEqual(left.connected.target, right.connected.target) &&
    arePartsEqual(left.connected.ancestor, right.connected.ancestor)
  );
}

function queryDocument(doc: Document, selector: string): HTMLElement[] {
  try {
    return Array.from(doc.querySelectorAll(selector)).filter(
      (element): element is HTMLElement => element.namespaceURI === HTML_NAMESPACE
    );
  } catch {
    return [];
  }
}

type AnchorCandidateScope = { doc: Document; selector: string };

function listReachableDocuments(): Document[] {
  const documents: Document[] = [];
  walkAllDocuments((doc) => documents.push(doc));
  return Array.from(new Set(documents));
}

function isIframeElement(element: HTMLElement): element is HTMLIFrameElement {
  return element.localName === 'iframe';
}

function resolveCandidateUniverse(selector: string): {
  identityDocuments: Document[];
  scopes: AnchorCandidateScope[];
} {
  const composite = parseCompositeSelector(selector);
  const identityDocuments = listReachableDocuments();
  if (composite.iframeSelector) {
    const scopes = identityDocuments.flatMap((parentDocument) =>
      queryDocument(parentDocument, composite.iframeSelector!).flatMap((element) => {
        if (!isIframeElement(element) || !isIframeAccessible(element)) return [];
        const doc = getIframeDocument(element);
        return doc ? [{ doc, selector: composite.elementSelector }] : [];
      })
    );
    return {
      identityDocuments,
      scopes: Array.from(new Map(scopes.map((scope) => [scope.doc, scope])).values()),
    };
  }

  return {
    identityDocuments,
    scopes: identityDocuments.map((doc) => ({ doc, selector: composite.elementSelector })),
  };
}

function findAnchorCandidates(scopes: readonly AnchorCandidateScope[]): HTMLElement[] {
  const candidates = scopes.flatMap(({ doc, selector: local }) => queryDocument(doc, local));
  return Array.from(new Set(candidates));
}

function findFingerprintMatches(
  documents: readonly Document[],
  fingerprint: AnchorFingerprint
): HTMLElement[] {
  const matches = Array.from(new Set(documents)).flatMap((doc) =>
    Array.from(doc.getElementsByTagName(fingerprint.tagName)).filter(
      (element): element is HTMLElement =>
        element.namespaceURI === HTML_NAMESPACE &&
        areAnchorFingerprintsEqual(createAnchorFingerprint(element as HTMLElement), fingerprint)
    )
  );
  return Array.from(new Set(matches));
}

export function resolveAnchorCandidate(
  selector: string,
  fingerprint: AnchorFingerprint | null
): AnchorCandidateResolution {
  const { identityDocuments, scopes } = resolveCandidateUniverse(selector);
  const candidates = findAnchorCandidates(scopes);
  if (candidates.length === 0) return { kind: 'missing' };
  if (candidates.length > 1) return { kind: 'ambiguous' };
  const candidate = candidates[0]!;
  if (fingerprint && !areAnchorFingerprintsEqual(createAnchorFingerprint(candidate), fingerprint)) {
    return { kind: 'missing' };
  }
  const candidateFingerprint = fingerprint ?? createAnchorFingerprint(candidate);
  if (!candidateFingerprint.hasStableDiscriminator) return { kind: 'missing' };

  const identityMatches = findFingerprintMatches(identityDocuments, candidateFingerprint);
  if (identityMatches.length > 1) return { kind: 'ambiguous' };
  if (identityMatches.length !== 1 || identityMatches[0] !== candidate) return { kind: 'missing' };
  return { kind: 'resolved', element: candidate };
}

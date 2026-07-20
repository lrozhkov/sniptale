export interface PageSnapshotSource {
  document: Document;
  pageHostname?: string | null;
  pageTitle?: string | null;
  pageUrl?: string | null;
  root?: HTMLElement | null;
}

interface ResolvedPageSnapshotSource {
  document: Document;
  pageHostname: string;
  pageTitle: string;
  pageUrl: string;
  root: HTMLElement;
}

const ELEMENT_NODE_TYPE = 1;

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveHostnameFromUrl(pageUrl: string): string | undefined {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return undefined;
  }
}

function resolveAmbientDocument(): Document {
  if (typeof document === 'undefined') {
    throw new Error('Cannot build page snapshot without a document.');
  }

  return document;
}

function resolveAmbientLocation(): Location | undefined {
  return typeof window === 'undefined' ? undefined : window.location;
}

function resolveDocumentLocation(
  documentRoot: Document,
  options: { allowAmbientFallback: boolean }
): Location | undefined {
  return (
    documentRoot.defaultView?.location ??
    (options.allowAmbientFallback ? resolveAmbientLocation() : undefined)
  );
}

function resolvePageUrl(documentRoot: Document, source?: PageSnapshotSource): string {
  const explicitPageUrl = normalizeOptionalText(source?.pageUrl);
  if (explicitPageUrl) {
    return explicitPageUrl;
  }

  const documentLocation = resolveDocumentLocation(documentRoot, {
    allowAmbientFallback: source === undefined,
  });
  if (!documentLocation) {
    throw new Error('Cannot build page snapshot without a page URL.');
  }

  return documentLocation.href;
}

function resolveDocumentRoot(documentRoot: Document, sourceRoot?: HTMLElement | null): HTMLElement {
  const root = sourceRoot ?? documentRoot.body ?? documentRoot.documentElement;
  if (!root || root.nodeType !== ELEMENT_NODE_TYPE) {
    throw new Error('Cannot build page snapshot without an element root.');
  }

  return root;
}

export function resolvePageSnapshotSource(source?: PageSnapshotSource): ResolvedPageSnapshotSource {
  const documentRoot = source?.document ?? resolveAmbientDocument();
  const pageUrl = resolvePageUrl(documentRoot, source);
  const explicitHostname = normalizeOptionalText(source?.pageHostname);
  const hostnameFromUrl = resolveHostnameFromUrl(pageUrl);
  const documentLocation =
    explicitHostname || hostnameFromUrl
      ? undefined
      : resolveDocumentLocation(documentRoot, { allowAmbientFallback: source === undefined });
  const pageHostname = explicitHostname ?? hostnameFromUrl ?? documentLocation?.hostname ?? '';

  return {
    document: documentRoot,
    pageHostname,
    pageTitle: normalizeOptionalText(source?.pageTitle) ?? documentRoot.title,
    pageUrl,
    root: resolveDocumentRoot(documentRoot, source?.root),
  };
}

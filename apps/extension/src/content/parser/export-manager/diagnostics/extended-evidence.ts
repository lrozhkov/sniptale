import {
  redactDiagnosticUrlSecrets,
  sanitizeRawDiagnosticExportData,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import {
  PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE,
  type PagePackageExtendedDiagnosticPath,
} from '@sniptale/runtime-contracts/page-package';
import {
  buildExtendedDiagnosticDomProjection,
  admitExtendedDiagnosticDomInput,
  MAX_EXTENDED_DIAGNOSTIC_ELEMENTS,
  type ExtendedDiagnosticRedaction,
} from './extended-evidence.dom';
import { resolveDiagnosticsDocument, type ExportDiagnosticsSource } from './source';
import { estimateUtf8Bytes } from '@sniptale/runtime-contracts/validation/base64';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_EXTENDED_DIAGNOSTIC_HASH_INPUT_BYTES = 32 * 1024 * 1024;
export const MAX_EXTENDED_DIAGNOSTIC_METADATA_INPUT_BYTES = 32 * 1024 * 1024;

export type ExtendedDiagnosticTextDigest = (value: string) => Promise<string>;

export interface ExtendedDiagnosticArtifact {
  content: string;
  mimeType: 'application/json' | 'text/plain';
  path: PagePackageExtendedDiagnosticPath;
}

interface HashedContentMetadata {
  bodyLength: number;
  bodySha256: string | null;
}

function sanitizeScalar(key: string, value: string): string {
  const sanitized = sanitizeRawDiagnosticExportData({ [key]: value });
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return '';
  const result = (sanitized as Record<string, unknown>)[key];
  return typeof result === 'string' ? result : '';
}

function sanitizeJson(value: unknown): string {
  return `${JSON.stringify(sanitizeRawDiagnosticExportData(value), null, 2)}\n`;
}

function elementPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && segments.length < 8) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.localName === current.localName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    segments.unshift(`${current.localName}:nth-of-type(${index})`);
    current = current.parentElement;
  }
  return segments.join(' > ');
}

async function hashContent(
  value: string,
  digestText: ExtendedDiagnosticTextDigest
): Promise<HashedContentMetadata> {
  if (value.length === 0) return { bodyLength: 0, bodySha256: null };
  const bodySha256 = await digestText(value);
  if (!SHA256_PATTERN.test(bodySha256)) {
    throw new Error('Extended diagnostic digest is not a lowercase SHA-256 value.');
  }
  return { bodyLength: value.length, bodySha256 };
}

async function collectScriptMetadata(
  scripts: readonly HTMLScriptElement[],
  digestText: ExtendedDiagnosticTextDigest
): Promise<Record<string, unknown>[]> {
  const result: Record<string, unknown>[] = [];
  for (const script of scripts) {
    const body = script.textContent ?? '';
    result.push({
      async: script.hasAttribute('async'),
      defer: script.hasAttribute('defer'),
      elementPath: elementPath(script),
      inline: !script.hasAttribute('src'),
      src: redactDiagnosticUrlSecrets(script.getAttribute('src') ?? undefined) ?? null,
      type: sanitizeScalar('scriptType', script.getAttribute('type') ?? 'text/javascript'),
      ...(await hashContent(body, digestText)),
    });
  }
  return result;
}

async function collectStylesheetMetadata(
  styles: readonly Element[],
  digestText: ExtendedDiagnosticTextDigest
): Promise<Record<string, unknown>[]> {
  const result: Record<string, unknown>[] = [];
  for (const element of styles) {
    const body = element.localName === 'style' ? (element.textContent ?? '') : '';
    result.push({
      elementPath: elementPath(element),
      href: redactDiagnosticUrlSecrets(element.getAttribute('href') ?? undefined) ?? null,
      kind: element.localName === 'style' ? 'inline' : 'linked',
      media: sanitizeScalar('media', element.getAttribute('media') ?? ''),
      ...(await hashContent(body, digestText)),
    });
  }
  return result;
}

function collectFrameMetadata(documentRoot: Document): Record<string, unknown>[] {
  const frames = Array.from(documentRoot.querySelectorAll('iframe, frame'));
  if (frames.length > MAX_EXTENDED_DIAGNOSTIC_ELEMENTS) {
    throw new Error('Extended diagnostic frame inventory exceeds the element limit.');
  }
  return frames.map((frame) => ({
    accessible: (frame as HTMLIFrameElement).contentDocument !== null,
    elementPath: elementPath(frame),
    src: redactDiagnosticUrlSecrets(frame.getAttribute('src') ?? undefined) ?? null,
    srcdocLength: frame.getAttribute('srcdoc')?.length ?? 0,
  }));
}

function collectHashableElements(documentRoot: Document): {
  scripts: HTMLScriptElement[];
  styles: Element[];
} {
  const scripts = Array.from(documentRoot.querySelectorAll('script'));
  const styles = Array.from(documentRoot.querySelectorAll('style, link[rel~="stylesheet"]'));
  if (
    scripts.length > MAX_EXTENDED_DIAGNOSTIC_ELEMENTS ||
    styles.length > MAX_EXTENDED_DIAGNOSTIC_ELEMENTS
  ) {
    throw new Error('Extended diagnostic executable metadata exceeds the element limit.');
  }
  let totalBytes = 0;
  for (const element of [...scripts, ...styles]) {
    if (element.localName !== 'script' && element.localName !== 'style') continue;
    const nodeFilter = documentRoot.defaultView?.NodeFilter ?? NodeFilter;
    const walker = documentRoot.createTreeWalker(
      element,
      nodeFilter.SHOW_TEXT | nodeFilter.SHOW_CDATA_SECTION
    );
    let node = walker.nextNode();
    while (node) {
      const remaining = MAX_EXTENDED_DIAGNOSTIC_HASH_INPUT_BYTES - totalBytes;
      const size = estimateUtf8Bytes(node.nodeValue ?? '', remaining);
      if (size > remaining) {
        throw new Error('Extended diagnostic executable metadata exceeds the byte limit.');
      }
      totalBytes += size;
      node = walker.nextNode();
    }
  }
  return { scripts, styles };
}

function assertMetadataInputWithinBudget(args: {
  documentRoot: Document;
  pageUrl?: string | undefined;
}): void {
  let totalBytes = 0;
  const admit = (value: string | null | undefined): void => {
    if (!value) return;
    const remaining = MAX_EXTENDED_DIAGNOSTIC_METADATA_INPUT_BYTES - totalBytes;
    const size = estimateUtf8Bytes(value, remaining);
    if (size > remaining) {
      throw new Error('Extended diagnostic metadata exceeds the byte limit.');
    }
    totalBytes += size;
  };
  const { documentRoot } = args;
  admit(args.pageUrl ?? documentRoot.URL);
  admit(documentRoot.title);
  admit(documentRoot.documentElement.lang);
  for (const element of documentRoot.querySelectorAll(
    'script, style, link[rel~="stylesheet"], iframe, frame'
  )) {
    admit(element.getAttribute('src'));
    admit(element.getAttribute('type'));
    admit(element.getAttribute('href'));
    admit(element.getAttribute('media'));
  }
}

function buildDocumentMetadata(args: {
  documentRoot: Document;
  elementCount: number;
  frameCount: number;
  pageUrl?: string | undefined;
  scriptCount: number;
  stylesheetCount: number;
}): Record<string, unknown> {
  const { documentRoot } = args;
  return {
    compatMode: documentRoot.compatMode,
    doctype: documentRoot.doctype?.name ?? null,
    elementCount: args.elementCount,
    frameCount: args.frameCount,
    language: sanitizeScalar('language', documentRoot.documentElement.lang),
    scriptCount: args.scriptCount,
    sourceUrl: redactDiagnosticUrlSecrets(args.pageUrl ?? documentRoot.URL) ?? null,
    stylesheetCount: args.stylesheetCount,
    title: sanitizeScalar('title', documentRoot.title),
  };
}

function buildRedactionPayload(redactions: ExtendedDiagnosticRedaction[]): Record<string, unknown> {
  const counts = Object.fromEntries(
    Array.from(new Set(redactions.map((entry) => entry.reason)))
      .sort()
      .map((reason) => [reason, redactions.filter((entry) => entry.reason === reason).length])
  );
  return { counts, redactions, total: redactions.length };
}

export async function buildExtendedDiagnosticArtifacts(args: {
  digestText: ExtendedDiagnosticTextDigest;
  source?: ExportDiagnosticsSource | undefined;
}): Promise<ExtendedDiagnosticArtifact[]> {
  const documentRoot = resolveDiagnosticsDocument(args.source);
  const domAdmission = admitExtendedDiagnosticDomInput(documentRoot);
  const hashable = collectHashableElements(documentRoot);
  assertMetadataInputWithinBudget({ documentRoot, pageUrl: args.source?.pageUrl });
  const projection = buildExtendedDiagnosticDomProjection(documentRoot, domAdmission);
  const scripts = await collectScriptMetadata(hashable.scripts, args.digestText);
  const stylesheets = await collectStylesheetMetadata(hashable.styles, args.digestText);
  const frames = collectFrameMetadata(documentRoot);
  const metadata = buildDocumentMetadata({
    documentRoot,
    elementCount: projection.elementCount,
    frameCount: frames.length,
    pageUrl: args.source?.pageUrl,
    scriptCount: scripts.length,
    stylesheetCount: stylesheets.length,
  });
  const artifacts: ExtendedDiagnosticArtifact[] = [
    {
      content: projection.html,
      mimeType: 'text/plain',
      path: 'diagnostics/extended/live-dom.html.txt',
    },
    {
      content: sanitizeJson(metadata),
      mimeType: 'application/json',
      path: 'diagnostics/extended/document-metadata.json',
    },
    {
      content: sanitizeJson({ scripts }),
      mimeType: 'application/json',
      path: 'diagnostics/extended/scripts.json',
    },
    {
      content: sanitizeJson({ stylesheets }),
      mimeType: 'application/json',
      path: 'diagnostics/extended/stylesheets.json',
    },
    {
      content: sanitizeJson({ frames }),
      mimeType: 'application/json',
      path: 'diagnostics/extended/frames.json',
    },
    {
      content: sanitizeJson(buildRedactionPayload(projection.redactions)),
      mimeType: 'application/json',
      path: 'diagnostics/extended/redactions.json',
    },
  ];
  if (
    artifacts.some((artifact, index) => {
      const profile = PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE[index];
      return profile?.path !== artifact.path || profile.mimeType !== artifact.mimeType;
    })
  ) {
    throw new Error('Extended diagnostic artifact inventory does not match its contract.');
  }
  return artifacts;
}

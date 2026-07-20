import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import {
  sanitizeDiagnosticMessage,
  sanitizeDiagnosticUrl,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import type { ExportManagerPageMetadata } from '../../../platform/page-context/page-metadata';
import {
  resolveDiagnosticsDocument,
  resolveOptionalDiagnosticsView,
  type ExportDiagnosticsSource,
} from '../../../parser/export-manager/diagnostics/source';

function createEmptyResourceTimingRollups() {
  return {
    totalResources: 0,
    transferSize: 0,
    byInitiatorType: {},
    slowest: [],
  };
}

function collectResourceTimingRollups(sourceView?: Window) {
  if (!sourceView) {
    return createEmptyResourceTimingRollups();
  }

  const entries = sourceView.performance.getEntriesByType(
    'resource'
  ) as PerformanceResourceTiming[];
  const byInitiatorType = entries.reduce<Record<string, number>>((acc, entry) => {
    const initiatorType = entry.initiatorType || 'other';
    acc[initiatorType] = (acc[initiatorType] ?? 0) + 1;
    return acc;
  }, {});

  const slowest = [...entries]
    .sort((left, right) => right.duration - left.duration)
    .slice(0, 10)
    .map((entry) => ({
      duration: Math.round(entry.duration),
      initiatorType: entry.initiatorType || 'other',
      name: sanitizeDiagnosticUrl(entry.name) ?? '',
      transferSize: entry.transferSize || 0,
    }));

  return {
    totalResources: entries.length,
    transferSize: entries.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
    byInitiatorType,
    slowest,
  };
}

function mapResourceTimingEntryToHarEntry(entry: PerformanceResourceTiming, timeOrigin: number) {
  return {
    _from: 'performance-resource-timing',
    _initiatorType: entry.initiatorType || 'other',
    cache: {},
    pageref: 'resource_timing_page',
    request: {
      bodySize: -1,
      cookies: [],
      headers: [],
      headersSize: -1,
      httpVersion: '',
      method: 'GET',
      queryString: [],
      url: sanitizeDiagnosticUrl(entry.name) ?? '',
    },
    response: {
      bodySize: -1,
      content: {
        mimeType: '',
        size: entry.transferSize || 0,
      },
      cookies: [],
      headers: [],
      headersSize: -1,
      httpVersion: '',
      redirectURL: '',
      status: 0,
      statusText: '',
    },
    startedDateTime: new Date(timeOrigin + entry.startTime).toISOString(),
    time: Math.round(entry.duration),
    timings: {
      blocked: -1,
      connect: -1,
      dns: -1,
      receive: Math.max(0, Math.round(entry.duration)),
      send: 0,
      ssl: -1,
      wait: 0,
    },
  };
}

function buildResourceTimingHarMeta(
  pageMetadata: Partial<ExportManagerPageMetadata> | undefined,
  sourceView: Window | undefined,
  sourcePageUrl?: string
) {
  const manifest = runtimeInfo.getManifest();
  const pageUrl = pageMetadata?.pageUrl ?? sourcePageUrl ?? sourceView?.location.href;

  return {
    browser: {
      name: sourceView?.navigator.userAgent ?? 'unknown',
      version: '',
    },
    creator: {
      name: `${PRODUCT_BRAND_NAME} resource-timing snapshot`,
      version: manifest.version,
    },
    pages: [
      {
        id: 'resource_timing_page',
        pageTimings: {
          onContentLoad: -1,
          onLoad: -1,
        },
        startedDateTime: new Date(sourceView?.performance.timeOrigin ?? Date.now()).toISOString(),
        title: sanitizeDiagnosticMessage(
          pageMetadata?.pageTitle ?? sanitizeDiagnosticUrl(pageUrl) ?? ''
        ),
      },
    ],
  };
}

export function buildPageSummaryFile(
  pageMetadata?: Partial<ExportManagerPageMetadata>,
  source?: ExportDiagnosticsSource
) {
  const documentRoot = resolveDiagnosticsDocument(source);
  const sourceView = resolveOptionalDiagnosticsView(source);

  return {
    document: {
      characterSet: documentRoot.characterSet,
      doctype: documentRoot.doctype?.name || null,
      readyState: documentRoot.readyState,
      title: sanitizeDiagnosticMessage(pageMetadata?.pageTitle ?? documentRoot.title),
      visibilityState: documentRoot.visibilityState,
    },
    counts: {
      forms: documentRoot.forms.length,
      iframes: documentRoot.querySelectorAll('iframe').length,
      images: documentRoot.images.length,
      links: documentRoot.links.length,
      scripts: documentRoot.scripts.length,
      stylesheets: documentRoot.querySelectorAll('link[rel="stylesheet"], style').length,
    },
    resourceTiming: collectResourceTimingRollups(sourceView),
  };
}

export function createHarLikeSnapshot(
  pageMetadata?: Partial<ExportManagerPageMetadata>,
  source?: ExportDiagnosticsSource
) {
  const sourceView = resolveOptionalDiagnosticsView(source);
  const entries =
    (
      sourceView?.performance.getEntriesByType('resource') as
        | PerformanceResourceTiming[]
        | undefined
    )?.map((entry) =>
      mapResourceTimingEntryToHarEntry(entry, sourceView?.performance.timeOrigin ?? Date.now())
    ) ?? [];

  return {
    log: {
      ...buildResourceTimingHarMeta(pageMetadata, sourceView, source?.pageUrl),
      entries,
      version: '1.2',
    },
  };
}

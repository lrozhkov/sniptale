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

function mapResourceTimingEntry(entry: PerformanceResourceTiming) {
  return {
    decodedBodySize: entry.decodedBodySize || 0,
    duration: Math.round(entry.duration),
    encodedBodySize: entry.encodedBodySize || 0,
    initiatorType: entry.initiatorType || 'other',
    name: sanitizeDiagnosticUrl(entry.name) ?? '',
    nextHopProtocol: entry.nextHopProtocol || '',
    startTime: Math.round(entry.startTime),
    transferSize: entry.transferSize || 0,
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

export function createResourceTimingSnapshot(
  pageMetadata?: Partial<ExportManagerPageMetadata>,
  source?: ExportDiagnosticsSource
) {
  const sourceView = resolveOptionalDiagnosticsView(source);
  const entries =
    (
      sourceView?.performance.getEntriesByType('resource') as
        | PerformanceResourceTiming[]
        | undefined
    )?.map(mapResourceTimingEntry) ?? [];

  const pageUrl = pageMetadata?.pageUrl ?? source?.pageUrl ?? sourceView?.location.href;

  return {
    capturedAt: new Date().toISOString(),
    entries,
    pageTitle: sanitizeDiagnosticMessage(pageMetadata?.pageTitle ?? ''),
    pageUrl: sanitizeDiagnosticUrl(pageUrl) ?? '',
    timeOrigin: sourceView?.performance.timeOrigin ?? null,
  };
}

import { collectWebSnapshotAssets } from './assets';
import { captureWebSnapshotScreenshot } from './capture';
import { buildWebSnapshotPackage } from './package';
import { sanitizeDiagnosticMessage } from '@sniptale/platform/observability/diagnostics/sanitizer';
import type { ContentPrivilegedActionIntentSource } from '../../platform/privileged-action-intent/client';
import {
  buildPreparedSnapshotDocument,
  serializePreparedSnapshotDocument,
} from '../page-preparation/snapshot';
import type {
  WebSnapshotBuildResult,
  WebSnapshotPageSource,
  WebSnapshotWarningStats,
} from './types';

const FALLBACK_SCREENSHOT_BYTES = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 1, 98, 98, 96, 96, 96, 0, 0, 0, 0, 255,
  255, 93, 23, 41, 205, 0, 0, 0, 6, 73, 68, 65, 84, 3, 0, 0, 15, 0, 3, 36, 55, 125, 233, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130,
]);

function createWarningStats(args: {
  networkWarnings: string[];
  privacyWarnings: string[];
  sanitizerWarnings: Array<{ message: string }>;
  screenshotWarnings: string[];
}): WebSnapshotWarningStats {
  return {
    failedAssetCount: args.networkWarnings.length,
    networkWarningCount: args.networkWarnings.length,
    sanitizerWarningCount: args.sanitizerWarnings.length,
    warningCount:
      args.networkWarnings.length +
      args.privacyWarnings.length +
      args.sanitizerWarnings.length +
      args.screenshotWarnings.length,
  };
}

function normalizeWebSnapshotWarnings(warnings: unknown[]): string[] {
  return warnings
    .map((warning) => (typeof warning === 'string' ? warning : String(warning ?? '')))
    .map((warning) => warning.trim())
    .filter(Boolean);
}

function createNormalizedWarningSummary(args: {
  networkWarnings: string[];
  preparedWarnings: Array<{ message: string }>;
  privacyWarnings: string[];
  screenshotWarnings: string[];
}): {
  warningStats: WebSnapshotWarningStats;
  warnings: string[];
} {
  return {
    warningStats: createWarningStats({
      networkWarnings: args.networkWarnings,
      privacyWarnings: args.privacyWarnings,
      sanitizerWarnings: args.preparedWarnings,
      screenshotWarnings: args.screenshotWarnings,
    }),
    warnings: normalizeWebSnapshotWarnings([
      ...args.preparedWarnings.map((warning) => warning.message),
      ...args.privacyWarnings,
      ...args.networkWarnings,
      ...args.screenshotWarnings,
    ]),
  };
}

function resolveCurrentPageSource(): WebSnapshotPageSource {
  if (typeof document === 'undefined') {
    throw new Error('Cannot build web snapshot without a document.');
  }
  const viewport = resolveCurrentPageViewport(document);

  return {
    title: document.title || null,
    url: document.location.href,
    ...(viewport === undefined ? {} : { viewport }),
  };
}

function resolveCurrentPageViewport(
  targetDocument: Document
): WebSnapshotPageSource['viewport'] | undefined {
  const view = targetDocument.defaultView ?? (typeof window === 'undefined' ? undefined : window);
  const width = view?.innerWidth ?? targetDocument.documentElement.clientWidth;
  const height = view?.innerHeight ?? targetDocument.documentElement.clientHeight;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }

  return {
    height: Math.round(height),
    width: Math.round(width),
  };
}

async function captureWebSnapshotScreenshotOrFallback(
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined
): Promise<{
  screenshotBlob: Blob;
  warnings: string[];
}> {
  try {
    return {
      screenshotBlob: await captureWebSnapshotScreenshot(contentIntentSource),
      warnings: [],
    };
  } catch (error) {
    const message =
      error instanceof Error ? sanitizeDiagnosticMessage(error.message) : 'unknown error';
    return {
      screenshotBlob: new Blob([FALLBACK_SCREENSHOT_BYTES], { type: 'image/png' }),
      warnings: [`Full-page web snapshot screenshot failed: ${message}`],
    };
  }
}

export async function buildCurrentPageWebSnapshot(args: {
  allowAnonymousCrossOriginAssets: boolean;
  allowAuthenticatedSameOriginAssets: boolean;
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  requestId: string;
}): Promise<WebSnapshotBuildResult> {
  const source = resolveCurrentPageSource();
  const preparedSnapshot = await buildPreparedSnapshotDocument({
    contextLabel: 'web-snapshot',
  });
  const snapshotDocument = preparedSnapshot.document;
  const [assetResult, screenshotResult] = await Promise.all([
    collectWebSnapshotAssets(snapshotDocument, {
      allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
      allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
      requestId: args.requestId,
      sourceUrl: source.url,
    }),
    captureWebSnapshotScreenshotOrFallback(args.contentIntentSource),
  ]);
  const { assets, privacyWarnings, snapshotSessionId, warnings } = assetResult;
  const warningSummary = createNormalizedWarningSummary({
    networkWarnings: warnings,
    preparedWarnings: preparedSnapshot.warnings,
    privacyWarnings,
    screenshotWarnings: screenshotResult.warnings,
  });
  const html = serializePreparedSnapshotDocument(snapshotDocument);
  const packaged = await buildWebSnapshotPackage({
    assets,
    diagnosticsSource: {
      document: snapshotDocument,
      pageUrl: source.url,
      view: snapshotDocument.defaultView,
    },
    html,
    screenshotBlob: screenshotResult.screenshotBlob,
    source,
    warnings: warningSummary.warnings,
    warningStats: warningSummary.warningStats,
  });

  return {
    ...packaged,
    snapshotSessionId,
    warnings: warningSummary.warnings,
  };
}

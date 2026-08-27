import { collectWebSnapshotAssets } from './assets';
import { captureWebSnapshotScreenshotWithWarnings } from './capture';
import { buildWebSnapshotPackage } from './package';
import type { ContentPrivilegedActionIntentSource } from '../../platform/privileged-action-intent/client';
import type { FullPageExportCaptureIdentity } from '../../../contracts/full-page-capture';
import {
  buildPreparedSnapshotDocument,
  serializePreparedSnapshotDocument,
} from '../page-preparation/snapshot';
import type {
  WebSnapshotBuildResult,
  WebSnapshotPageSource,
  WebSnapshotWarningStats,
} from './types';
import type { WebSnapshotSaveProgressUpdate } from './progress';

function throwIfWebSnapshotBuildAborted(signal?: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Web snapshot save was cancelled');
}

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

async function captureRequiredWebSnapshotScreenshot(
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined,
  captureIdentity?: FullPageExportCaptureIdentity | undefined,
  abortSignal?: AbortSignal | undefined
): Promise<{
  screenshotBlob: Blob;
  warnings: string[];
}> {
  throwIfWebSnapshotBuildAborted(abortSignal);
  const screenshot = await captureWebSnapshotScreenshotWithWarnings(
    contentIntentSource,
    captureIdentity
  );
  throwIfWebSnapshotBuildAborted(abortSignal);
  return {
    screenshotBlob: screenshot.blob,
    warnings: screenshot.warnings,
  };
}

export async function buildCurrentPageWebSnapshot(args: {
  abortSignal?: AbortSignal | undefined;
  allowAnonymousCrossOriginAssets: boolean;
  allowAuthenticatedSameOriginAssets: boolean;
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  fullPageCaptureIdentity?: FullPageExportCaptureIdentity | undefined;
  requestId: string;
  onProgress?: ((update: WebSnapshotSaveProgressUpdate) => void) | undefined;
}): Promise<WebSnapshotBuildResult> {
  throwIfWebSnapshotBuildAborted(args.abortSignal);
  args.onProgress?.({ activeStepKey: 'webSnapshotDom', current: 0, total: 4 });
  const source = resolveCurrentPageSource();
  const preparedSnapshot = await buildPreparedSnapshotDocument({
    contextLabel: 'web-snapshot',
    preserveAssetUrls: true,
  });
  throwIfWebSnapshotBuildAborted(args.abortSignal);
  const snapshotDocument = preparedSnapshot.document;
  args.onProgress?.({
    activeStepKey: 'webSnapshotPreview',
    current: 1,
    total: 4,
  });
  const screenshotResult = await captureRequiredWebSnapshotScreenshot(
    args.contentIntentSource,
    args.fullPageCaptureIdentity,
    args.abortSignal
  );
  args.onProgress?.({
    activeStepKey: 'webSnapshotStyles',
    current: 2,
    total: 4,
  });
  const assetResult = await collectWebSnapshotAssets(snapshotDocument, {
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
    requestId: args.requestId,
    sourceUrl: source.url,
    ...(args.abortSignal === undefined ? {} : { abortSignal: args.abortSignal }),
  });
  throwIfWebSnapshotBuildAborted(args.abortSignal);
  const { assets, privacyWarnings, snapshotSessionId, warnings } = assetResult;
  const warningSummary = createNormalizedWarningSummary({
    networkWarnings: warnings,
    preparedWarnings: preparedSnapshot.warnings,
    privacyWarnings,
    screenshotWarnings: screenshotResult.warnings,
  });
  const html = serializePreparedSnapshotDocument(snapshotDocument);
  throwIfWebSnapshotBuildAborted(args.abortSignal);
  args.onProgress?.({
    activeStepKey: 'webSnapshotAssets',
    current: 3,
    total: 4,
  });
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
  throwIfWebSnapshotBuildAborted(args.abortSignal);
  args.onProgress?.({
    activeStepKey: 'webSnapshotAssets',
    current: 4,
    total: 4,
  });

  return {
    ...packaged,
    snapshotSessionId,
    warnings: warningSummary.warnings,
  };
}

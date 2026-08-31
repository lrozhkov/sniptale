import { collectWebSnapshotAssets, finalizeWebSnapshotDiagnosticAssetLedger } from './assets';
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
import { materializeUnreadableIframeRasters } from './iframe-raster';
import { PreparedSnapshotWarningKind } from '../page-preparation/snapshot';
import { normalizePopupExportTabTitle } from '@sniptale/runtime-contracts/export';
import { normalizePagePackageWarnings } from '@sniptale/runtime-contracts/page-package';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentWebSnapshot' });

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
  return normalizePagePackageWarnings(
    warnings
      .map((warning) => (typeof warning === 'string' ? warning : String(warning ?? '')))
      .map((warning) => warning.trim())
      .filter(Boolean)
  );
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
    title: document.title ? normalizePopupExportTabTitle(document.title) : null,
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
    deviceScaleFactor:
      Number.isFinite(view?.devicePixelRatio) && (view?.devicePixelRatio ?? 0) > 0
        ? view!.devicePixelRatio
        : 1,
    height: Math.round(height),
    width: Math.round(width),
  };
}

async function captureRequiredWebSnapshotScreenshot(
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined,
  captureIdentity?: FullPageExportCaptureIdentity | undefined,
  abortSignal?: AbortSignal | undefined
): Promise<{
  captureGeometry: Awaited<
    ReturnType<typeof captureWebSnapshotScreenshotWithWarnings>
  >['captureGeometry'];
  coverage: Awaited<ReturnType<typeof captureWebSnapshotScreenshotWithWarnings>>['coverage'];
  screenshotBlob: Blob;
  warnings: string[];
}> {
  throwIfWebSnapshotBuildAborted(abortSignal);
  const screenshot = await captureWebSnapshotScreenshotWithWarnings(
    contentIntentSource,
    captureIdentity,
    abortSignal
  );
  throwIfWebSnapshotBuildAborted(abortSignal);
  return {
    captureGeometry: screenshot.captureGeometry,
    coverage: screenshot.coverage,
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
  const startedAt = Date.now();
  logger.log('Web snapshot preparation started');
  throwIfWebSnapshotBuildAborted(args.abortSignal);
  const source = resolveCurrentPageSource();
  args.onProgress?.({
    activeStepKey: 'webSnapshotPreview',
    current: 0,
    total: 4,
  });
  const screenshotResult = await captureRequiredWebSnapshotScreenshot(
    args.contentIntentSource,
    args.fullPageCaptureIdentity,
    args.abortSignal
  );
  logger.log('Web snapshot screenshot received', {
    elapsedMs: Date.now() - startedAt,
    screenshotBytes: screenshotResult.screenshotBlob.size,
  });
  args.onProgress?.({ activeStepKey: 'webSnapshotDom', current: 1, total: 4 });
  const preparedSnapshot = await buildPreparedSnapshotDocument({
    ...(args.abortSignal === undefined ? {} : { abortSignal: args.abortSignal }),
    contextLabel: 'web-snapshot',
    preserveAssetUrls: true,
    serializeHtml: false,
  });
  logger.log('Web snapshot DOM prepared', {
    elapsedMs: Date.now() - startedAt,
    elementCount: preparedSnapshot.document.querySelectorAll('*').length,
  });
  throwIfWebSnapshotBuildAborted(args.abortSignal);
  const snapshotDocument = preparedSnapshot.document;
  args.onProgress?.({
    activeStepKey: 'webSnapshotStyles',
    current: 2,
    total: 4,
  });
  args.onProgress?.({
    activeStepKey: 'webSnapshotAssets',
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
  logger.log('Web snapshot assets collected', {
    assetCount: assetResult.assets.length,
    elapsedMs: Date.now() - startedAt,
    warningCount: assetResult.warnings.length,
  });
  throwIfWebSnapshotBuildAborted(args.abortSignal);
  const { assets, privacyWarnings, snapshotSessionId, warnings } = assetResult;
  const iframeRasters =
    screenshotResult.coverage === 'full-page'
      ? await materializeUnreadableIframeRasters(
          snapshotDocument,
          screenshotResult.screenshotBlob,
          screenshotResult.captureGeometry
        )
      : { assets: [], rasterizedTargets: [] };
  assets.push(...iframeRasters.assets);
  throwIfWebSnapshotBuildAborted(args.abortSignal);
  const rasterizedIframeTargets = new Set(iframeRasters.rasterizedTargets);
  const preparedWarnings = preparedSnapshot.warnings.map((warning) =>
    warning.kind === PreparedSnapshotWarningKind.IframeUnreadable &&
    warning.target &&
    rasterizedIframeTargets.has(warning.target)
      ? {
          ...warning,
          message: `Iframe content was preserved as a static image: ${warning.target}`,
        }
      : warning
  );
  const warningSummary = createNormalizedWarningSummary({
    networkWarnings: warnings,
    preparedWarnings,
    privacyWarnings,
    screenshotWarnings: screenshotResult.warnings,
  });
  const html = serializePreparedSnapshotDocument(snapshotDocument, {
    preferParseStableHtml: true,
  });
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
    screenshotCoverage: screenshotResult.coverage,
    source,
    warnings: warningSummary.warnings,
    warningStats: warningSummary.warningStats,
  });
  logger.log('Web snapshot package prepared', {
    elapsedMs: Date.now() - startedAt,
  });
  throwIfWebSnapshotBuildAborted(args.abortSignal);
  args.onProgress?.({
    activeStepKey: 'webSnapshotAssets',
    current: 4,
    total: 4,
  });

  return {
    ...packaged,
    diagnosticAssetLedger: finalizeWebSnapshotDiagnosticAssetLedger({
      assets,
      manifest: packaged.manifest,
      targets: assetResult.diagnosticAssetTargets,
    }),
    snapshotSessionId,
    warnings: warningSummary.warnings,
  };
}

import { translate } from '../../../../platform/i18n';
import {
  normalizePopupExportTabTitle,
  type ExportOptions,
} from '@sniptale/runtime-contracts/export';
import type { PopupExportRequestHandlerRuntime } from './types';
import type { PopupExportBuildPackageRequest } from '../helpers/request/types';
import { buildExportPagePackage, composeCombinedPagePackage } from '../../../page-package';
import { createPagePackageJobStagedSink } from '../../../page-package/staged-transfer';
import { writePagePackageArchive } from '../../../../workflows/page-package/archive';
import { createBackgroundAutoStartContentActionIntentSource } from '../../../platform/privileged-action-intent/client';
import {
  clearWebSnapshotSaveProgress,
  publishWebSnapshotSaveProgress,
} from '../../web-snapshot/progress';
import type { ComposedPagePackage } from '../../../../workflows/page-package/composer';
import type { PagePackageDiagnosticsLevel } from '@sniptale/runtime-contracts/page-package';
import {
  buildExtendedDiagnosticArtifacts,
  type ExtendedDiagnosticArtifact,
} from '../../export-manager/diagnostics/extended-evidence';
import { hashWebSnapshotAssetBlob } from '../../../../features/web-snapshot/asset-manifest';
import { createLogger } from '@sniptale/platform/observability/logger';
import { sanitizeDiagnosticMessage } from '@sniptale/platform/observability/diagnostics/sanitizer';

const logger = createLogger({ namespace: 'ContentPopupExport' });

type PopupExportBuildPackageSendResponse = (response?: {
  error?: string;
  stagedPagePackage?: {
    jobId: string;
    manifestSha256: string;
    manifestSize: number;
    ordinal: number;
    pageId: string;
    producerStats: import('@sniptale/runtime-contracts/export').ExportResult['stats'];
    snapshotSessionId?: string;
    stagedBlobId: string;
    title: string | null;
    totalBytes: number;
  };
  success?: boolean;
}) => void;

type PopupExportBuildPackageHandlerProps = Pick<
  PopupExportRequestHandlerRuntime,
  'exportRunner' | 'state'
> & {
  request: PopupExportBuildPackageRequest;
  sendResponse: PopupExportBuildPackageSendResponse;
};

type BuiltJobPagePackage = ComposedPagePackage<Blob> & {
  producerStats: import('@sniptale/runtime-contracts/export').ExportResult['stats'];
  snapshotSessionId?: string;
};
type BuiltWebCopyPagePackage = BuiltJobPagePackage & { snapshotSessionId: string };
type PopupExportProducerContext = NonNullable<
  Parameters<PopupExportRequestHandlerRuntime['exportRunner']['buildBlobPackage']>[1]
>;

class PagePackagePreparationError extends Error {
  constructor(
    readonly diagnosticCode: string,
    options?: ErrorOptions
  ) {
    super(`Page Package preparation failed [${diagnosticCode}]`, options);
  }
}

async function runPreparationStage<T>(code: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PagePackagePreparationError) throw error;
    throw new PagePackagePreparationError(code, { cause: error });
  }
}

function getSafePreparationCause(error: unknown): string {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return sanitizeDiagnosticMessage(
    cause instanceof Error ? cause.message : String(cause ?? '')
  ).replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/giu, '$1');
}

function getPreparationFailureMessage(error: unknown): string {
  const code = error instanceof PagePackagePreparationError ? error.diagnosticCode : 'UNCLASSIFIED';
  const detail = getSafePreparationCause(error);
  return [
    `${translate('content.runtime.exportPrepareFailed')} [${code}]`,
    ...(detail ? [detail] : []),
  ].join(': ');
}

function getPreparationFailureDiagnostic(error: unknown): string {
  const code = error instanceof PagePackagePreparationError ? error.diagnosticCode : 'UNCLASSIFIED';
  const causeMessage = getSafePreparationCause(error);
  return causeMessage
    ? `Page Package preparation failed [${code}]: ${causeMessage}`
    : `Page Package preparation failed [${code}]`;
}

function isFullPageCaptureCancellation(error: unknown): boolean {
  return (
    error instanceof PagePackagePreparationError &&
    error.diagnosticCode === 'WEB_COPY_WEBSNAPSHOTPREVIEW' &&
    error.cause instanceof Error &&
    error.cause.message === 'Full-page capture cancelled'
  );
}

function hasStructuredExportSelection(options: ExportOptions): boolean {
  return Boolean(
    options.includeAnnotations ||
    options.includeBasicLogs ||
    options.includeCssDiagnostics ||
    options.includeFiles ||
    options.includeFullPageScreenshot ||
    options.includeImages ||
    options.includeJson ||
    options.includeMarkdown ||
    options.includePageDiagnostics
  );
}

function getRequestedDiagnosticsLevel(
  request: PopupExportBuildPackageRequest
): PagePackageDiagnosticsLevel {
  if (request.options.includePageDiagnostics) return 'extended';
  return request.options.includeBasicLogs ||
    request.options.includeCssDiagnostics ||
    request.options.includePageDiagnostics
    ? 'standard'
    : 'none';
}

async function acquireExtendedDiagnostics(
  level: PagePackageDiagnosticsLevel
): Promise<ExtendedDiagnosticArtifact[] | undefined> {
  if (level !== 'extended') return undefined;
  return buildExtendedDiagnosticArtifacts({
    digestText: (value) =>
      hashWebSnapshotAssetBlob(new Blob([value], { type: 'text/plain;charset=utf-8' })),
  });
}

function addProducerStats(
  left: BuiltJobPagePackage['producerStats'],
  right: BuiltJobPagePackage['producerStats']
): BuiltJobPagePackage['producerStats'] {
  const result = {
    filesCount: left.filesCount + right.filesCount,
    filesFailed: left.filesFailed + right.filesFailed,
    rowsCount: left.rowsCount + right.rowsCount,
    sectionsCount: left.sectionsCount + right.sectionsCount,
  };
  if (!Object.values(result).every(Number.isSafeInteger)) {
    throw new Error('Combined Page Package producer statistics exceed their safe integer limit.');
  }
  return result;
}

function createPopupExportProducerContext(
  request: PopupExportBuildPackageRequest
): PopupExportProducerContext {
  const contentIntentSource = request.contentIntentGrant
    ? createBackgroundAutoStartContentActionIntentSource(request.contentIntentGrant.grantToken)
    : undefined;
  const fullPageCaptureIdentity =
    request.fullPageCaptureAction === undefined
      ? undefined
      : {
          action: request.fullPageCaptureAction,
          exportRunId: request.batchRequestId,
        };
  return {
    ...(contentIntentSource === undefined ? {} : { contentIntentSource }),
    ...(fullPageCaptureIdentity === undefined ? {} : { fullPageCaptureIdentity }),
  };
}

async function buildRetainedWebCopy(
  request: PopupExportBuildPackageRequest,
  controller: AbortController,
  producerContext: PopupExportProducerContext
): Promise<BuiltWebCopyPagePackage> {
  if (
    typeof request.allowAnonymousCrossOriginAssets !== 'boolean' ||
    typeof request.allowAuthenticatedSameOriginAssets !== 'boolean'
  ) {
    throw new Error('Web Snapshot resource policy is unavailable.');
  }
  let activeStep: string = 'START';
  const snapshot = await runPreparationStage('WEB_COPY_START', async () => {
    const { buildCurrentPageWebSnapshot } = await import('../../web-snapshot/service');
    try {
      return await buildCurrentPageWebSnapshot({
        abortSignal: controller.signal,
        allowAnonymousCrossOriginAssets: request.allowAnonymousCrossOriginAssets,
        allowAuthenticatedSameOriginAssets: request.allowAuthenticatedSameOriginAssets,
        ...producerContext,
        onProgress: (update) => {
          activeStep = update.activeStepKey;
          publishWebSnapshotSaveProgress(request.batchRequestId, update);
        },
        requestId: request.batchRequestId,
      });
    } catch (error) {
      throw new PagePackagePreparationError(`WEB_COPY_${activeStep.toUpperCase()}`, {
        cause: error,
      });
    }
  });
  return {
    ...snapshot.pagePackage,
    producerStats: {
      filesCount: snapshot.manifest.stats.entryCount,
      filesFailed: snapshot.manifest.stats.failedResourceCount,
      rowsCount: 0,
      sectionsCount: snapshot.manifest.components.length,
    },
    snapshotSessionId: snapshot.snapshotSessionId,
  };
}

async function composeRequestedWebCopyPackage(
  props: PopupExportBuildPackageHandlerProps,
  webCopy: BuiltWebCopyPagePackage,
  producerContext: PopupExportProducerContext,
  diagnosticsLevel: PagePackageDiagnosticsLevel,
  extendedDiagnosticArtifacts?: readonly ExtendedDiagnosticArtifact[] | undefined
): Promise<BuiltJobPagePackage> {
  const { producerStats, snapshotSessionId, ...pagePackage } = webCopy;
  const structuredOptions = {
    ...props.request.options,
    includeFullPageScreenshot: false,
  };
  if (!hasStructuredExportSelection(structuredOptions)) {
    return {
      ...(await composeCombinedPagePackage({
        artifact: null,
        diagnosticsLevel,
        ...(extendedDiagnosticArtifacts === undefined ? {} : { extendedDiagnosticArtifacts }),
        intent: props.request.intent,
        webCopy: pagePackage,
      })),
      producerStats,
      snapshotSessionId,
    };
  }
  props.exportRunner.onProgress?.((progress) => {
    if (progress.activeStepKey) {
      publishWebSnapshotSaveProgress(props.request.batchRequestId, {
        activeStepKey: progress.activeStepKey,
        current: progress.current,
        total: progress.total,
      });
    }
  });
  const artifact = await runPreparationStage('SELECTED_DATA', () =>
    props.exportRunner.buildBlobPackage(structuredOptions, producerContext)
  );
  return {
    ...(await runPreparationStage('PACKAGE_COMPOSITION', () =>
      composeCombinedPagePackage({
        artifact,
        diagnosticsLevel,
        ...(extendedDiagnosticArtifacts === undefined ? {} : { extendedDiagnosticArtifacts }),
        intent: props.request.intent,
        webCopy: pagePackage,
      })
    )),
    producerStats: addProducerStats(producerStats, artifact.stats),
    snapshotSessionId,
  };
}

function buildExportOnlyPagePackage(
  props: PopupExportBuildPackageHandlerProps,
  producerContext: PopupExportProducerContext,
  diagnosticsLevel: PagePackageDiagnosticsLevel,
  extendedDiagnosticArtifacts?: readonly ExtendedDiagnosticArtifact[] | undefined
): Promise<BuiltJobPagePackage> {
  props.exportRunner.onProgress?.((progress) => {
    if (progress.activeStepKey) {
      publishWebSnapshotSaveProgress(props.request.batchRequestId, {
        activeStepKey: progress.activeStepKey,
        current: progress.current,
        total: progress.total,
      });
    }
  });
  return buildExportPagePackage({
    diagnosticsLevel,
    ...(extendedDiagnosticArtifacts === undefined ? {} : { extendedDiagnosticArtifacts }),
    exportProducer: {
      buildBlobPackage: (options) => props.exportRunner.buildBlobPackage(options, producerContext),
    },
    options: props.request.options,
    source: {
      faviconUrl: document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? null,
      title: document.title ? normalizePopupExportTabTitle(document.title) : null,
      url: location.href || null,
      viewport: {
        deviceScaleFactor: window.devicePixelRatio || 1,
        height: window.innerHeight,
        width: window.innerWidth,
      },
    },
  });
}

async function buildRequestedPagePackage(
  props: PopupExportBuildPackageHandlerProps,
  controller: AbortController
): Promise<BuiltJobPagePackage> {
  const producerContext = createPopupExportProducerContext(props.request);
  const diagnosticsLevel = getRequestedDiagnosticsLevel(props.request);
  const extendedDiagnosticArtifacts = await runPreparationStage('DIAGNOSTICS', () =>
    acquireExtendedDiagnostics(diagnosticsLevel)
  );
  if (!props.request.includeWebCopy) {
    return runPreparationStage('SELECTED_DATA', () =>
      buildExportOnlyPagePackage(
        props,
        producerContext,
        diagnosticsLevel,
        extendedDiagnosticArtifacts
      )
    );
  }
  const webCopy = await buildRetainedWebCopy(props.request, controller, producerContext);
  return composeRequestedWebCopyPackage(
    props,
    webCopy,
    producerContext,
    diagnosticsLevel,
    extendedDiagnosticArtifacts
  );
}

export function handlePopupExportBuildPackageRuntime(
  props: PopupExportBuildPackageHandlerProps
): boolean {
  if (props.state.isExportRunning) {
    props.sendResponse({
      success: false,
      error: translate('content.runtime.exportAlreadyRunning'),
    });
    return true;
  }

  props.state.isExportRunning = true;
  props.state.activeExportRequestId = props.request.batchRequestId;
  const controller = new AbortController();
  props.state.activeAbortController = controller;
  void Promise.resolve()
    .then(async () => {
      const pagePackage = await buildRequestedPagePackage(props, controller);
      const transfer = createPagePackageJobStagedSink({
        jobId: props.request.batchRequestId,
        ordinal: props.request.ordinal,
        signal: controller.signal,
      });
      await runPreparationStage('ARCHIVE_STAGING', () =>
        writePagePackageArchive({
          package: pagePackage,
          signal: controller.signal,
          sink: transfer.sink,
        })
      );
      return {
        jobId: props.request.batchRequestId,
        manifestSha256: pagePackage.manifestSha256,
        manifestSize: pagePackage.manifestBytes.byteLength,
        ordinal: props.request.ordinal,
        pageId: pagePackage.manifest.id,
        producerStats: pagePackage.producerStats,
        ...(pagePackage.snapshotSessionId === undefined || props.request.intent !== 'save'
          ? {}
          : { snapshotSessionId: pagePackage.snapshotSessionId }),
        stagedBlobId: transfer.stagedBlobId,
        title: pagePackage.manifest.source.title,
        totalBytes: pagePackage.manifest.stats.totalBytes + pagePackage.manifestBytes.byteLength,
      };
    })
    .then((stagedPagePackage) => {
      props.sendResponse({
        success: true,
        stagedPagePackage,
      });
    })
    .catch((error: unknown) => {
      const cancelled = controller.signal.aborted || isFullPageCaptureCancellation(error);
      if (cancelled) logger.debug('Page Package preparation cancelled by the user');
      else logger.error(getPreparationFailureDiagnostic(error));
      props.sendResponse({
        success: false,
        error: cancelled
          ? translate('content.runtime.exportCancelled')
          : getPreparationFailureMessage(error),
      });
    })
    .finally(() => {
      clearWebSnapshotSaveProgress(props.request.batchRequestId);
      if (props.state.activeExportRequestId === props.request.batchRequestId) {
        delete props.state.activeAbortController;
        props.state.activeExportRequestId = null;
        props.state.isExportRunning = false;
      }
    });

  return true;
}

import { translate } from '../../../../platform/i18n';
import type {
  ExportPagePackage,
  ExportProgress,
  ExportOptions,
  ExportResult,
} from '@sniptale/runtime-contracts/export';
import type { ContentPrivilegedActionIntentSource } from '../../../platform/privileged-action-intent/client';
import type { FullPageExportCaptureIdentity } from '../../../../contracts/full-page-capture';
import { resolvePageSnapshotSource, type PageSnapshotSource } from '../../page-snapshot/source';
import { getExportErrorMessage } from './runtime';
import { prepareBrowserAnnotationsExportText } from '../../page-preparation/annotations';
import { buildExportArchiveBaseNameFromTitle } from '../files/naming';
import { runExportManagerPackagePipeline, runExportManagerPipeline } from './pipeline';
import {
  beginExportManagerRun,
  cancelExportManagerRun,
  createExportManagerState,
  setExportManagerProgressCallback,
  updateExportManagerProgress,
} from './state';
import {
  createBrowserAnnotationsExportResult,
  createBrowserAnnotationsPagePackage,
  hasOnlyBrowserAnnotations,
} from './annotations';

type ExportManagerRunContext = {
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  fullPageCaptureIdentity?: FullPageExportCaptureIdentity | undefined;
};

interface ExportManagerService {
  buildPackage: (
    options: ExportOptions,
    context?: ExportManagerRunContext
  ) => Promise<ExportPagePackage>;
  cancel: () => void;
  export: (options: ExportOptions, context?: ExportManagerRunContext) => Promise<ExportResult>;
  onProgress: (callback: (progress: ExportProgress) => void) => void;
}

interface ExportManagerServiceDeps {
  prepareAnnotationsText?: () => Promise<string>;
  resolveSnapshotSource?: () => PageSnapshotSource;
  snapshotSource?: PageSnapshotSource | undefined;
}

function resolvePrepareAnnotationsText(deps: ExportManagerServiceDeps): () => Promise<string> {
  return deps.prepareAnnotationsText ?? prepareBrowserAnnotationsExportText;
}

function resolveServiceSnapshotSource(
  deps: ExportManagerServiceDeps
): PageSnapshotSource | undefined {
  return deps.resolveSnapshotSource?.() ?? deps.snapshotSource;
}

function resolveAnnotationsArchiveBaseName(deps: ExportManagerServiceDeps): string {
  const pageSource = resolvePageSnapshotSource(resolveServiceSnapshotSource(deps));
  return buildExportArchiveBaseNameFromTitle(pageSource.pageTitle);
}

function reportServiceFailure(
  state: ReturnType<typeof createExportManagerState>,
  warnings: string[],
  error: unknown
): string {
  const errorMessage = getExportErrorMessage(error, translate('content.runtime.unknownError'));
  warnings.push(errorMessage);

  updateExportManagerProgress(state, {
    phase: 'error',
    message: errorMessage,
    current: 0,
    total: 0,
    errors: warnings,
  });

  return errorMessage;
}

function createExportContentRunner(
  state: ReturnType<typeof createExportManagerState>,
  deps: ExportManagerServiceDeps
) {
  return async function exportContent(
    options: ExportOptions,
    context: ExportManagerRunContext = {}
  ): Promise<ExportResult> {
    beginExportManagerRun(state);
    const warnings: string[] = [];

    try {
      if (hasOnlyBrowserAnnotations(options)) {
        updateExportManagerProgress(state, {
          activeStepKey: 'annotations',
          phase: 'scanning',
          message: translate('content.runtime.prepareAnnotations'),
          current: 0,
          total: 0,
          errors: [],
        });
        const text = await resolvePrepareAnnotationsText(deps)();
        if (state.isCancelled) {
          throw new Error(translate('content.runtime.exportCancelled'));
        }
        const pagePackage = createBrowserAnnotationsPagePackage(
          text,
          resolveAnnotationsArchiveBaseName(deps)
        );
        const result = createBrowserAnnotationsExportResult(pagePackage);
        finishAnnotationsOnlyExport(state);
        return { success: true, ...result, errors: warnings };
      }
      const result = await runExportManagerPipeline(state, options, warnings, {
        contentIntentSource: context.contentIntentSource,
        fullPageCaptureIdentity: context.fullPageCaptureIdentity,
        prepareAnnotationsText: resolvePrepareAnnotationsText(deps),
        snapshotSource: resolveServiceSnapshotSource(deps),
      });
      return { success: true, ...result, errors: warnings };
    } catch (error) {
      reportServiceFailure(state, warnings, error);

      return {
        success: false,
        errors: warnings,
        stats: { sectionsCount: 0, rowsCount: 0, filesCount: 0, filesFailed: 0 },
      };
    }
  };
}

function finishAnnotationsOnlyExport(state: ReturnType<typeof createExportManagerState>): void {
  updateExportManagerProgress(state, {
    activeStepKey: 'annotations',
    phase: 'done',
    message: translate('content.runtime.exportCompleted'),
    current: 1,
    total: 1,
    errors: [],
  });
}

function createBuildPackageRunner(
  state: ReturnType<typeof createExportManagerState>,
  deps: ExportManagerServiceDeps
) {
  return async function buildPackage(
    options: ExportOptions,
    context: ExportManagerRunContext = {}
  ): Promise<ExportPagePackage> {
    beginExportManagerRun(state);
    const warnings: string[] = [];

    try {
      if (hasOnlyBrowserAnnotations(options)) {
        updateExportManagerProgress(state, {
          activeStepKey: 'annotations',
          phase: 'scanning',
          message: translate('content.runtime.prepareAnnotations'),
          current: 0,
          total: 0,
          errors: [],
        });
        const text = await resolvePrepareAnnotationsText(deps)();
        if (state.isCancelled) {
          throw new Error(translate('content.runtime.exportCancelled'));
        }
        const pagePackage = createBrowserAnnotationsPagePackage(
          text,
          resolveAnnotationsArchiveBaseName(deps)
        );
        finishAnnotationsOnlyExport(state);
        return pagePackage;
      }
      const result = await runExportManagerPackagePipeline(state, options, warnings, {
        contentIntentSource: context.contentIntentSource,
        fullPageCaptureIdentity: context.fullPageCaptureIdentity,
        prepareAnnotationsText: resolvePrepareAnnotationsText(deps),
        snapshotSource: resolveServiceSnapshotSource(deps),
      });
      return result.pagePackage;
    } catch (error) {
      const errorMessage = reportServiceFailure(state, warnings, error);
      throw new Error(errorMessage, { cause: error });
    }
  };
}

/**
 * Creates one export-manager service instance with private progress, cancellation, and archive state.
 */
export function createExportManagerService(
  deps: ExportManagerServiceDeps = {}
): ExportManagerService {
  const state = createExportManagerState();

  return {
    buildPackage: createBuildPackageRunner(state, deps),
    cancel: () => {
      cancelExportManagerRun(state);
    },
    export: createExportContentRunner(state, deps),
    onProgress: (callback) => {
      setExportManagerProgressCallback(state, callback);
    },
  };
}

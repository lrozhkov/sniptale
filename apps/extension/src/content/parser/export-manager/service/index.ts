import { translate } from '../../../../platform/i18n';
import type {
  ExportPagePackage,
  ExportProgress,
  ExportOptions,
  ExportResult,
} from '@sniptale/runtime-contracts/export';
import type { ContentPrivilegedActionIntentSource } from '../../../platform/privileged-action-intent/client';
import type { PageSnapshotSource } from '../../page-snapshot/source';
import { getExportErrorMessage } from './runtime';
import { runExportManagerPackagePipeline, runExportManagerPipeline } from './pipeline';
import {
  beginExportManagerRun,
  cancelExportManagerRun,
  createExportManagerState,
  setExportManagerProgressCallback,
  updateExportManagerProgress,
} from './state';

type ExportManagerRunContext = {
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
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
  resolveSnapshotSource?: () => PageSnapshotSource;
  snapshotSource?: PageSnapshotSource | undefined;
}

function resolveServiceSnapshotSource(
  deps: ExportManagerServiceDeps
): PageSnapshotSource | undefined {
  return deps.resolveSnapshotSource?.() ?? deps.snapshotSource;
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
      const result = await runExportManagerPipeline(state, options, warnings, {
        contentIntentSource: context.contentIntentSource,
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
      const result = await runExportManagerPackagePipeline(state, options, warnings, {
        contentIntentSource: context.contentIntentSource,
        snapshotSource: resolveServiceSnapshotSource(deps),
      });
      return result.pagePackage;
    } catch (error) {
      const errorMessage = reportServiceFailure(state, warnings, error);
      throw new Error(errorMessage);
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

import type { PopupExportRuntimeMessage, PopupExportRuntimeContract } from '../types';
import type { PagePackageJobStatusV1 } from '@sniptale/runtime-contracts/page-package';
import type { PopupPagePackageSelection } from '../../../../../composition/persistence/popup-export-preferences';
import { getPopupExportErrorMessage } from '../preview-request';
import type { AppLocale } from '../../../../../platform/i18n/popup';

function normalizeJobErrors(errors: readonly string[], locale?: AppLocale): string[] {
  if (errors.length === 0) return [];
  return [getPopupExportErrorMessage(errors[0], 'popup.export.prepareExportError', locale)];
}

function selectionFromEffectivePlan(status: PagePackageJobStatusV1): PopupPagePackageSelection {
  const { components } = status.effectiveComponentPlan;
  const options = status.effectiveOptions;
  return {
    includeAnnotations: options.includeAnnotations === true && components.pageData,
    includeBasicLogs: options.includeBasicLogs && components.diagnostics,
    includeCssDiagnostics: options.includeCssDiagnostics && components.diagnostics,
    includeFiles: options.includeFiles && components.attachments,
    includeFullPageScreenshot: status.effectiveComponentPlan.includeScreenshot,
    includeViewportScreenshot: options.includeViewportScreenshot === true,
    includePageDiagnostics: options.includePageDiagnostics && components.diagnostics,
    includeImages: options.includeImages && components.images,
    includeJson: options.includeJson && components.pageData,
    includeMarkdown: options.includeMarkdown && components.pageData,
    includeWebCopy: components.webCopy,
  };
}

type PopupExportMessageListenerApplyArgs = {
  message: Pick<PopupExportRuntimeMessage, 'status' | 'type'> &
    Partial<Pick<PopupExportRuntimeMessage, 'locale'>>;
  requestId: string | null;
  setProgress: PopupExportRuntimeContract['setProgress'];
  setResult: PopupExportRuntimeContract['setResult'];
  setLaunchedPlan?: PopupExportRuntimeContract['setLaunchedPlan'];
  clearRequestId: () => void;
  setRequestId?: (requestId: string) => void;
  latestStatus: { jobId: string; revision: number } | null;
  setLatestStatus: (status: { jobId: string; revision: number }) => void;
};

export function applyPopupExportRuntimeMessage(args: PopupExportMessageListenerApplyArgs): boolean {
  const { status } = args.message;
  if (args.requestId !== null && status.jobId !== args.requestId) return false;
  if (args.latestStatus?.jobId === status.jobId && status.revision <= args.latestStatus.revision) {
    return false;
  }
  args.setLatestStatus({ jobId: status.jobId, revision: status.revision });
  args.setRequestId?.(status.jobId);
  args.setLaunchedPlan?.(selectionFromEffectivePlan(status));
  const normalizedProgressErrors = normalizeJobErrors(status.progress.errors, args.message.locale);
  const normalizedErrorMessage =
    status.progress.phase === 'error'
      ? (normalizedProgressErrors[0] ??
        normalizeJobErrors([status.progress.message], args.message.locale)[0])
      : status.progress.message;
  args.setProgress({
    ...status.progress,
    activeStepKey: status.progress.activeStepKey ?? null,
    errors: [...new Set([...normalizedProgressErrors, ...status.warnings])],
    message: normalizedErrorMessage ?? '',
  });
  if (status.result) {
    args.setResult({
      ...status.result,
      errors: normalizeJobErrors(status.result.errors, args.message.locale),
    });
  }
  if (
    status.phase === 'cancelled' ||
    status.phase === 'completed' ||
    status.phase === 'failed' ||
    status.phase === 'interrupted'
  ) {
    args.clearRequestId();
  }
  return true;
}

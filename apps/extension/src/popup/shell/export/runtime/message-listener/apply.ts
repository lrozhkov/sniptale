import type { PopupExportRuntimeMessage, PopupExportRuntimeContract } from '../types';
import type { PagePackageJobStatusV1 } from '@sniptale/runtime-contracts/page-package';
import type { PopupPagePackageSelection } from '../../../../../composition/persistence/popup-export-preferences';

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
  args.setProgress({
    ...status.progress,
    activeStepKey: status.progress.activeStepKey ?? null,
    errors: [...new Set([...status.progress.errors, ...status.warnings])],
    message: status.progress.message,
  });
  if (status.result) args.setResult(status.result);
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

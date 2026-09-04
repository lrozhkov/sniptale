import { expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { applyPopupExportRuntimeMessage, parsePopupExportRuntimeMessage } from './message-listener';

const status = {
  activatedTabIds: [7],
  effectiveComponentPlan: {
    components: {
      attachments: false,
      diagnostics: false,
      images: false,
      pageData: true,
      webCopy: true,
    },
    diagnosticsLevel: 'none' as const,
    includeScreenshot: true,
  },
  effectiveOptions: {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: true,
    includePageDiagnostics: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  },
  intent: 'save' as const,
  jobId: 'job-1',
  orderedTabs: [{ tabId: 7, title: 'Page' }],
  originalActiveTabs: [{ tabId: 6, windowId: 1 }],
  pageOutcomes: [{ ordinal: 0, status: 'pending' as const, tabId: 7 }],
  phase: 'running' as const,
  progress: {
    current: 1,
    errors: [],
    message: 'Capturing',
    phase: 'scanning' as const,
    total: 2,
  },
  revision: 2,
  warnings: ['warning'],
};

it('parses only revisioned popup-export job status updates', () => {
  const message = {
    locale: 'en' as const,
    status,
    type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED,
  };
  expect(parsePopupExportRuntimeMessage(message)).toEqual(message);
  expect(
    parsePopupExportRuntimeMessage({
      type: MessageType.ENABLE_SCREENSHOT_MODE,
    })
  ).toBeNull();
});

it('ignores producer ingress progress and waits for the revisioned job status', () => {
  const message = {
    activeStepKey: 'webSnapshotPreview' as const,
    current: 2,
    requestId: 'job-1',
    total: 7,
    type: MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED,
  };

  expect(parsePopupExportRuntimeMessage(message)).toBeNull();
});

it('applies a matching job status and merges warnings into progress errors', () => {
  const setProgress = vi.fn();
  const setResult = vi.fn();
  const setLatestStatus = vi.fn();
  const setLaunchedPlan = vi.fn();

  expect(
    applyPopupExportRuntimeMessage({
      clearRequestId: vi.fn(),
      message: { status, type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED },
      requestId: 'job-1',
      latestStatus: null,
      setLatestStatus,
      setLaunchedPlan,
      setProgress,
      setResult,
    })
  ).toBe(true);
  expect(setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      errors: ['warning'],
    })
  );
  expect(setLatestStatus).toHaveBeenCalledWith({ jobId: 'job-1', revision: 2 });
  expect(setLaunchedPlan).toHaveBeenCalledWith({
    includeAnnotations: false,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: true,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
    includePageDiagnostics: false,
    includeViewportScreenshot: false,
    includeWebCopy: true,
  });
});

it('shows cancellation admission without treating it as terminal', () => {
  const clearRequestId = vi.fn();
  const setProgress = vi.fn();
  const cancellingStatus = {
    ...status,
    phase: 'cancelling' as const,
    progress: { ...status.progress, message: 'Stopping collection...' },
    revision: 3,
  };

  expect(
    applyPopupExportRuntimeMessage({
      clearRequestId,
      message: {
        status: cancellingStatus,
        type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED,
      },
      requestId: 'job-1',
      latestStatus: null,
      setLatestStatus: vi.fn(),
      setProgress,
      setResult: vi.fn(),
    })
  ).toBe(true);

  expect(setProgress).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Stopping collection...' })
  );
  expect(clearRequestId).not.toHaveBeenCalled();
});

it('starts a restarted job from its own progress instead of the cancelled job state', () => {
  const setProgress = vi.fn();
  const restartedStatus = {
    ...status,
    jobId: 'job-2',
    progress: {
      activeStepKey: 'webSnapshotPreview' as const,
      current: 0,
      errors: [],
      message: 'Restarted',
      phase: 'scanning' as const,
      total: 4,
    },
    revision: 1,
  };

  expect(
    applyPopupExportRuntimeMessage({
      clearRequestId: vi.fn(),
      latestStatus: { jobId: 'job-1', revision: 9 },
      message: {
        status: restartedStatus,
        type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED,
      },
      requestId: null,
      setLatestStatus: vi.fn(),
      setProgress,
      setResult: vi.fn(),
    })
  ).toBe(true);

  expect(setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      ...restartedStatus.progress,
      errors: ['warning'],
    })
  );
});

it('ignores status updates for another active job', () => {
  expect(
    applyPopupExportRuntimeMessage({
      clearRequestId: vi.fn(),
      latestStatus: null,
      message: { status, type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED },
      requestId: 'job-2',
      setLatestStatus: vi.fn(),
      setProgress: vi.fn(),
      setResult: vi.fn(),
    })
  ).toBe(false);
});

it('rejects stale and duplicate revisions for the same job', () => {
  const setProgress = vi.fn();

  expect(
    applyPopupExportRuntimeMessage({
      clearRequestId: vi.fn(),
      latestStatus: { jobId: 'job-1', revision: 3 },
      message: { status, type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED },
      requestId: 'job-1',
      setLatestStatus: vi.fn(),
      setProgress,
      setResult: vi.fn(),
    })
  ).toBe(false);
  expect(setProgress).not.toHaveBeenCalled();
});

it.each(['cancelled', 'completed', 'failed', 'interrupted'] as const)(
  'clears the active request for a %s job and applies its result',
  (phase) => {
    const clearRequestId = vi.fn();
    const setRequestId = vi.fn();
    const setResult = vi.fn();
    const result = {
      errors: [],
      stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
      success: phase === 'completed',
    };
    const terminalStatus = { ...status, phase, result, revision: 3 };

    expect(
      applyPopupExportRuntimeMessage({
        clearRequestId,
        latestStatus: null,
        message: {
          status: terminalStatus,
          type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED,
        },
        requestId: null,
        setLatestStatus: vi.fn(),
        setProgress: vi.fn(),
        setRequestId,
        setResult,
      })
    ).toBe(true);
    expect(setRequestId).toHaveBeenCalledWith('job-1');
    expect(setResult).toHaveBeenCalledWith(result);
    expect(clearRequestId).toHaveBeenCalledOnce();
  }
);

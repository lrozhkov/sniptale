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
  const message = { status, type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED };
  expect(parsePopupExportRuntimeMessage(message)).toEqual(message);
  expect(
    parsePopupExportRuntimeMessage({
      type: MessageType.ENABLE_SCREENSHOT_MODE,
    })
  ).toBeNull();
});

it('applies only matching live web snapshot progress', () => {
  const setProgress = vi.fn();
  const message = {
    activeStepKey: 'webSnapshotPreview' as const,
    current: 2,
    requestId: 'job-1',
    total: 7,
    type: MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED,
  };

  expect(parsePopupExportRuntimeMessage(message)).toEqual(message);
  expect(
    applyPopupExportRuntimeMessage({
      clearRequestId: vi.fn(),
      latestStatus: null,
      message,
      requestId: 'job-1',
      setLatestStatus: vi.fn(),
      setProgress,
      setResult: vi.fn(),
    })
  ).toBe(true);
  expect(setProgress).toHaveBeenCalledWith({
    activeStepKey: 'webSnapshotPreview',
    current: 2,
    errors: [],
    message: 'Полноразмерный скриншот',
    phase: 'scanning',
    total: 7,
  });

  expect(
    applyPopupExportRuntimeMessage({
      clearRequestId: vi.fn(),
      latestStatus: null,
      message,
      requestId: 'job-2',
      setLatestStatus: vi.fn(),
      setProgress,
      setResult: vi.fn(),
    })
  ).toBe(false);
});

it('applies a matching job status and merges warnings into progress errors', () => {
  const setProgress = vi.fn();
  const setResult = vi.fn();
  const setLatestStatus = vi.fn();

  expect(
    applyPopupExportRuntimeMessage({
      clearRequestId: vi.fn(),
      message: { status, type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED },
      requestId: 'job-1',
      latestStatus: null,
      setLatestStatus,
      setProgress,
      setResult,
    })
  ).toBe(true);
  expect(setProgress).toHaveBeenCalledWith(expect.objectContaining({ errors: ['warning'] }));
  expect(setLatestStatus).toHaveBeenCalledWith({ jobId: 'job-1', revision: 2 });
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

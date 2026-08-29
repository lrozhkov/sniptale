import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cleanupLibrary: vi.fn(),
  release: vi.fn(),
  cleanupTemporaryTabs: vi.fn(),
}));

vi.mock('./download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./download')>()),
  releaseCollectedPagePackages: mocks.release,
}));
vi.mock('./library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./library')>()),
  cleanupRecordedPagePackageLibraryAssets: mocks.cleanupLibrary,
}));
vi.mock('./source-tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./source-tabs')>()),
  cleanupTemporaryPagePackageTabs: mocks.cleanupTemporaryTabs,
}));

import {
  cancelPagePackageJobCaptureAuthorities,
  cleanupPopupExportJobCancellation,
} from './cancellation';
import type { ActivePopupExportJob } from './runtime-state';

function job(): ActivePopupExportJob {
  return {
    abortController: new AbortController(),
    affectedWindowIds: new Set(),
    cancelled: true,
    cancellationCleanupComplete: false,
    cancellationCleanupError: null,
    cancellationQueue: Promise.resolve(),
    completion: null,
    contentPort: { cancelPagePackage: vi.fn(), requestPagePackage: vi.fn() },
    expectedActivation: null,
    finishCancellation: null,
    lastActivatedByWindow: new Map(),
    manualActivationConflict: false,
    publicationQueue: Promise.resolve(),
    status: {
      activatedTabIds: [],
      effectiveComponentPlan: {
        components: {
          attachments: false,
          diagnostics: true,
          images: false,
          pageData: false,
          webCopy: true,
        },
        diagnosticsLevel: 'standard',
        includeScreenshot: true,
      },
      effectiveOptions: {
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: false,
        includeFullPageScreenshot: true,
        includeImages: false,
        includeJson: false,
        includeMarkdown: false,
        includePageDiagnostics: false,
      },
      intent: 'save',
      jobId: 'job-1',
      orderedTabs: [{ tabId: 7, title: 'Page' }],
      originalActiveTabs: [],
      pageOutcomes: [{ ordinal: 0, status: 'pending', tabId: 7 }],
      phase: 'cancelling',
      progress: { current: 0, errors: [], message: '', phase: 'error', total: 1 },
      revision: 2,
      warnings: [],
    },
    unsubscribeActivation: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cleanupLibrary.mockResolvedValue(undefined);
  mocks.cleanupTemporaryTabs.mockResolvedValue(undefined);
  mocks.release.mockResolvedValue(undefined);
});

it('keeps failed job-staging cleanup retryable and completes only after a verified retry', async () => {
  const active = job();
  mocks.release.mockRejectedValueOnce(new Error('OPFS cleanup unavailable'));

  await expect(cleanupPopupExportJobCancellation(active)).rejects.toThrow(
    'OPFS cleanup unavailable'
  );
  expect(active.cancellationCleanupComplete).toBe(false);
  expect(active.cancellationCleanupError).toBeInstanceOf(Error);

  await cleanupPopupExportJobCancellation(active);

  expect(mocks.release).toHaveBeenCalledTimes(2);
  expect(active.contentPort.cancelPagePackage).toHaveBeenCalledTimes(2);
  expect(active.cancellationCleanupComplete).toBe(true);
  expect(active.cancellationCleanupError).toBeNull();
});

it('revokes capture eagerly without clearing Library reservation before publication settles', async () => {
  const active = job();

  await cancelPagePackageJobCaptureAuthorities(active);

  expect(active.contentPort.cancelPagePackage).toHaveBeenCalledOnce();
  expect(mocks.cleanupLibrary).not.toHaveBeenCalled();
  expect(mocks.release).not.toHaveBeenCalled();
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureFullPageMock,
  captureFullPageTransactionMock,
  captureVisibleTabForCropMock,
  captureVisibleTabForCropTransactionMock,
  captureVisibleTabMock,
  captureVisibleTabTransactionMock,
  downloadFullPageCaptureMock,
  downloadVisibleCaptureMock,
  transitionCaptureJobMock,
} = vi.hoisted(() => ({
  captureFullPageMock: vi.fn(),
  captureFullPageTransactionMock: vi.fn(),
  captureVisibleTabForCropMock: vi.fn(),
  captureVisibleTabForCropTransactionMock: vi.fn(),
  captureVisibleTabMock: vi.fn(),
  captureVisibleTabTransactionMock: vi.fn(),
  downloadFullPageCaptureMock: vi.fn(),
  downloadVisibleCaptureMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
}));

vi.mock('./full-page/workflow', () => ({
  captureFullPage: captureFullPageMock,
  captureFullPageTransaction: captureFullPageTransactionMock,
}));

vi.mock('./download/flow', () => ({
  downloadFullPageCapture: downloadFullPageCaptureMock,
  downloadVisibleCapture: downloadVisibleCaptureMock,
}));

vi.mock('./jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./jobs/state-machine')>()),
  transitionCaptureJob: transitionCaptureJobMock,
}));

vi.mock('./visible/flow', () => ({
  captureVisibleTab: captureVisibleTabMock,
  captureVisibleTabForCrop: captureVisibleTabForCropMock,
  captureVisibleTabForCropTransaction: captureVisibleTabForCropTransactionMock,
  captureVisibleTabTransaction: captureVisibleTabTransactionMock,
}));

import {
  captureAndDownloadFullPage,
  captureAndDownloadVisible,
  captureFullPage,
  captureFullPageForArchive,
  captureVisibleTab,
  captureVisibleTabForCrop,
  captureVisibleTabForCropTransaction,
  captureVisibleTabTransaction,
} from './index';
import { cancelFullPageCaptureByExportRunId } from './full-page/cancellation';

function resetCaptureModuleMocks() {
  vi.clearAllMocks();
}

async function verifiesVisibleCaptureDownloadFlow() {
  captureVisibleTabTransactionMock.mockResolvedValueOnce({
    dataUrl: 'data:image/png;base64,visible',
    jobId: 'capture-job-visible',
  });
  downloadVisibleCaptureMock.mockResolvedValueOnce(undefined);

  await captureAndDownloadVisible(5);

  expect(captureVisibleTabTransactionMock).toHaveBeenCalledWith(5);
  expect(downloadVisibleCaptureMock).toHaveBeenCalledWith(
    'data:image/png;base64,visible',
    'capture-job-visible'
  );
}

async function verifiesFullPageCaptureDownloadFlow() {
  const onProgress = vi.fn();

  captureFullPageTransactionMock.mockResolvedValueOnce({
    dataUrl: 'data:image/png;base64,full',
    jobId: 'capture-job-1',
  });
  downloadFullPageCaptureMock.mockResolvedValueOnce(undefined);

  await captureAndDownloadFullPage(7, 'document-7', onProgress);

  expect(captureFullPageTransactionMock).toHaveBeenCalledWith(7, onProgress, {
    backendKind: 'native',
    documentId: 'document-7',
  });
  expect(downloadFullPageCaptureMock).toHaveBeenCalledWith(
    'data:image/png;base64,full',
    'capture-job-1'
  );
}

async function verifiesArchiveCaptureOptions() {
  const transaction = {
    dataUrl: 'data:image/png;base64,archive',
    jobId: 'capture-job-archive',
    metadata: { downscaled: false, frozenExtentWarning: false },
  };
  captureFullPageTransactionMock.mockResolvedValueOnce(transaction);

  await expect(
    captureFullPageForArchive(11, { backendKind: 'native', documentId: 'document-11' })
  ).resolves.toBe(transaction);
  expect(captureFullPageTransactionMock).toHaveBeenCalledWith(11, undefined, {
    backendKind: 'native',
    documentId: 'document-11',
    format: 'png',
    quality: 1,
  });
  expect(transitionCaptureJobMock).toHaveBeenCalledWith('capture-job-archive', 'completed');
}

async function verifiesArchiveCancellationDuringCompletedTransition() {
  let resolveCompleted: () => void = () => undefined;
  captureFullPageTransactionMock.mockResolvedValueOnce({
    dataUrl: 'data:image/png;base64,archive-cancelled',
    jobId: 'capture-job-archive-cancelled',
    metadata: { downscaled: false, frozenExtentWarning: false },
  });
  transitionCaptureJobMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolveCompleted = resolve;
      })
  );

  const capture = captureFullPageForArchive(12, {
    backendKind: 'unattended-cdp',
    documentId: 'document-12',
    exportRunId: 'archive-completed-cancelled',
  });
  await vi.waitFor(() => expect(transitionCaptureJobMock).toHaveBeenCalled());
  expect(cancelFullPageCaptureByExportRunId('archive-completed-cancelled')).toBe(true);
  resolveCompleted();

  await expect(capture).rejects.toThrow('Full-page capture cancelled');
  expect(captureFullPageTransactionMock).toHaveBeenCalledWith(
    12,
    undefined,
    expect.objectContaining({ abortSignal: expect.any(AbortSignal) })
  );
}

function verifiesReExports() {
  expect(captureVisibleTab).toBe(captureVisibleTabMock);
  expect(captureVisibleTabForCrop).toBe(captureVisibleTabForCropMock);
  expect(captureVisibleTabForCropTransaction).toBe(captureVisibleTabForCropTransactionMock);
  expect(captureVisibleTabTransaction).toBe(captureVisibleTabTransactionMock);
  expect(captureFullPage).toBe(captureFullPageMock);
}

describe('capture facade', () => {
  beforeEach(resetCaptureModuleMocks);

  it(
    'downloads a visible capture after capturing the active tab',
    verifiesVisibleCaptureDownloadFlow
  );
  it(
    'downloads a full-page capture after the capture completes',
    verifiesFullPageCaptureDownloadFlow
  );
  it(
    'requests archive full-page capture with deterministic png options',
    verifiesArchiveCaptureOptions
  );
  it(
    'retains archive cancellation through the completed transition',
    verifiesArchiveCancellationDuringCompletedTransition
  );
  it('re-exports capture primitives without wrapping them', verifiesReExports);
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureFullPageMock,
  captureFullPageTransactionMock,
  captureViewportWithClipMock,
  captureViewportWithClipTransactionMock,
  captureVisibleTabForCropMock,
  captureVisibleTabForCropTransactionMock,
  captureVisibleTabMock,
  captureVisibleTabTransactionMock,
  downloadFullPageCaptureMock,
  downloadVisibleCaptureMock,
} = vi.hoisted(() => ({
  captureFullPageMock: vi.fn(),
  captureFullPageTransactionMock: vi.fn(),
  captureViewportWithClipMock: vi.fn(),
  captureViewportWithClipTransactionMock: vi.fn(),
  captureVisibleTabForCropMock: vi.fn(),
  captureVisibleTabForCropTransactionMock: vi.fn(),
  captureVisibleTabMock: vi.fn(),
  captureVisibleTabTransactionMock: vi.fn(),
  downloadFullPageCaptureMock: vi.fn(),
  downloadVisibleCaptureMock: vi.fn(),
}));

vi.mock('./full-page/index', () => ({
  captureFullPage: captureFullPageMock,
  captureFullPageTransaction: captureFullPageTransactionMock,
}));

vi.mock('./download/flow', () => ({
  downloadFullPageCapture: downloadFullPageCaptureMock,
  downloadVisibleCapture: downloadVisibleCaptureMock,
}));

vi.mock('./visible/flow', () => ({
  captureViewportWithClip: captureViewportWithClipMock,
  captureViewportWithClipTransaction: captureViewportWithClipTransactionMock,
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
  captureViewportWithClip,
  captureViewportWithClipTransaction,
  captureVisibleTab,
  captureVisibleTabForCrop,
  captureVisibleTabForCropTransaction,
  captureVisibleTabTransaction,
} from './index';

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

  await captureAndDownloadFullPage(7, onProgress);

  expect(captureFullPageTransactionMock).toHaveBeenCalledWith(7, onProgress);
  expect(downloadFullPageCaptureMock).toHaveBeenCalledWith(
    'data:image/png;base64,full',
    'capture-job-1'
  );
}

async function verifiesArchiveCaptureOptions() {
  captureFullPageMock.mockResolvedValueOnce('data:image/png;base64,archive');

  await expect(captureFullPageForArchive(11)).resolves.toBe('data:image/png;base64,archive');
  expect(captureFullPageMock).toHaveBeenCalledWith(11, undefined, {
    format: 'png',
    quality: 1,
  });
}

function verifiesReExports() {
  expect(captureVisibleTab).toBe(captureVisibleTabMock);
  expect(captureVisibleTabForCrop).toBe(captureVisibleTabForCropMock);
  expect(captureVisibleTabForCropTransaction).toBe(captureVisibleTabForCropTransactionMock);
  expect(captureVisibleTabTransaction).toBe(captureVisibleTabTransactionMock);
  expect(captureViewportWithClip).toBe(captureViewportWithClipMock);
  expect(captureViewportWithClipTransaction).toBe(captureViewportWithClipTransactionMock);
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
  it('re-exports capture primitives without wrapping them', verifiesReExports);
});

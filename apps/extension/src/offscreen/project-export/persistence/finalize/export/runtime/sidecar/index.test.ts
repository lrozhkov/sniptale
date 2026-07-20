import { beforeEach, expect, it, vi } from 'vitest';

import { downloadExportSidecar } from './index';

const { requestSidecarDownloadMock } = vi.hoisted(() => ({
  requestSidecarDownloadMock: vi.fn(),
}));

vi.mock('./request', () => ({
  requestSidecarDownload: requestSidecarDownloadMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('requests the sidecar download with bounded text content', async () => {
  downloadExportSidecar(new Blob(['WEBVTT'], { type: 'text/vtt;charset=utf-8' }), 'export.vtt');

  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(requestSidecarDownloadMock).toHaveBeenCalledWith({
    content: 'WEBVTT',
    filename: 'export.vtt',
    mimeType: 'text/vtt',
  });
});

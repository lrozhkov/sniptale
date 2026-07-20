import { beforeEach, describe, expect, it, vi } from 'vitest';

const { downloadImageInServiceWorkerMock, generateFilenameMock, loadSettingsMock } = vi.hoisted(
  () => ({
    downloadImageInServiceWorkerMock: vi.fn(),
    generateFilenameMock: vi.fn(),
    loadSettingsMock: vi.fn(),
  })
);

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('@sniptale/foundation/utils/filename', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/utils/filename')>()),
  generateFilename: generateFilenameMock,
}));

vi.mock('./index', () => ({
  blobToDataURL: vi.fn(),
  downloadImageInServiceWorker: downloadImageInServiceWorkerMock,
  loadImage: vi.fn(),
}));

import { downloadFullPageCapture, downloadVisibleCapture } from './flow';

describe('capture-download-flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads visible captures with a visible-mode filename and capture job binding', async () => {
    loadSettingsMock.mockResolvedValue({ imageFormat: 'png' });
    generateFilenameMock.mockReturnValue('visible.png');
    downloadImageInServiceWorkerMock.mockResolvedValue(undefined);

    await downloadVisibleCapture('data:image/png;base64,visible', 'capture-job-visible');

    expect(loadSettingsMock).toHaveBeenCalledOnce();
    expect(generateFilenameMock).toHaveBeenCalledWith('visible', 'png');
    expect(downloadImageInServiceWorkerMock).toHaveBeenCalledWith(
      'data:image/png;base64,visible',
      'visible.png',
      'capture-job-visible'
    );
  });

  it('downloads full page captures with a full-mode filename', async () => {
    loadSettingsMock.mockResolvedValue({ imageFormat: 'jpeg' });
    generateFilenameMock.mockReturnValue('full.jpeg');
    downloadImageInServiceWorkerMock.mockResolvedValue(undefined);

    await downloadFullPageCapture('data:image/jpeg;base64,full', 'capture-job-1');

    expect(generateFilenameMock).toHaveBeenCalledWith('full', 'jpeg');
    expect(downloadImageInServiceWorkerMock).toHaveBeenCalledWith(
      'data:image/jpeg;base64,full',
      'full.jpeg',
      'capture-job-1'
    );
  });
});

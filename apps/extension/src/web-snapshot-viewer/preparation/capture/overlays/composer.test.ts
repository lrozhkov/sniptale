// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';

const mocks = vi.hoisted(() => ({
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,composited'),
  dataUrlToBlob: vi.fn(async () => new Blob(['base'], { type: 'image/png' })),
  rasterize: vi.fn(async () => ({
    blob: new Blob(['output'], { type: 'image/png' }),
    metadata: { downscaled: false, outputHeight: 100, outputScale: 2, outputWidth: 200 },
  })),
  showToast: vi.fn(),
}));

vi.mock('../../../../composition/frame-annotation-raster-client', () => ({
  rasterizeFrameAnnotations: mocks.rasterize,
}));
vi.mock('../../../../platform/media-utils/data-url', () => ({
  blobToDataUrl: mocks.blobToDataUrl,
  dataUrlToBlob: mocks.dataUrlToBlob,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: mocks.showToast }));

import { composeViewerCaptureOverlays } from './composer';

class DataUrlImage {
  naturalHeight = 100;
  naturalWidth = 200;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  set src(_value: string) {
    this.onload?.();
  }
}

function createIframe() {
  const iframe = document.createElement('iframe');
  iframe.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    value: { scrollX: 7, scrollY: 11 },
  });
  return iframe;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Image', DataUrlImage);
  vi.stubGlobal('devicePixelRatio', 2);
});

it('projects viewer coordinates into the shared DOM raster client at capture DPR', async () => {
  const frame: FrameData = { id: 'frame-1', x: 45, y: 70, width: 40, height: 24 };
  await expect(
    composeViewerCaptureOverlays({
      baseDataUrl: 'data:image/png;base64,base',
      frames: [frame],
      iframe: createIframe(),
      mode: 'full',
    })
  ).resolves.toBe('data:image/png;base64,composited');
  expect(mocks.rasterize).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        height: 50,
        requestedHeight: 100,
        requestedWidth: 200,
        snapshots: [
          expect.objectContaining({ id: 'frame-1', ordering: 0, version: 1, x: 42, y: 61 }),
        ],
        width: 100,
      }),
    })
  );
});

it('returns the base image without staging when there are no frames', async () => {
  await expect(
    composeViewerCaptureOverlays({
      baseDataUrl: 'data:image/png;base64,base',
      frames: [],
      iframe: createIframe(),
      mode: 'visible',
    })
  ).resolves.toBe('data:image/png;base64,base');
  expect(mocks.rasterize).not.toHaveBeenCalled();
});

it('warns when the overlay raster is saved at an optimized size', async () => {
  mocks.rasterize.mockResolvedValueOnce({
    blob: new Blob(['output'], { type: 'image/png' }),
    metadata: { downscaled: true, outputHeight: 50, outputScale: 1, outputWidth: 100 },
  });
  await composeViewerCaptureOverlays({
    baseDataUrl: 'data:image/png;base64,base',
    frames: [{ id: 'frame-1', x: 0, y: 0, width: 10, height: 10 }],
    iframe: createIframe(),
    mode: 'visible',
  });
  expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), 'warning');
});

it('does not warn about optimized size when final data conversion fails', async () => {
  mocks.rasterize.mockResolvedValueOnce({
    blob: new Blob(['output'], { type: 'image/png' }),
    metadata: { downscaled: true, outputHeight: 50, outputScale: 1, outputWidth: 100 },
  });
  mocks.blobToDataUrl.mockRejectedValueOnce(new Error('conversion failed'));

  await expect(
    composeViewerCaptureOverlays({
      baseDataUrl: 'data:image/png;base64,base',
      frames: [{ id: 'frame-1', x: 0, y: 0, width: 10, height: 10 }],
      iframe: createIframe(),
      mode: 'visible',
    })
  ).rejects.toThrow('conversion failed');
  expect(mocks.showToast).not.toHaveBeenCalled();
});

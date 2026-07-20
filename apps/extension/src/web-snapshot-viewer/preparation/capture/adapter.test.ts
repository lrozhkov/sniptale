// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  composeViewerCaptureOverlays: vi.fn(),
  cropImage: vi.fn(),
  renderViewerFrameToDataUrl: vi.fn(),
  requestViewerSelectionArea: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/media/image-crop', () => ({
  cropImage: mocks.cropImage,
}));
vi.mock('./overlays', () => ({
  composeViewerCaptureOverlays: mocks.composeViewerCaptureOverlays,
}));
vi.mock('./render', () => ({
  renderViewerFrameToDataUrl: mocks.renderViewerFrameToDataUrl,
  resolveViewerCaptureMetrics: vi.fn(),
}));
vi.mock('./selection', () => ({
  requestViewerSelectionArea: mocks.requestViewerSelectionArea,
}));

import { createViewerScreenshotCaptureAdapter } from './adapter';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.composeViewerCaptureOverlays.mockImplementation(({ baseDataUrl }) => baseDataUrl);
  mocks.cropImage.mockResolvedValue('data:image/png;base64,cropped');
  mocks.renderViewerFrameToDataUrl.mockResolvedValue('data:image/png;base64,frame');
  mocks.requestViewerSelectionArea.mockResolvedValue({ height: 40, width: 60, x: 10, y: 20 });
});

function createReadyIframe(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  iframe.contentDocument?.body.appendChild(iframe.contentDocument.createElement('main'));
  return iframe;
}

it('captures visible and full data URLs from the viewer iframe renderer', async () => {
  const iframe = createReadyIframe();
  const adapter = createViewerScreenshotCaptureAdapter({ iframe });

  await expect(adapter.captureViewport('visible')).resolves.toBe('data:image/png;base64,frame');
  await expect(adapter.captureViewport('full')).resolves.toBe('data:image/png;base64,frame');

  expect(mocks.renderViewerFrameToDataUrl).toHaveBeenNthCalledWith(1, iframe, 'visible');
  expect(mocks.renderViewerFrameToDataUrl).toHaveBeenNthCalledWith(2, iframe, 'full');
  expect(mocks.composeViewerCaptureOverlays).toHaveBeenCalledWith(
    expect.objectContaining({ baseDataUrl: 'data:image/png;base64,frame', iframe })
  );
  iframe.remove();
});

it('captures selection by cropping viewer-rendered visible data to iframe coordinates', async () => {
  const iframe = createReadyIframe();
  const adapter = createViewerScreenshotCaptureAdapter({ iframe });

  await expect(adapter.captureSelection()).resolves.toBe('data:image/png;base64,cropped');

  expect(mocks.requestViewerSelectionArea).toHaveBeenCalledWith(iframe);
  expect(mocks.renderViewerFrameToDataUrl).toHaveBeenCalledWith(iframe, 'visible');
  expect(mocks.cropImage).toHaveBeenCalledWith('data:image/png;base64,frame', {
    height: 40,
    width: 60,
    x: 10,
    y: 20,
  });
  iframe.remove();
});

it('surfaces a clear capture error when the viewer iframe is not ready', async () => {
  const adapter = createViewerScreenshotCaptureAdapter({ iframe: null });

  await expect(adapter.captureViewport('visible')).rejects.toThrow(
    'Web snapshot viewer frame is not ready'
  );
});

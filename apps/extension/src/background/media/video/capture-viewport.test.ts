import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendTabMessage: vi.fn(),
}));

vi.mock('../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../routing-contracts/runtime-messaging/services')>()),
  getBackgroundRuntimeMessaging: () => ({ sendTabMessage: mocks.sendTabMessage }),
}));

import { captureViewportsEqual, readTabCaptureViewport } from './capture-viewport';

const viewport = {
  devicePixelRatio: 2,
  height: 720,
  scrollX: 0,
  scrollY: 0,
  viewportOffsetX: 0,
  viewportOffsetY: 0,
  visualViewportScale: 1,
  width: 1280,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendTabMessage.mockResolvedValue({ success: true, viewport });
});

describe('tab capture viewport validation', () => {
  it('reads the atomic viewport response through canonical tab messaging', async () => {
    await expect(readTabCaptureViewport(7)).resolves.toEqual(viewport);
    expect(mocks.sendTabMessage).toHaveBeenCalledWith(7, { type: 'GET_VIEWPORT_COORDS' });
  });

  it.each([
    { width: Number.NaN },
    { height: Number.NaN },
    { width: 0 },
    { height: 0 },
    { devicePixelRatio: Number.NaN },
    { devicePixelRatio: 0 },
  ])('rejects invalid viewport dimensions: $width × $height @ $devicePixelRatio', async (patch) => {
    mocks.sendTabMessage.mockResolvedValueOnce({
      success: true,
      viewport: { ...viewport, ...patch },
    });

    await expect(readTabCaptureViewport(7)).rejects.toThrow('viewport is invalid');
  });

  it.each([{ visualViewportScale: 1.25 }, { viewportOffsetX: 1 }, { viewportOffsetY: 1 }])(
    'rejects a zoomed or panned visual viewport',
    async (patch) => {
      mocks.sendTabMessage.mockResolvedValueOnce({
        success: true,
        viewport: { ...viewport, ...patch },
      });

      await expect(readTabCaptureViewport(7)).rejects.toThrow('zoomed or panned');
    }
  );

  it('surfaces explicit and default transport failures', async () => {
    mocks.sendTabMessage.mockResolvedValueOnce({ success: false, error: 'page unavailable' });
    await expect(readTabCaptureViewport(7)).rejects.toThrow('page unavailable');

    mocks.sendTabMessage.mockResolvedValueOnce({ success: true });
    await expect(readTabCaptureViewport(7)).rejects.toThrow('viewport is unavailable');
  });

  it.each([
    { width: 1024 },
    { height: 768 },
    { devicePixelRatio: 1 },
    { visualViewportScale: 1.25 },
    { viewportOffsetX: 1 },
    { viewportOffsetY: 1 },
  ])('detects a changed coordinate-space component', (patch) => {
    expect(captureViewportsEqual(viewport, { ...viewport, ...patch })).toBe(false);
  });

  it('normalizes absent visual viewport fields to the unzoomed origin', () => {
    const withoutVisualFields = {
      devicePixelRatio: 2,
      height: 720,
      scrollX: 0,
      scrollY: 0,
      width: 1280,
    };

    expect(captureViewportsEqual(withoutVisualFields, viewport)).toBe(true);
  });
});

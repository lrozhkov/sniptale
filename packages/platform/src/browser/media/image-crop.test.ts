// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/message-types';

async function importUtilsContentModule() {
  vi.resetModules();
  return {
    crop: await import('@sniptale/platform/browser/media/image-crop'),
  };
}

class TestImage {
  private onloadHandler: (() => void) | null = null;
  private onerrorHandler: (() => void) | null = null;

  set onload(handler: (() => void) | null) {
    this.onloadHandler = handler;
  }

  set onerror(handler: (() => void) | null) {
    this.onerrorHandler = handler;
  }

  set src(value: string) {
    if (value === 'data:image/png;base64,ok') {
      this.onloadHandler?.();
      return;
    }

    this.onerrorHandler?.();
  }
}

const area: CaptureArea = {
  height: 40,
  width: 30,
  x: 10,
  y: 20,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-22T10:11:12.345Z'));
  vi.stubGlobal('Image', TestImage);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('utils-content image loading and cropping', () => {
  it('loads images, crops them with device-pixel-ratio scaling, and returns the new data URL', async () => {
    const drawImage = vi.fn();
    const context = Object.assign(Object.create(null), {
      drawImage,
    }) as CanvasRenderingContext2D;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const toDataUrl = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,cropped');
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    });

    const utilsContent = await importUtilsContentModule();
    const result = await utilsContent.crop.cropImage('data:image/png;base64,ok', area);

    expect(result).toBe('data:image/png;base64,cropped');
    expect(getContext).toHaveBeenCalledWith('2d');
    expect(drawImage).toHaveBeenCalledWith(expect.any(TestImage), 20, 40, 60, 80, 0, 0, 60, 80);
    expect(toDataUrl).toHaveBeenCalledWith('image/png');
  });

  it('surfaces image load failures and canvas context failures through cropImage', async () => {
    const utilsContent = await importUtilsContentModule();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(utilsContent.crop.cropImage('data:image/png;base64,bad', area)).rejects.toThrow(
      'Failed to load image'
    );
    await expect(utilsContent.crop.cropImage('data:image/png;base64,ok', area)).rejects.toThrow(
      'Failed to get canvas context'
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[ContentImageCrop]',
      'Failed to crop image',
      expect.any(Error)
    );
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  buildViewportCaptureScreenshotOptions,
  createDebuggerCaptureDataUrl,
  finalizeCapturedDataUrl,
  resolveVisibleCaptureApiFormat,
  withHiddenFixedElements,
} from './helpers';

describe('capture-visible-flow format helpers', () => {
  it('resolves WebP requests to PNG wire captures and keeps JPEG unchanged', () => {
    expect(resolveVisibleCaptureApiFormat('webp')).toBe('png');
    expect(resolveVisibleCaptureApiFormat('jpeg')).toBe('jpeg');
  });

  it('builds debugger viewport capture options from the viewport and settings', () => {
    expect(
      buildViewportCaptureScreenshotOptions(
        { width: 1440, height: 900 },
        { imageFormat: 'webp', imageQuality: 82 }
      )
    ).toEqual({
      clip: {
        height: 900,
        scale: 1,
        width: 1440,
        x: 0,
        y: 0,
      },
      format: 'png',
      fromSurface: true,
      quality: 82,
    });
  });

  it('wraps debugger payloads as data URLs and only converts when WebP is requested', async () => {
    const convertPngToWebp = vi.fn().mockResolvedValue('data:image/webp;base64,converted');

    expect(createDebuggerCaptureDataUrl('abc123', 'webp')).toBe('data:image/png;base64,abc123');

    await expect(
      finalizeCapturedDataUrl({
        dataUrl: 'data:image/png;base64,abc123',
        settings: { imageFormat: 'png', imageQuality: 90 },
        convertPngToWebp,
      })
    ).resolves.toBe('data:image/png;base64,abc123');
    expect(convertPngToWebp).not.toHaveBeenCalled();

    await expect(
      finalizeCapturedDataUrl({
        dataUrl: 'data:image/png;base64,abc123',
        settings: { imageFormat: 'webp', imageQuality: 74 },
        convertPngToWebp,
      })
    ).resolves.toBe('data:image/webp;base64,converted');
    expect(convertPngToWebp).toHaveBeenCalledWith('data:image/png;base64,abc123', 74);
  });
});

describe('capture-visible-flow masking helper', () => {
  it('hides fixed elements, waits for DOM settle, and restores the page after success', async () => {
    const adapter = {
      hideFixedElements: vi.fn().mockResolvedValue(3),
      restoreFixedElements: vi.fn().mockResolvedValue(undefined),
      waitForDomSettle: vi.fn().mockResolvedValue(undefined),
    };
    const runCapture = vi.fn().mockResolvedValue('data:image/png;base64,abc123');

    await expect(withHiddenFixedElements(42, runCapture, adapter)).resolves.toEqual({
      hiddenCount: 3,
      result: 'data:image/png;base64,abc123',
    });

    expect(adapter.hideFixedElements).toHaveBeenCalledWith(42);
    expect(adapter.waitForDomSettle).toHaveBeenCalledWith(300);
    expect(runCapture).toHaveBeenCalledTimes(1);
    expect(adapter.restoreFixedElements).toHaveBeenCalledWith(42);
  });

  it('still restores fixed elements when the capture callback fails', async () => {
    const adapter = {
      hideFixedElements: vi.fn().mockResolvedValue(1),
      restoreFixedElements: vi.fn().mockResolvedValue(undefined),
      waitForDomSettle: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      withHiddenFixedElements(7, () => Promise.reject(new Error('capture failed')), adapter)
    ).rejects.toThrow('capture failed');

    expect(adapter.restoreFixedElements).toHaveBeenCalledWith(7);
  });
});

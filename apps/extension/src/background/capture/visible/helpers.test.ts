import { describe, expect, it, vi } from 'vitest';

import { finalizeCapturedDataUrl, resolveVisibleCaptureApiFormat } from './helpers';

describe('capture-visible-flow format helpers', () => {
  it('resolves WebP requests to PNG wire captures and keeps JPEG unchanged', () => {
    expect(resolveVisibleCaptureApiFormat('webp')).toBe('png');
    expect(resolveVisibleCaptureApiFormat('jpeg')).toBe('jpeg');
  });

  it('only converts visible captures when WebP is requested', async () => {
    const convertPngToWebp = vi.fn().mockResolvedValue('data:image/webp;base64,converted');

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

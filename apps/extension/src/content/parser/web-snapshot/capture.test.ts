import { beforeEach, expect, it, vi } from 'vitest';

const { captureFullPageScreenshotAssetMock } = vi.hoisted(() => ({
  captureFullPageScreenshotAssetMock: vi.fn(),
}));

vi.mock('../export-manager/diagnostics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../export-manager/diagnostics')>()),
  captureFullPageScreenshotAsset: captureFullPageScreenshotAssetMock,
}));

import { captureWebSnapshotScreenshot, captureWebSnapshotScreenshotWithWarnings } from './capture';

beforeEach(() => {
  captureFullPageScreenshotAssetMock.mockReset();
});

it('returns an owner-provided screenshot blob without copying it', async () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  const contentIntentSource = { grantToken: 'grant-1', kind: 'background-auto-start' } as const;
  captureFullPageScreenshotAssetMock.mockResolvedValue({ content: blob, captureWarnings: [] });

  await expect(captureWebSnapshotScreenshot(contentIntentSource)).resolves.toBe(blob);
  expect(captureFullPageScreenshotAssetMock).toHaveBeenCalledWith(contentIntentSource, undefined);
});

it('normalizes non-Blob screenshot payloads into a PNG blob', async () => {
  captureFullPageScreenshotAssetMock.mockResolvedValue({
    content: 'encoded-image',
    captureWarnings: [],
  });

  const result = await captureWebSnapshotScreenshot();

  expect(result.type).toBe('image/png');
  await expect(result.text()).resolves.toBe('encoded-image');
});

it('preserves capture downscale warnings for web snapshot metadata', async () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  captureFullPageScreenshotAssetMock.mockResolvedValue({
    content: blob,
    captureWarnings: ['Screenshot was downscaled'],
  });

  await expect(captureWebSnapshotScreenshotWithWarnings()).resolves.toEqual({
    blob,
    warnings: ['Screenshot was downscaled'],
  });
});

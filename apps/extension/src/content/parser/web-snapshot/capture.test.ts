import { beforeEach, expect, it, vi } from 'vitest';

const { captureFullPageScreenshotAssetMock } = vi.hoisted(() => ({
  captureFullPageScreenshotAssetMock: vi.fn(),
}));

vi.mock('../export-manager/diagnostics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../export-manager/diagnostics')>()),
  captureFullPageScreenshotAsset: captureFullPageScreenshotAssetMock,
}));

import { captureWebSnapshotScreenshot } from './capture';

beforeEach(() => {
  captureFullPageScreenshotAssetMock.mockReset();
});

it('returns an owner-provided screenshot blob without copying it', async () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  const contentIntentSource = { grantToken: 'grant-1', kind: 'background-auto-start' } as const;
  captureFullPageScreenshotAssetMock.mockResolvedValue({ content: blob });

  await expect(captureWebSnapshotScreenshot(contentIntentSource)).resolves.toBe(blob);
  expect(captureFullPageScreenshotAssetMock).toHaveBeenCalledWith(contentIntentSource);
});

it('normalizes non-Blob screenshot payloads into a PNG blob', async () => {
  captureFullPageScreenshotAssetMock.mockResolvedValue({ content: 'encoded-image' });

  const result = await captureWebSnapshotScreenshot();

  expect(result.type).toBe('image/png');
  await expect(result.text()).resolves.toBe('encoded-image');
});

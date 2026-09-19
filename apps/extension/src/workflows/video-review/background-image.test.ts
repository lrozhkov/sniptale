import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { importReviewBackgroundImage } from './background-image';

const asset = vi.hoisted(() => ({
  prepare: vi.fn(),
  publish: vi.fn(),
  discard: vi.fn(),
  changed: vi.fn(),
}));
vi.mock('../../composition/persistence/projects', () => ({ prepareProjectAsset: asset.prepare }));
vi.mock('../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: asset.changed,
}));
const close = vi.fn();
beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1920, height: 1080, close }))
  );
  asset.prepare.mockResolvedValue({ id: 'image', publish: asset.publish, discard: asset.discard });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
const file = () => new File(['image'], 'background.png', { type: 'image/png' });

it('publishes only after attaching the durable background reference', async () => {
  const attach = vi.fn(async () => {
    expect(asset.publish).not.toHaveBeenCalled();
  });
  await importReviewBackgroundImage({ file: file(), signal: new AbortController().signal, attach });
  expect(attach).toHaveBeenCalledWith('project-asset:image');
  expect(asset.publish).toHaveBeenCalledOnce();
  expect(asset.discard).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
it('rejects unsupported and oversized images before staging', async () => {
  for (const input of [
    new File(['svg'], 'a.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(17 * 1024 * 1024)], 'a.png', { type: 'image/png' }),
  ]) {
    await expect(
      importReviewBackgroundImage({
        file: input,
        signal: new AbortController().signal,
        attach: vi.fn(),
      })
    ).rejects.toThrow();
  }
  expect(asset.prepare).not.toHaveBeenCalled();
});
it('discards staged bytes when attaching fails, but retains a referenced asset after publication failure', async () => {
  await expect(
    importReviewBackgroundImage({
      file: file(),
      signal: new AbortController().signal,
      attach: async () => {
        throw new Error('write');
      },
    })
  ).rejects.toThrow('write');
  expect(asset.discard).toHaveBeenCalledOnce();
  asset.discard.mockClear();
  asset.publish.mockRejectedValueOnce(new Error('publish'));
  await expect(
    importReviewBackgroundImage({
      file: file(),
      signal: new AbortController().signal,
      attach: vi.fn(),
    })
  ).rejects.toThrow('publish');
  expect(asset.discard).not.toHaveBeenCalled();
});
it('cancels after staging without attaching or publishing', async () => {
  const controller = new AbortController();
  asset.prepare.mockImplementationOnce(async () => {
    controller.abort();
    return { id: 'image', publish: asset.publish, discard: asset.discard };
  });
  const attach = vi.fn();
  await expect(
    importReviewBackgroundImage({ file: file(), signal: controller.signal, attach })
  ).rejects.toThrow();
  expect(attach).not.toHaveBeenCalled();
  expect(asset.discard).toHaveBeenCalledOnce();
});

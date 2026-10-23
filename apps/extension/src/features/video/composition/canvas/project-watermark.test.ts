import { beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from '../../project/factories/creation';
import { createQuickEditWatermark } from '../../project/scene/watermark';
import { VideoProjectAssetType } from '../../project/types/model';
import type { WatermarkRenderer } from './watermark';
import { createVideoProjectWatermarkRenderer } from './project-watermark';

const painter = vi.hoisted(() => vi.fn<typeof import('./watermark').createWatermarkRenderer>());
vi.mock('./watermark', () => ({ createWatermarkRenderer: painter }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function renderer(): WatermarkRenderer {
  return { bounds: { x: 0, y: 0, width: 20, height: 10 }, draw: vi.fn(), dispose: vi.fn() };
}
function project() {
  const value = createEmptyVideoProject();
  value.watermark = { ...createQuickEditWatermark('Mark'), mode: 'text' };
  return value;
}
const output = { width: 1280, height: 720 };
beforeEach(() => painter.mockReset());

it('coalesces frame preparation and retains it when one frame is cancelled', async () => {
  const pending = deferred<WatermarkRenderer>();
  painter.mockReturnValue(pending.promise);
  const read = vi.fn();
  const owner = createVideoProjectWatermarkRenderer(read);
  const value = project();
  const signal = new AbortController();
  const cancelled = owner.prepare(value, output, signal.signal);
  const rejected = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  const next = owner.prepare(value, output);
  signal.abort();
  await rejected;
  expect(painter).toHaveBeenCalledTimes(1);
  expect(painter.mock.calls[0]![3]?.aborted).toBe(false);
  const ready = renderer();
  pending.resolve(ready);
  expect(await next).toBe(ready);
  value.name = 'Renamed';
  value.updatedAt += 1;
  expect(await owner.prepare(value, output)).toBe(ready);
  expect(painter).toHaveBeenCalledTimes(1);
  owner.clear();
  expect(ready.dispose).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
});

it('serializes uncancellable preparations and skips superseded queued settings', async () => {
  const first = deferred<WatermarkRenderer>();
  const last = deferred<WatermarkRenderer>();
  painter.mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
  const owner = createVideoProjectWatermarkRenderer(vi.fn());
  const value = project();
  const a = owner.prepare(value, output);
  const aRejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
  value.watermark!.text.value = 'B';
  const b = owner.prepare(value, output);
  const bRejected = expect(b).rejects.toMatchObject({ name: 'AbortError' });
  value.watermark!.text.value = 'C';
  const c = owner.prepare(value, output);
  await Promise.all([aRejected, bRejected]);
  expect(painter).toHaveBeenCalledTimes(1);
  const stale = renderer();
  first.resolve(stale);
  await vi.waitFor(() => expect(painter).toHaveBeenCalledTimes(2));
  expect(painter.mock.calls[1]![0]?.text.value).toBe('C');
  expect(stale.dispose).toHaveBeenCalledTimes(1);
  const ready = renderer();
  last.resolve(ready);
  expect(await c).toBe(ready);
  owner.clear();
});

it('captures project membership and source identity instead of resolving a physical id globally', async () => {
  const pending = deferred<WatermarkRenderer>();
  painter.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(renderer());
  const blob = new Blob(['logo']);
  const read = vi.fn().mockResolvedValue(blob);
  const owner = createVideoProjectWatermarkRenderer(read);
  const value = project();
  const asset = createVideoProjectAsset(
    'Logo',
    VideoProjectAssetType.IMAGE,
    { kind: 'project-asset', projectAssetId: 'physical' },
    {
      width: 20,
      height: 10,
      mimeType: 'image/png',
      size: 4,
      duration: 0,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  asset.id = 'logical';
  value.assets = [asset];
  value.watermark = {
    ...value.watermark!,
    mode: 'image',
    image: {
      assetId: 'project-asset:logical',
      width: 20,
      height: 10,
      size: 0.2,
      opacity: 1,
    },
  };
  const ready = owner.prepare(value, output);
  asset.source = { kind: 'project-asset', projectAssetId: 'replacement' };
  const port = painter.mock.calls[0]![2];
  expect(await port.read('project-asset:logical')).toBe(blob);
  expect(read.mock.calls[0]![0].source.projectAssetId).toBe('physical');
  await expect(port.read('project-asset:physical')).rejects.toThrow(
    'Watermark image is unavailable.'
  );
  pending.resolve(renderer());
  await ready;
  await owner.prepare(value, output);
  expect(painter).toHaveBeenCalledTimes(2);
  owner.clear();
});

it('retires a completed cache when dimensions or authored settings change', async () => {
  const old = renderer();
  painter
    .mockResolvedValueOnce(old)
    .mockResolvedValueOnce(renderer())
    .mockResolvedValueOnce(renderer());
  const owner = createVideoProjectWatermarkRenderer(vi.fn());
  const value = project();
  await owner.prepare(value, output);
  await owner.prepare(value, { width: 640, height: 360 });
  expect(old.dispose).toHaveBeenCalledTimes(1);
  value.watermark!.text.value = 'Changed';
  await owner.prepare(value, { width: 640, height: 360 });
  expect(painter).toHaveBeenCalledTimes(3);
  owner.clear();
});

it('releases late results after owner disposal before starting a replacement session', async () => {
  const pending = deferred<WatermarkRenderer>();
  painter.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(renderer());
  const owner = createVideoProjectWatermarkRenderer(vi.fn());
  const value = project();
  const old = owner.prepare(value, output);
  const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
  owner.clear();
  await rejected;
  const replacement = owner.prepare(value, output);
  expect(painter).toHaveBeenCalledTimes(1);
  const stale = renderer();
  pending.resolve(stale);
  await replacement;
  expect(stale.dispose).toHaveBeenCalledTimes(1);
  expect(painter).toHaveBeenCalledTimes(2);
  owner.clear();
});

it('permits a fresh retry after preparation failure and refuses an already aborted caller', async () => {
  painter.mockRejectedValueOnce(new Error('Read failed')).mockResolvedValueOnce(renderer());
  const owner = createVideoProjectWatermarkRenderer(vi.fn());
  const value = project();
  const aborted = new AbortController();
  aborted.abort();
  await expect(owner.prepare(value, output, aborted.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(painter).not.toHaveBeenCalled();
  await expect(owner.prepare(value, output)).rejects.toThrow('Read failed');
  await owner.prepare(value, output);
  expect(painter).toHaveBeenCalledTimes(2);
  owner.clear();
});

it('prepares an empty watermark while disabled and uses retained settings only after activation', async () => {
  painter.mockImplementation(async () => renderer());
  const read = vi.fn();
  const owner = createVideoProjectWatermarkRenderer(read);
  const value = { ...project(), watermarkEnabled: false as const };
  const before = structuredClone(value.watermark);
  await owner.prepare(value, output);
  expect(painter.mock.calls[0]![0]).toBeUndefined();
  const { watermarkEnabled: _disabled, ...enabled } = value;
  await owner.prepare(enabled, output);
  expect(painter.mock.calls[1]![0]).toEqual(before);
  expect(value.watermark).toEqual(before);
  expect(read).not.toHaveBeenCalled();
  owner.clear();
});

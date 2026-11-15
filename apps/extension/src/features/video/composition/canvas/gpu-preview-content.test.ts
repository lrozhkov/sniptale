// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createGpuPreviewGroupContents } from './gpu-preview-content';
import type { GpuPreviewGroup, GpuPreviewLayer } from './gpu-preview-types';
import { graphics } from './gpu-preview.test-support';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const raster = () => {
  const source = document.createElement('canvas');
  source.width = 32;
  source.height = 18;
  return source;
};
const layer = (source: GpuPreviewLayer['source'] = raster()): GpuPreviewLayer => ({
  source,
  rect: { x: 0, y: 0, width: 32, height: 18 },
  inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  cache: { key: 'contents', revision: {} },
});
const group = (layers: readonly GpuPreviewLayer[]): GpuPreviewGroup => ({
  kind: 'group',
  output: { width: 64, height: 36 },
  logical: { width: 64, height: 36 },
  layers,
});

it('keeps reconstructed group identity stable and snapshots changes in geometry, revisions and masks', () => {
  graphics();
  const owner = createGpuPreviewGroupContents(),
    child = layer(),
    mask = raster();
  child.alphaMask = { source: mask, rect: child.rect, cache: { key: 'mask', revision: {} } };
  const key = owner()(group([child]));
  expect(key).toBeDefined();
  expect(owner()(group([{ ...child, inverse: [...child.inverse] }]))).toBe(key);
  child.opacity = 0.5;
  expect(owner()(group([child]))).not.toBe(key);
  delete child.opacity;
  child.cache = { key: 'contents', revision: {} };
  expect(owner()(group([child]))).not.toBe(key);
  const beforeMask = owner()(group([child]));
  child.alphaMask.cache = { key: 'mask', revision: {} };
  expect(owner()(group([child]))).not.toBe(beforeMask);
});

it('preserves signed zero and number versus string revision distinctions', () => {
  graphics();
  const owner = createGpuPreviewGroupContents(),
    child = layer();
  child.cache = { key: 'contents', revision: 1 };
  const key = owner()(group([child]));
  child.cache = { key: 'contents', revision: '1' };
  expect(owner()(group([child]))).not.toBe(key);
  const positiveZero = owner()(group([child]));
  child.inverse = [1, -0, 0, 0, 1, 0, 0, 0, 1];
  expect(owner()(group([child]))).not.toBe(positiveZero);
});

it('uses immutable bitmap identity without requiring a mutable raster revision', () => {
  graphics();
  class Bitmap implements ImageBitmap {
    width = 32;
    height = 18;
    close() {}
  }
  vi.stubGlobal('ImageBitmap', Bitmap);
  const owner = createGpuPreviewGroupContents(),
    child = layer(new Bitmap());
  delete child.cache;
  const key = owner()(group([child]));
  expect(key).toBeDefined();
  expect(owner()(group([child]))).toBe(key);
  child.source = new Bitmap();
  expect(owner()(group([child]))).not.toBe(key);
});

it('leaves video, unversioned canvases, secondary filters and GL composition unavailable', () => {
  graphics();
  const owner = createGpuPreviewGroupContents();
  const mutable = layer();
  delete mutable.cache;
  expect(owner()(group([mutable]))).toBeUndefined();
  expect(owner()(group([layer(new VideoFrame(raster()))]))).toBeUndefined();
  expect(owner()(group([{ ...layer(), cssFilter: { brightness: 1 } }]))).toBeUndefined();
  const transition = group([layer()]);
  Reflect.set(transition, 'composition', {});
  expect(owner()(transition)).toBeUndefined();
});

it('represents repeated DAG aliases linearly and bypasses cycles or exhausted budgets', () => {
  graphics();
  const owner = createGpuPreviewGroupContents();
  let shared = group([layer()]);
  for (let i = 0; i < 12; i++) shared = group([layer(shared), layer(shared)]);
  expect(owner()(shared)).toBeDefined();
  const cycle = group([]);
  Reflect.set(cycle, 'layers', [layer(cycle)]);
  expect(owner()(cycle)).toBeUndefined();
  expect(owner()(group(Array.from({ length: 513 }, () => layer())))).toBeUndefined();
});

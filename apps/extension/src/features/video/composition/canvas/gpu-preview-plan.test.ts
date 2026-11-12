import { createSourceImageFilter } from '../../../image-filters/contract';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  omitLeadingGroupCopies,
  gpuPreviewTextureBytes,
  validateGpuPreviewFrame,
  requiresRasterSource,
} from './gpu-preview-plan';
import type { GpuPreviewGroup, GpuPreviewLayer } from './gpu-preview-types';

beforeEach(() => {
  class Frame {
    readonly displayWidth: number;
    readonly displayHeight: number;
    readonly format: VideoPixelFormat;
    constructor(_data: Uint8Array, init: VideoFrameBufferInit) {
      this.displayWidth = init.displayWidth ?? init.codedWidth;
      this.displayHeight = init.displayHeight ?? init.codedHeight;
      this.format = init.format;
    }
  }
  vi.stubGlobal('VideoFrame', Frame);
});
afterEach(() => vi.unstubAllGlobals());
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
function fixture(format: VideoPixelFormat = 'NV12') {
  const output = { width: 64, height: 72 };
  const source = new VideoFrame(new Uint8Array(64 * 64 * 4), {
    format,
    codedWidth: 64,
    codedHeight: 64,
    displayWidth: 64,
    displayHeight: 56,
    timestamp: 0,
  });
  const video: GpuPreviewLayer = {
    source,
    rect: { x: 0, y: 8, width: 64, height: 56 },
    inverse: identity,
    orientation: { rotation: 0, flip: false },
    clip: { rect: { x: 0, y: 8, width: 64, height: 56 }, radius: 0 },
  };
  const group: GpuPreviewGroup = { kind: 'group', output, logical: output, layers: [video] };
  const background: GpuPreviewLayer = {
    source: new VideoFrame(new Uint8Array(64 * 72 * 4), {
      format: 'RGBA',
      codedWidth: 64,
      codedHeight: 72,
      timestamp: 0,
    }),
    rect: { x: 0, y: 0, ...output },
    inverse: identity,
  };
  const wrapper: GpuPreviewLayer = {
    source: group,
    rect: { x: 0, y: 0, ...output },
    inverse: identity,
  };
  const request = {
    output,
    logical: output,
    layers: [background, wrapper],
    signal: new AbortController().signal,
  };
  return { request, background, wrapper, group, video };
}
it('draws an opaque native-grid video directly over an earlier background', () => {
  const f = fixture();
  const original = f.request.layers;
  const result = omitLeadingGroupCopies(f.request);
  expect(result.layers).toEqual([f.background, f.video]);
  expect(f.request.layers).toBe(original);
  expect(f.wrapper.source).toBe(f.group);
  expect(f.group.layers).toEqual([f.video]);
});
it.each(['RGBA', 'BGRA'] as const)(
  'retains the intermediate for potentially transparent %s',
  (format) => {
    const f = fixture(format);
    expect(omitLeadingGroupCopies(f.request).layers).toEqual(f.request.layers);
  }
);
it.each([
  'shared',
  'density',
  'fractional',
  'scale',
  'rounded',
  'subclip',
  'opacity',
  'rotation',
  'projection',
  'tint',
  'blend',
  'multiple',
] as const)('retains the established composition for %s', (reason) => {
  const f = fixture();
  if (reason === 'shared') f.request.layers.push({ ...f.wrapper, opacity: 0 });
  if (reason === 'density') f.request.output = { width: 128, height: 144 };
  if (reason === 'fractional') f.video.rect = { ...f.video.rect, y: 8.25 };
  if (reason === 'scale') f.video.rect = { ...f.video.rect, width: 63 };
  if (reason === 'rounded') f.video.clip = { ...f.video.clip!, radius: 2 };
  if (reason === 'subclip') f.video.clip = { rect: { ...f.video.rect, width: 32 }, radius: 0 };
  if (reason === 'opacity') f.video.opacity = 0.5;
  if (reason === 'rotation') f.video.orientation = { rotation: 90, flip: false };
  if (reason === 'projection') f.video.inverse = [1, 0, 0, 0, 1, 0, 0.001, 0, 1];
  if (reason === 'tint') f.video.tint = [1, 0, 0, 0.5];
  if (reason === 'blend') f.video.blend = 'screen';
  if (reason === 'multiple') f.group.layers = [f.background, f.video];
  expect(omitLeadingGroupCopies(f.request).layers).toEqual(f.request.layers);
});

it('counts a shared GPU subtree once and keeps its outside references during stage planning', () => {
  const bitmap: ImageBitmap = { width: 16, height: 16, close() {} };
  const child: GpuPreviewGroup = {
    kind: 'group',
    output: { width: 16, height: 16 },
    logical: { width: 16, height: 16 },
    layers: [{ source: bitmap, rect: { x: 0, y: 0, width: 16, height: 16 }, inverse: identity }],
  };
  const inner: GpuPreviewLayer = {
    source: child,
    rect: { x: 0, y: 0, width: 16, height: 16 },
    inverse: identity,
  };
  const parent: GpuPreviewGroup = {
    kind: 'group',
    output: { width: 32, height: 32 },
    logical: { width: 32, height: 32 },
    layers: [inner],
  };
  const layers = [{ ...inner, source: parent }, inner];
  expect(gpuPreviewTextureBytes(layers)).toBe(6144);
  expect(gpuPreviewTextureBytes(layers, parent)).toBe(6144);
  expect(gpuPreviewTextureBytes(layers, child)).toBe(5120);
});

it('counts cached raster, alpha and operation coverage using distinct backend identities', () => {
  vi.stubGlobal('VideoFrame', undefined);
  const bitmap: ImageBitmap = { width: 8, height: 8, close() {} };
  const raster: GpuPreviewLayer = {
    source: bitmap,
    rect: { x: 0, y: 0, width: 8, height: 8 },
    inverse: identity,
    cache: { key: 'content', revision: 1 },
    alphaMask: { source: bitmap, rect: { x: 0, y: 0, width: 1, height: 1 } },
    operationClip: { source: bitmap },
  };
  expect(gpuPreviewTextureBytes([raster, raster])).toBe(512);
  const group: GpuPreviewGroup = {
    kind: 'group',
    output: { width: 8, height: 8 },
    logical: { width: 8, height: 8 },
    layers: [raster],
  };
  const wrapper = { ...raster, source: group };
  expect(gpuPreviewTextureBytes([wrapper, wrapper], group)).toBe(512);
});

it('counts filtered decoded video storage while keeping external video allocation-free', () => {
  const f = fixture();
  expect(gpuPreviewTextureBytes([f.video])).toBe(0);
  expect(gpuPreviewTextureBytes([{ ...f.video, blur: 1 }])).toBe(64 * 56 * 4);
});

it('rejects invalid or overflowing group storage before selecting a GPU stage', () => {
  const f = fixture();
  f.group.output = { width: 1.5, height: 8 };
  expect(() => gpuPreviewTextureBytes([f.wrapper])).toThrow('dimensions');
  f.group.output = { width: Number.MAX_SAFE_INTEGER, height: 8 };
  expect(() => gpuPreviewTextureBytes([f.wrapper])).toThrow('texture budget');
});

it('retains conflicting raster cache refusal before bounded scene staging', () => {
  const first: ImageBitmap = { width: 8, height: 8, close() {} };
  const second: ImageBitmap = { width: 8, height: 8, close() {} };
  const layer: GpuPreviewLayer = {
    source: first,
    rect: { x: 0, y: 0, width: 8, height: 8 },
    inverse: identity,
    cache: { key: 'same', revision: 1 },
  };
  expect(() => gpuPreviewTextureBytes([layer, { ...layer, source: second }])).toThrow(
    'cache key has conflicting sources'
  );
  expect(() =>
    gpuPreviewTextureBytes([layer, { ...layer, cache: { key: 'same', revision: 2 } }])
  ).toThrow('cache key has conflicting sources');
});

it('keeps active source filters on wrapper groups while neutral stacks preserve direct sampling', () => {
  const f = fixture();
  const color = createSourceImageFilter('color', 'a');
  f.wrapper.imageFilters = { stack: { version: 1, filters: [color] }, logical: f.request.logical };
  expect(requiresRasterSource(f.wrapper)).toBe(false);
  expect(omitLeadingGroupCopies(f.request).layers).toEqual([f.background, f.video]);
  if (color.kind !== 'color') throw new Error('Expected color.');
  color.parameters.exposure = 1;
  expect(requiresRasterSource(f.wrapper)).toBe(true);
  expect(omitLeadingGroupCopies(f.request)).toBe(f.request);
  const compiled = validateGpuPreviewFrame(f.request, 8192).imageFilters.get(f.wrapper);
  expect(compiled?.steps[0]?.values[0]).toBe(2);
  color.parameters.exposure = 0;
  expect(compiled?.steps[0]?.values[0]).toBe(2);
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { omitLeadingGroupCopies } from './gpu-preview-plan';
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

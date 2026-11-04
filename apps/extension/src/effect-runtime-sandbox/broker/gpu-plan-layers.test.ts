// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { EffectRuntimeGpuDraw } from '../../contracts/effect-runtime/gpu-plan';
import type {
  GpuPreviewGroup,
  GpuPreviewLayer,
} from '../../features/video/composition/canvas/gpu-preview';
import { buildEffectRuntimeGpuOperationLayers } from './gpu-plan-layers';

function fixture() {
  const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
  bitmap.width = 100;
  bitmap.height = 50;
  const mask = Object.assign(document.createElement('canvas'), { close: vi.fn() });
  mask.width = 80;
  mask.height = 60;
  const operation: EffectRuntimeGpuDraw = {
    op: 'draw',
    source: { kind: 'resource', id: 1 },
    sourceRect: { x: 0, y: 0, width: 100, height: 50 },
    destination: { x: 10, y: 5, width: 40, height: 20 },
    transform: [1, 0, 0, 1, 0, 0],
    alpha: 0.5,
    blend: 'source-over',
    filter: { blur: 0, brightness: 1, saturate: 1 },
    shadow: { color: [0, 0, 0, 0], blur: 0, offsetX: 0, offsetY: 0 },
  };
  const resolve = vi.fn(() => ({ source: bitmap, width: 100, height: 50 }));
  const resolveCoverage = vi.fn(() => mask);
  const draw = (changes: Partial<EffectRuntimeGpuDraw> = {}) =>
    buildEffectRuntimeGpuOperationLayers(
      { ...operation, ...changes },
      { width: 80, height: 60 },
      resolve,
      resolveCoverage
    );
  return { bitmap, mask, operation, resolve, resolveCoverage, draw };
}
function asGroup(layer: GpuPreviewLayer): GpuPreviewGroup {
  if (!('kind' in layer.source) || layer.source.kind !== 'group')
    throw new Error('Expected GPU group');
  return layer.source;
}
function flatten(layers: readonly GpuPreviewLayer[]): GpuPreviewLayer[] {
  return layers.flatMap((layer) => [
    layer,
    ...('kind' in layer.source && layer.source.kind === 'group'
      ? flatten(layer.source.layers)
      : []),
  ]);
}

it('maps cropped source coordinates through the exact native affine order', () => {
  const f = fixture();
  const result = f.draw({
    sourceRect: { x: 25, y: 10, width: 50, height: 20 },
    transform: [2, 1, -1, 3, 7, 11],
  });
  const layer = result.layers[0]!;
  expect(layer.source).toBe(f.bitmap);
  expect(layer.rect).toEqual({ x: -10, y: -5, width: 80, height: 50 });
  expect(layer.clip?.rect).toEqual(f.operation.destination);
  // Destination (10,5) projects to (22,36); its inverse must recover the same source plane point.
  const m = layer.inverse;
  expect(m[0] * 22 + m[1] * 36 + m[2]).toBeCloseTo(10, 12);
  expect(m[3] * 22 + m[4] * 36 + m[5]).toBeCloseTo(5, 12);
  expect(f.bitmap.close).not.toHaveBeenCalled();
});

it('normalizes negative source and destination extents without introducing a mirror', () => {
  const f = fixture();
  const negative = f.draw({
    sourceRect: { x: 75, y: 30, width: -50, height: -20 },
    destination: { x: 50, y: 25, width: -40, height: -20 },
  });
  const positive = f.draw({ sourceRect: { x: 25, y: 10, width: 50, height: 20 } });
  expect(negative).toEqual(positive);
});

it('clips an out-of-image source rectangle and adjusts its destination proportionally', () => {
  const f = fixture();
  const result = f.draw({ sourceRect: { x: -25, y: -10, width: 100, height: 50 } });
  expect(result.layers[0]!.rect).toEqual({ x: 20, y: 9, width: 40, height: 20 });
  expect(result.layers[0]!.clip?.rect).toEqual({ x: 20, y: 9, width: 30, height: 16 });
});

it.each(['zero-source', 'zero-destination', 'outside-source', 'singular'] as const)(
  'keeps an empty image operation a no-op for every blend: %s',
  (kind) => {
    const f = fixture();
    const change: Partial<EffectRuntimeGpuDraw> =
      kind === 'zero-source'
        ? { sourceRect: { x: 0, y: 0, width: 0, height: 5 } }
        : kind === 'zero-destination'
          ? { destination: { x: 0, y: 0, width: 1, height: 0 } }
          : kind === 'outside-source'
            ? { sourceRect: { x: 200, y: 0, width: 5, height: 5 } }
            : { transform: [0, 0, 0, 0, 1, 1] };
    expect(f.draw({ ...change, blend: 'destination-in' })).toEqual({ clear: false, layers: [] });
  }
);

it.each([
  ['source-over', 'over'],
  ['lighter', 'add'],
  ['screen', 'screen'],
  ['source-atop', 'atop'],
  ['destination-in', 'mask'],
] as const)(
  'preserves %s for both shadow and paint with output-space clip coverage',
  (blend, expected) => {
    const f = fixture();
    const result = f.draw({
      blend,
      coverage: 9,
      shadow: { color: [1, 0.2, 0.1, 0.4], blur: 6, offsetX: 3, offsetY: -2 },
    });
    expect(result.layers).toHaveLength(2);
    for (const layer of result.layers) {
      expect(layer.blend).toBe(expected);
      expect(layer.operationClip?.source).toBe(f.mask);
      expect(layer.opacity).toBeUndefined();
    }
    expect(result.layers[0]!.cssFilter).toEqual({ blur: 3, brightness: 1, saturate: 1 });
    expect(result.layers[0]!.tint).toEqual([1, 0.2, 0.1, 0.4]);
    const raw = flatten(result.layers).find((layer) => layer.source === f.bitmap)!;
    expect(raw.opacity).toBe(0.5);
    expect(raw.operationClip).toBeUndefined();
    expect(f.mask.close).not.toHaveBeenCalled();
  }
);

it('filters global alpha before deriving the shadow, then paints the same filtered image', () => {
  const f = fixture();
  const result = f.draw({
    filter: { blur: 4, brightness: 0.7, saturate: 1.5 },
    shadow: { color: [0.2, 0.3, 0.4, 0.5], blur: 8, offsetX: 7, offsetY: -3 },
  });
  const shadow = result.layers[0]!,
    paint = result.layers[1]!;
  const shadowInput = asGroup(shadow).layers[0]!;
  expect(shadowInput.source).toBe(paint.source);
  expect(shadowInput.cssFilter).toEqual({ blur: 4, brightness: 0.7, saturate: 1.5 });
  expect(asGroup(paint).layers[0]!.opacity).toBe(0.5);
  expect(shadow.rect.x).toBe(asGroup(shadow).layers[0]!.rect.x - 26 + 7);
  expect(shadow.rect.y).toBe(asGroup(shadow).layers[0]!.rect.y - 26 - 3);
  expect(shadow.cssFilter?.blur).toBe(4);
});

it('retains off-viewport blur contributors while bounding giant transformed images', () => {
  const f = fixture();
  const outside = f.draw({
    destination: { x: -20, y: 10, width: 18, height: 18 },
    filter: { blur: 4, brightness: 1, saturate: 1 },
  });
  expect(outside.layers).toHaveLength(1);
  expect(outside.layers[0]!.rect.x).toBeLessThan(0);
  const huge = f.draw({
    destination: { x: -1_000_000, y: -1_000_000, width: 2_000_000, height: 2_000_000 },
    filter: { blur: 4, brightness: 1, saturate: 1 },
  });
  expect(asGroup(huge.layers[0]!).output).toEqual({ width: 132, height: 112 });
  expect(f.bitmap.width).toBe(100);
});

it('clears the full pass or erases native coverage once without squaring its alpha', () => {
  const f = fixture();
  const clear = buildEffectRuntimeGpuOperationLayers(
    { op: 'clear' },
    { width: 80, height: 60 },
    f.resolve,
    f.resolveCoverage
  );
  expect(clear).toEqual({ clear: true, layers: [] });
  expect(f.resolve).not.toHaveBeenCalled();
  const clipped = buildEffectRuntimeGpuOperationLayers(
    { op: 'clear', coverage: 9 },
    { width: 80, height: 60 },
    f.resolve,
    f.resolveCoverage
  );
  expect(clipped.layers[0]).toMatchObject({
    source: f.mask,
    blend: 'erase',
    inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    rect: { x: 0, y: 0, width: 80, height: 60 },
  });
  expect(clipped.layers[0]!.operationClip).toBeUndefined();
});

it('keeps zero global alpha as a transparent destination-in operation and rejects mismatched coverage', () => {
  const f = fixture();
  const transparent = f.draw({ alpha: 0, blend: 'destination-in' });
  expect(transparent.layers[0]).toMatchObject({ opacity: 0, blend: 'mask' });
  f.mask.width = 1;
  expect(() => f.draw({ coverage: 9 })).toThrow('coverage dimensions');
});

it('admits the finite padded raster before the device receives any graph', () => {
  const f = fixture();
  expect(() => f.draw({ filter: { blur: 1_000_000, brightness: 1, saturate: 1 } })).toThrow(
    'Effect runtime resource limit'
  );
});

it('retains transparent destination-in coverage when a filtered image is wholly outside the pass', () => {
  const f = fixture();
  const result = f.draw({
    destination: { x: -10000, y: -10000, width: 10, height: 10 },
    filter: { blur: 2, brightness: 1, saturate: 1 },
    blend: 'destination-in',
    coverage: 9,
  });
  expect(result.layers).toHaveLength(1);
  expect(result.layers[0]).toMatchObject({
    source: f.bitmap,
    opacity: 0,
    blend: 'mask',
    operationClip: { source: f.mask },
  });
  expect(
    f.draw({
      destination: { x: -10000, y: -10000, width: 10, height: 10 },
      filter: { blur: 2, brightness: 1, saturate: 1 },
    }).layers
  ).toEqual([]);
});

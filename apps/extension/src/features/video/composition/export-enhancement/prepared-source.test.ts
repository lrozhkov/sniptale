// @vitest-environment jsdom
import { createSourceImageFilter } from '../../../image-filters/contract';
import { planEnhancedRegion } from './region-plan';
import {
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from '../effect-runtime/runtime/resource-limits';
import { afterEach, expect, it, vi } from 'vitest';
import {
  prepareSourceSampling,
  hasMagnificationDemand,
  createPreparedSourceBudget,
  preparedSourceGpuLayers,
} from './prepared-source';
import type { SourceSamplingDemand, SourceSamplingIdentity } from '../draw/media-source';
import type { ExportEnhancer } from './enhancer';

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const source = document.createElement('canvas');
  source.width = 1920;
  source.height = 8;
  const identity: SourceSamplingIdentity = {
    sourceKey: {},
    sourceTime: 2,
    passTime: 1,
    sourceSize: { width: 1920, height: 8 },
  };
  const demand: SourceSamplingDemand = {
    ...identity,
    id: 'body',
    originalPixelROI: { x: 0, y: 0, width: 1920, height: 8 },
    sourceToOutputHomography: [2, 0, 0, 0, 2, 0, 0, 0, 1],
    targetRasterSize: { width: 3840, height: 16 },
  };
  return { source, identity, demand };
}
function tileDriver() {
  const image = document.createElement('canvas');
  image.width = 16;
  image.height = 16;
  const draw = image.getContext('2d')!;
  const withEnhancedRegion = vi.fn<ExportEnhancer['withEnhancedRegion']>(
    async (_request, consume) => {
      for (const [index, color] of ['#ff0000', '#0000ff'].entries()) {
        draw.fillStyle = color;
        draw.fillRect(0, 0, 16, 16);
        await consume({
          image,
          sourceRect: { x: 0, y: 0, width: 16, height: 16 },
          destination: { x: index * 1920, y: 0, width: 1920, height: 16 },
        });
      }
      draw.fillStyle = '#00ff00';
      draw.fillRect(0, 0, 16, 16);
      return { applied: true, tileCount: 2 };
    }
  );
  return { withEnhancedRegion, image };
}

it('copies every borrowed tile before overwrite and preserves exact original-pixel coverage', async () => {
  const { source, identity, demand } = fixture();
  const enhancer = tileDriver();
  const prepared = await prepareSourceSampling({
    budget: createPreparedSourceBudget(),
    source,
    identity,
    demands: [demand],
    enhancer,
  });
  const output = document.createElement('canvas');
  output.width = 32;
  output.height = 16;
  expect(
    prepared.sampling.drawPrepared('body', output.getContext('2d')!, demand.originalPixelROI, {
      x: 0,
      y: 0,
      width: 32,
      height: 16,
    })
  ).toBe(true);
  expect([...output.getContext('2d')!.getImageData(4, 4, 1, 1).data]).toEqual([255, 0, 0, 255]);
  expect([...output.getContext('2d')!.getImageData(24, 4, 1, 1).data]).toEqual([0, 0, 255, 255]);
  const tiles: HTMLCanvasElement[] = [];
  prepared.sampling.visitPreparedTiles('body', (tile) => {
    tiles.push(tile.image);
    expect(tile.originalPixelROI.width).toBe(960);
  });
  expect(tiles).toHaveLength(2);
  expect(tiles[0]).not.toBe(enhancer.image);
  prepared.dispose();
  prepared.dispose();
  expect(tiles.every((tile) => tile.width === 0 && tile.height === 0)).toBe(true);
  expect(source.width).toBe(1920);
  expect(enhancer.image.width).toBe(16);
  expect(() => prepared.sampling.visitPreparedTiles('body', vi.fn())).toThrow('disposed');
});

it('uses continuous density rather than rounded fractional targets for rotation and unit-scale admission', async () => {
  const { source, identity, demand } = fixture();
  const withEnhancedRegion = vi.fn<ExportEnhancer['withEnhancedRegion']>();
  const unit = {
    ...demand,
    originalPixelROI: { x: 0.25, y: 0.25, width: 7.5, height: 3.25 },
    targetRasterSize: { width: 8, height: 4 },
    sourceToOutputHomography: [0, -1, 10, 1, 0, 10, 0, 0, 1] as const,
  };
  expect(hasMagnificationDemand([unit])).toBe(false);
  expect(
    hasMagnificationDemand([
      { ...unit, sourceToOutputHomography: [1 + 1e-12, 0, 0, 0, 1 + 1e-12, 0, 0, 0, 1] },
    ])
  ).toBe(false);
  const prepared = await prepareSourceSampling({
    budget: createPreparedSourceBudget(),
    source,
    identity,
    demands: [unit],
    enhancer: { withEnhancedRegion },
  });
  expect(
    prepared.sampling.drawPrepared('body', source.getContext('2d')!, unit.originalPixelROI, {
      x: 0,
      y: 0,
      width: 8,
      height: 4,
    })
  ).toBe(false);
  expect(withEnhancedRegion).not.toHaveBeenCalled();
  prepared.dispose();
  expect(
    hasMagnificationDemand([{ ...unit, lensScale: 2, targetRasterSize: { width: 15, height: 7 } }])
  ).toBe(true);
});

it('rejects undersampling, horizons and invalid geometry even after a valid magnified demand', () => {
  const { demand } = fixture();
  expect(() =>
    hasMagnificationDemand([{ ...demand, targetRasterSize: { width: 16, height: 8 } }])
  ).toThrow('density');
  expect(() =>
    hasMagnificationDemand([
      demand,
      { ...demand, id: 'bad', sourceToOutputHomography: [1, 0, 0, 0, 1, 0, -1, 0, 1] },
    ])
  ).toThrow('horizon');
  expect(() =>
    hasMagnificationDemand([{ ...demand, originalPixelROI: { ...demand.originalPixelROI, x: -1 } }])
  ).toThrow('ROI');
});

it.each(['sourceKey', 'sourceTime', 'passTime', 'sourceSize', 'duplicate'] as const)(
  'rejects %s identity mismatches before the backend starts',
  async (mismatch) => {
    const { source, identity, demand } = fixture();
    const enhancer = tileDriver();
    const changed: SourceSamplingDemand = {
      ...demand,
      ...(mismatch === 'sourceKey'
        ? { sourceKey: {} }
        : mismatch === 'sourceTime'
          ? { sourceTime: 3 }
          : mismatch === 'passTime'
            ? { passTime: 2 }
            : mismatch === 'sourceSize'
              ? { sourceSize: { width: 17, height: 8 } }
              : {}),
    };
    await expect(
      prepareSourceSampling({
        budget: createPreparedSourceBudget(),
        source,
        identity,
        demands: mismatch === 'duplicate' ? [demand, changed] : [changed],
        enhancer,
      })
    ).rejects.toThrow('identity');
    expect(enhancer.withEnhancedRegion).not.toHaveBeenCalled();
  }
);

it('rejects original-source size mismatches and missing or uncovered draw demands', async () => {
  const { source, identity, demand } = fixture();
  const enhancer = tileDriver();
  await expect(
    prepareSourceSampling({
      budget: createPreparedSourceBudget(),
      source,
      identity: { ...identity, sourceSize: { width: 20, height: 8 } },
      demands: [demand],
      enhancer,
    })
  ).rejects.toThrow('dimensions');
  const prepared = await prepareSourceSampling({
    budget: createPreparedSourceBudget(),
    source,
    identity,
    demands: [demand],
    enhancer,
  });
  expect(() => prepared.sampling.visitPreparedTiles('sceneLens:0', vi.fn())).toThrow('missing');
  expect(() =>
    prepared.sampling.drawPrepared(
      'body',
      source.getContext('2d')!,
      { x: 0, y: 0, width: 1921, height: 8 },
      { x: 0, y: 0, width: 34, height: 16 }
    )
  ).toThrow('exceeds');
  prepared.dispose();
});

it('supports sub-ROI drawing without changing source phase or destination geometry', async () => {
  const { source, identity, demand } = fixture();
  const prepared = await prepareSourceSampling({
    budget: createPreparedSourceBudget(),
    source,
    identity,
    demands: [demand],
    enhancer: tileDriver(),
  });
  const output = document.createElement('canvas');
  output.width = 16;
  output.height = 8;
  prepared.sampling.drawPrepared(
    'body',
    output.getContext('2d')!,
    { x: 480, y: 0, width: 960, height: 8 },
    { x: 0, y: 0, width: 16, height: 8 }
  );
  expect([...output.getContext('2d')!.getImageData(2, 4, 1, 1).data]).toEqual([255, 0, 0, 255]);
  expect([...output.getContext('2d')!.getImageData(13, 4, 1, 1).data]).toEqual([0, 0, 255, 255]);
  prepared.dispose();
});

it('discards owned tiles on partial failure while preserving the borrowed source and enhancer', async () => {
  const { source, identity, demand } = fixture();
  const enhancer = tileDriver();
  const createElement = vi.spyOn(document, 'createElement');
  enhancer.withEnhancedRegion.mockImplementation(async (_request, consume) => {
    await consume({
      image: enhancer.image,
      sourceRect: { x: 0, y: 0, width: 16, height: 16 },
      destination: { x: 0, y: 0, width: 1920, height: 16 },
    });
    throw new Error('Second tile failed');
  });
  await expect(
    prepareSourceSampling({
      budget: createPreparedSourceBudget(),
      source,
      identity,
      demands: [demand],
      enhancer,
    })
  ).rejects.toThrow('Second tile failed');
  const copies = createElement.mock.results.flatMap((result) =>
    result.type === 'return' && result.value instanceof HTMLCanvasElement ? [result.value] : []
  );
  expect(copies).toHaveLength(1);
  expect(copies[0]?.width).toBe(0);
  expect(source.width).toBe(1920);
  expect(enhancer.image.width).toBe(16);
});

it('checks abort after a late backend and refuses incomplete selected-mode output', async () => {
  const { source, identity, demand } = fixture();
  const controller = new AbortController();
  const enhancer = tileDriver();
  enhancer.withEnhancedRegion.mockImplementation(async () => {
    controller.abort();
    return { applied: false, tileCount: 0 };
  });
  await expect(
    prepareSourceSampling({
      budget: createPreparedSourceBudget(),
      source,
      identity,
      demands: [demand],
      enhancer,
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  enhancer.withEnhancedRegion.mockResolvedValue({ applied: true, tileCount: 1 });
  await expect(
    prepareSourceSampling({
      budget: createPreparedSourceBudget(),
      source,
      identity,
      demands: [demand],
      enhancer,
    })
  ).rejects.toThrow('incomplete');
});

it('refuses an exhausted shared tile budget before the backend starts', async () => {
  const { source, identity, demand } = fixture();
  const enhancer = tileDriver();
  const budget = createPreparedSourceBudget();
  const release = Array.from({ length: 64 }, () => budget.reserve(1, 1));
  await expect(
    prepareSourceSampling({ source, identity, demands: [demand], enhancer, budget })
  ).rejects.toMatchObject({ name: 'EffectRuntimeResourceError' });
  expect(enhancer.withEnhancedRegion).not.toHaveBeenCalled();
  for (const dispose of release) dispose();
  expect(budget.snapshot()).toEqual({ bytes: 0, entries: 0 });
});

it('refuses an extreme projected output before enhancer or canvas allocation', async () => {
  const { source, identity, demand } = fixture();
  const enhancer = tileDriver();
  const allocation = vi.spyOn(document, 'createElement');
  const budget = createPreparedSourceBudget();
  const extreme = {
    ...demand,
    originalPixelROI: { x: 0, y: 0, width: 1, height: 1 },
    sourceToOutputHomography: [100000, 0, 0, 0, 100000, 0, 0, 0, 1] as const,
    targetRasterSize: { width: 100000, height: 100000 },
  };
  await expect(
    prepareSourceSampling({ source, identity, demands: [extreme], enhancer, budget })
  ).rejects.toMatchObject({ name: 'EffectRuntimeResourceError' });
  expect(enhancer.withEnhancedRegion).not.toHaveBeenCalled();
  expect(allocation).not.toHaveBeenCalled();
  expect(budget.snapshot()).toEqual({ bytes: 0, entries: 0 });
});

it('shares the source budget and admits tiled4K and lens demands after release', async () => {
  const first = fixture(),
    second = fixture();
  for (const item of [first, second]) {
    item.source.width = 1920;
    item.source.height = 1080;
  }
  const budget = createPreparedSourceBudget();
  const original = document.createElement('canvas');
  original.width = 1;
  original.height = 1;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D
  );
  const enhancer = {
    withEnhancedRegion: vi.fn<ExportEnhancer['withEnhancedRegion']>(async (_request, consume) => {
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++)
          await consume({
            image: original,
            sourceRect: { x: 0, y: 0, width: 1, height: 1 },
            destination: { x: x * 1920, y: y * 1080, width: 1920, height: 1080 },
          });
      return { applied: true, tileCount: 4 };
    }),
  };
  const identity = (item: typeof first) => ({
    ...item.identity,
    sourceSize: { width: 1920, height: 1080 },
  });
  const demands = (item: typeof first, count: number): SourceSamplingDemand[] =>
    Array.from({ length: count }, (_value, index) => ({
      ...item.demand,
      ...identity(item),
      id: index ? 'sceneLens:' + index : 'body',
      originalPixelROI: { x: 0, y: 0, width: 1920, height: 1080 },
      targetRasterSize: { width: 3840, height: 2160 },
    }));
  const prepared = await prepareSourceSampling({
    source: first.source,
    identity: identity(first),
    demands: demands(first, 2),
    enhancer,
    budget,
  });
  expect(budget.snapshot()).toEqual({ bytes: 2 * 3840 * 2160 * 4, entries: 8 });
  await expect(
    prepareSourceSampling({
      source: second.source,
      identity: identity(second),
      demands: demands(second, 3),
      enhancer,
      budget,
    })
  ).rejects.toMatchObject({ name: 'EffectRuntimeResourceError' });
  expect(budget.snapshot()).toEqual({ bytes: 2 * 3840 * 2160 * 4, entries: 8 });
  prepared.dispose();
  expect(budget.snapshot()).toEqual({ bytes: 0, entries: 0 });
  const retry = await prepareSourceSampling({
    source: second.source,
    identity: identity(second),
    demands: demands(second, 3),
    enhancer,
    budget,
  });
  expect(budget.snapshot()).toEqual({ bytes: 3 * 3840 * 2160 * 4, entries: 12 });
  retry.dispose();
  expect(budget.snapshot()).toEqual({ bytes: 0, entries: 0 });
});

it('shares aggregate bytes between raster and scratch reservations and releases each only once', () => {
  const budget = createPreparedSourceBudget();
  const raster = budget.reserve(1, 1);
  const scratch = budget.reserveBytes(EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes - 4);
  const full = { bytes: EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes, entries: 1 };
  expect(budget.snapshot()).toEqual(full);
  expect(() => budget.reserveBytes(1)).toThrow(EffectRuntimeResourceError);
  expect(() => budget.reserve(1, 1)).toThrow(EffectRuntimeResourceError);
  expect(budget.snapshot()).toEqual(full);
  scratch();
  scratch();
  expect(budget.snapshot()).toEqual({ bytes: 4, entries: 1 });
  const retry = budget.reserveBytes(1);
  expect(budget.snapshot()).toEqual({ bytes: 5, entries: 1 });
  retry();
  retry();
  raster();
  raster();
  expect(budget.snapshot()).toEqual({ bytes: 0, entries: 0 });
});

it('does not charge byte reservations against the existing 64 raster slots', () => {
  const budget = createPreparedSourceBudget();
  const rasters = Array.from({ length: 64 }, () => budget.reserve(1, 1));
  const scratch = budget.reserveBytes(8);
  expect(budget.snapshot()).toEqual({ bytes: 264, entries: 64 });
  expect(() => budget.reserve(1, 1)).toThrow(EffectRuntimeResourceError);
  expect(budget.snapshot()).toEqual({ bytes: 264, entries: 64 });
  scratch();
  rasters.forEach((release) => release());
  expect(budget.snapshot()).toEqual({ bytes: 0, entries: 0 });
});

it.each([
  0,
  -1,
  0.5,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
  EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes + 1,
])('refuses invalid byte count %s before changing live reservations', (count) => {
  const budget = createPreparedSourceBudget();
  const raster = budget.reserve(2, 2);
  expect(() => budget.reserveBytes(count)).toThrow(EffectRuntimeResourceError);
  expect(budget.snapshot()).toEqual({ bytes: 16, entries: 1 });
  raster();
  expect(budget.snapshot()).toEqual({ bytes: 0, entries: 0 });
});

it('maps retained enhanced tiles into GPU source coordinates without reducing their density', async () => {
  const { source, identity, demand } = fixture();
  const prepared = await prepareSourceSampling({
    budget: createPreparedSourceBudget(),
    source,
    identity,
    demands: [demand],
    enhancer: tileDriver(),
  });
  try {
    const gpu = preparedSourceGpuLayers(prepared.sampling, 'body', {
      x: 10,
      y: 20,
      width: 960,
      height: 4,
    });
    expect(gpu?.density).toBe(4);
    expect(gpu?.layers.map(({ rect }) => rect)).toEqual([
      { x: 10, y: 20, width: 480, height: 4 },
      { x: 490, y: 20, width: 480, height: 4 },
    ]);
    expect(gpu?.layers.map(({ source }) => source)).toEqual([
      expect.objectContaining({ width: 1920, height: 16 }),
      expect.objectContaining({ width: 1920, height: 16 }),
    ]);
    expect(() =>
      preparedSourceGpuLayers(prepared.sampling, 'missing', { x: 0, y: 0, width: 1, height: 1 })
    ).toThrow();
  } finally {
    prepared.dispose();
  }
  expect(() =>
    preparedSourceGpuLayers(prepared.sampling, 'body', { x: 0, y: 0, width: 1, height: 1 })
  ).toThrow('disposed');
});

it('preserves a physical tile crop and declines an unchanged source without allocating a raster', () => {
  const image = document.createElement('canvas');
  image.width = image.height = 16;
  const sampling = {
    sourceKey: image,
    sourceTime: 0,
    passTime: 0,
    sourceSize: { width: 16, height: 16 },
    drawPrepared: () => false,
    visitPreparedTiles: (
      id: string,
      consume: (tile: import('../draw/media-source').PreparedSourceTile) => void
    ) => {
      if (id === 'unchanged') return false;
      consume({
        image,
        physicalSourceRect: { x: 4, y: 4, width: 8, height: 8 },
        originalPixelROI: { x: 0, y: 0, width: 16, height: 16 },
      });
      return true;
    },
  };
  expect(
    preparedSourceGpuLayers(sampling, 'unchanged', { x: 0, y: 0, width: 32, height: 32 })
  ).toBeNull();
  const gpu = preparedSourceGpuLayers(sampling, 'crop', { x: 0, y: 0, width: 32, height: 32 });
  expect(gpu?.density).toBe(0.25);
  expect(gpu?.layers[0]?.source).toMatchObject({
    kind: 'group',
    output: { width: 8, height: 8 },
    logical: { width: 8, height: 8 },
    layers: [{ source: image, rect: { x: -4, y: -4, width: 16, height: 16 } }],
  });
  expect(() =>
    preparedSourceGpuLayers(sampling, 'crop', { x: 0, y: 0, width: 0, height: 1 })
  ).toThrow(RangeError);
});

it('expands opted-in source support at the original demand density without changing its identity', async () => {
  const { source, identity, demand } = fixture();
  const requested = {
    ...demand,
    originalPixelROI: { x: 480, y: 0, width: 960, height: 8 },
    targetRasterSize: { width: 1920, height: 16 },
  };
  const before = structuredClone(requested);
  const enhancer = tileDriver();
  const prepared = await prepareSourceSampling({
    source,
    identity,
    demands: [requested],
    enhancer,
    budget: createPreparedSourceBudget(),
    fullSourceSupport: true,
  });
  const request = enhancer.withEnhancedRegion.mock.calls[0]![0];
  expect(request.roi).toEqual({ x: 0, y: 0, width: 1920, height: 8 });
  expect(request.targetSize).toEqual({ width: 3840, height: 16 });
  expect(prepared.sampling.sourceKey).toBe(identity.sourceKey);
  expect(prepared.sampling.sourceTime).toBe(2);
  expect(prepared.sampling.passTime).toBe(1);
  expect(requested).toEqual(before);
  const filters = { version: 1 as const, filters: [createSourceImageFilter('blur', 'blur')] };
  const filtered = preparedSourceGpuLayers(
    prepared.sampling,
    'body',
    { x: 10, y: 5, width: 960, height: 4 },
    filters
  )!;
  expect(filtered.layers).toHaveLength(1);
  expect(filtered.layers[0]!.imageFilters).toEqual({
    stack: filters,
    logical: identity.sourceSize,
    projectTime: 0,
  });
  const group = filtered.layers[0]!.source;
  if (!('kind' in group) || group.kind !== 'group')
    throw new Error('Expected contiguous source plane');
  expect(group.logical).toEqual(identity.sourceSize);
  expect(group.output).toEqual({ width: 3840, height: 16 });
  expect(group.layers).toHaveLength(2);
  expect(filtered.density).toBe(4);
  prepared.dispose();
});
it('retains the inactive source path when full support is requested without magnification', async () => {
  const { source, identity, demand } = fixture();
  const enhancer = tileDriver();
  const prepared = await prepareSourceSampling({
    source,
    identity,
    demands: [
      {
        ...demand,
        sourceToOutputHomography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        targetRasterSize: { ...identity.sourceSize },
      },
    ],
    enhancer,
    budget: createPreparedSourceBudget(),
    fullSourceSupport: true,
  });
  expect(enhancer.withEnhancedRegion).not.toHaveBeenCalled();
  expect(
    preparedSourceGpuLayers(
      prepared.sampling,
      'body',
      { x: 0, y: 0, ...identity.sourceSize },
      { version: 1, filters: [createSourceImageFilter('blur', 'blur')] }
    )
  ).toBeNull();
  prepared.dispose();
});
it('keeps a visible demand density when an invisible part of the source crosses a projective horizon', async () => {
  const { source, identity, demand } = fixture();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const enhancer = {
    withEnhancedRegion: vi.fn<ExportEnhancer['withEnhancedRegion']>(async (request, consume) => {
      const plan = planEnhancedRegion({
        mode: 'clark-x2',
        sourceSize: request.sourceSize,
        roi: request.roi,
        targetSize: request.targetSize,
        zoomActive: true,
      });
      for (const tile of plan.tiles)
        await consume({
          image: canvas,
          sourceRect: { x: 0, y: 0, width: 1, height: 1 },
          destination: tile.destination,
        });
      return { applied: true, tileCount: plan.tiles.length };
    }),
  };
  const requested = {
    ...demand,
    originalPixelROI: { x: 0, y: 0, width: 320, height: 8 },
    sourceToOutputHomography: [2, 0, 0, 0, 2, 0, -1 / 1600, 0, 1] as const,
    targetRasterSize: { width: 1280, height: 32 },
  };
  const prepared = await prepareSourceSampling({
    source,
    identity,
    demands: [requested],
    enhancer,
    budget: createPreparedSourceBudget(),
    fullSourceSupport: true,
  });
  expect(enhancer.withEnhancedRegion.mock.calls[0]![0].targetSize).toEqual({
    width: 7680,
    height: 32,
  });
  expect(
    preparedSourceGpuLayers(
      prepared.sampling,
      'body',
      { x: 0, y: 0, ...identity.sourceSize },
      { version: 1, filters: [createSourceImageFilter('bloom', 'bloom')] }
    )
  ).not.toBeNull();
  prepared.dispose();
});
it('refuses partial or overlapping prepared support while neutral stacks retain the original tiles', () => {
  const { identity } = fixture();
  const image = document.createElement('canvas');
  image.width = 960;
  image.height = 8;
  const partial = {
    ...identity,
    drawPrepared: () => true,
    visitPreparedTiles(
      _id: string,
      consume: (tile: import('../draw/media-source').PreparedSourceTile) => void
    ) {
      consume({
        image,
        physicalSourceRect: { x: 0, y: 0, width: 960, height: 8 },
        originalPixelROI: { x: 0, y: 0, width: 960, height: 8 },
      });
      return true;
    },
  };
  const destination = { x: 0, y: 0, ...identity.sourceSize };
  expect(
    preparedSourceGpuLayers(partial, 'body', destination, {
      version: 1,
      filters: [createSourceImageFilter('color', 'neutral')],
    })
  ).not.toBeNull();
  const filters = { version: 1 as const, filters: [createSourceImageFilter('blur', 'blur')] };
  expect(() => preparedSourceGpuLayers(partial, 'body', destination, filters)).toThrow();
  const overlapping = {
    ...partial,
    visitPreparedTiles(
      id: string,
      consume: (tile: import('../draw/media-source').PreparedSourceTile) => void
    ) {
      partial.visitPreparedTiles(id, consume);
      partial.visitPreparedTiles(id, consume);
      return true;
    },
  };
  expect(() => preparedSourceGpuLayers(overlapping, 'body', destination, filters)).toThrow();
});

it('releases expanded source reservations before a refused backend allocation can start', async () => {
  const { source, identity, demand } = fixture();
  const enhancer = tileDriver();
  const release = vi.fn();
  const reserve = vi
    .fn()
    .mockReturnValueOnce(release)
    .mockImplementationOnce(() => {
      throw new Error('Support budget refused.');
    });
  await expect(
    prepareSourceSampling({
      source,
      identity,
      fullSourceSupport: true,
      demands: [
        {
          ...demand,
          originalPixelROI: { x: 480, y: 0, width: 960, height: 8 },
          targetRasterSize: { width: 1920, height: 16 },
        },
      ],
      enhancer,
      budget: { reserve, reserveBytes: vi.fn() },
    })
  ).rejects.toThrow('Support budget refused');
  expect(enhancer.withEnhancedRegion).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledOnce();
  expect(source.width).toBe(1920);
  expect(demand.originalPixelROI).toEqual({ x: 0, y: 0, width: 1920, height: 8 });
});

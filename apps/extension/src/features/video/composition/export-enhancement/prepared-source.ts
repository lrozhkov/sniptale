import type { ExportEnhancer } from './enhancer';
import { planEnhancedRegion } from './region-plan';
import { samplingRasterSize } from './projection-density';
import type {
  PreparedSourceSampling,
  PreparedSourceTile,
  SourceSamplingDemand,
  SourceSamplingIdentity,
  SourceSamplingRect,
} from '../draw/media-source';
import {
  assertEffectDecodedRaster,
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from '../effect-runtime/runtime/resource-limits';

// Composed double-precision transforms can differ from unit density by rounding noise.
const UNIT_DENSITY_TOLERANCE = 1e-9;
function growth(demand: SourceSamplingDemand) {
  planEnhancedRegion({
    mode: 'off',
    sourceSize: demand.sourceSize,
    roi: demand.originalPixelROI,
    targetSize: demand.targetRasterSize,
    zoomActive: true,
  });
  const raster = samplingRasterSize({
    roi: demand.originalPixelROI,
    projection: demand.sourceToOutputHomography,
    ...(demand.lensScale === undefined ? {} : { lensScale: demand.lensScale }),
  });
  const applied = raster.density > 1 + UNIT_DENSITY_TOLERANCE;
  if (
    applied &&
    (demand.targetRasterSize.width < raster.width || demand.targetRasterSize.height < raster.height)
  )
    throw new RangeError('Prepared source raster does not cover the projected density.');
  return applied;
}
/** Geometry owners must supply every demand in the requested export window. */
export function hasMagnificationDemand(demands: readonly SourceSamplingDemand[]): boolean {
  let result = false;
  for (const demand of demands) {
    if (
      !demand.id ||
      !demand.sourceKey ||
      typeof demand.sourceKey !== 'object' ||
      !Number.isFinite(demand.sourceTime) ||
      !Number.isFinite(demand.passTime)
    )
      throw new TypeError('Invalid source sampling identity.');
    result = growth(demand) || result;
  }
  return result;
}
function matchingIdentity(a: SourceSamplingIdentity, b: SourceSamplingIdentity) {
  return (
    a.sourceKey === b.sourceKey &&
    a.sourceTime === b.sourceTime &&
    a.passTime === b.passTime &&
    a.sourceSize.width === b.sourceSize.width &&
    a.sourceSize.height === b.sourceSize.height
  );
}
function validRect(rect: SourceSamplingRect) {
  return (
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0
  );
}
function intrinsicSize(source: CanvasImageSource) {
  if ('videoWidth' in source) return { width: source.videoWidth, height: source.videoHeight };
  if ('naturalWidth' in source) return { width: source.naturalWidth, height: source.naturalHeight };
  if ('displayWidth' in source) return { width: source.displayWidth, height: source.displayHeight };
  return { width: source.width, height: source.height };
}

export interface PreparedSourceBudget {
  reserve(width: number, height: number): () => void;
  reserveBytes(count: number): () => void;
}
/** One pass shares this budget across all simultaneous source and scratch leases. */
export function createPreparedSourceBudget() {
  let bytes = 0;
  let entries = 0;
  const retain = (count: number, slots: number) => {
    if (
      !Number.isSafeInteger(count) ||
      count <= 0 ||
      count > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes - bytes ||
      entries + slots > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterEntries
    )
      throw new EffectRuntimeResourceError();
    bytes += count;
    entries += slots;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      bytes -= count;
      entries -= slots;
    };
  };
  return {
    reserve: (width: number, height: number) => retain(assertEffectDecodedRaster(width, height), 1),
    reserveBytes: (count: number) => retain(count, 0),
    snapshot: () => ({ bytes, entries }),
  };
}

/** Materializes one immutable source/pass lease. The job retains ownership of the enhancer and source. */
export async function prepareSourceSampling(args: {
  enhancer: Pick<ExportEnhancer, 'withEnhancedRegion'>;
  budget: PreparedSourceBudget;
  identity: SourceSamplingIdentity;
  source: CanvasImageSource;
  demands: readonly SourceSamplingDemand[];
  signal?: AbortSignal;
  document?: Pick<Document, 'createElement'>;
}): Promise<{ sampling: PreparedSourceSampling; dispose(): void }> {
  args.signal?.throwIfAborted();
  const identity = Object.freeze({
    ...args.identity,
    sourceSize: Object.freeze({ ...args.identity.sourceSize }),
  });
  if (
    !identity.sourceKey ||
    typeof identity.sourceKey !== 'object' ||
    !Number.isFinite(identity.sourceTime) ||
    !Number.isFinite(identity.passTime) ||
    ![identity.sourceSize.width, identity.sourceSize.height].every(
      (value) => Number.isSafeInteger(value) && value > 0
    )
  )
    throw new TypeError('Invalid source sampling identity.');
  const intrinsic = intrinsicSize(args.source);
  if (
    intrinsic.width !== identity.sourceSize.width ||
    intrinsic.height !== identity.sourceSize.height
  )
    throw new RangeError('Prepared source dimensions do not match the decoded source.');
  const demands = new Map<
    string,
    {
      demand: SourceSamplingDemand;
      magnified: boolean;
      tiles: PreparedSourceTile[];
      applied: boolean;
      planned: ReturnType<typeof planEnhancedRegion>['tiles'];
      reservations: (() => void)[];
    }
  >();
  for (const input of args.demands) {
    if (!matchingIdentity(input, identity) || !input.id || demands.has(input.id))
      throw new TypeError('Prepared source demand identity does not match its pass.');
    const demand: SourceSamplingDemand = {
      ...input,
      originalPixelROI: { ...input.originalPixelROI },
      targetRasterSize: { ...input.targetRasterSize },
      sourceToOutputHomography: [...input.sourceToOutputHomography],
    };
    // Validate every demand, including inactive ones, before allocating or starting a backend.
    hasMagnificationDemand([demand]);
    demands.set(demand.id, {
      demand,
      magnified: growth(demand),
      tiles: [],
      applied: false,
      planned: [],
      reservations: [],
    });
  }
  let disposed = false;
  const releases: (() => void)[] = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const item of demands.values())
      for (const tile of item.tiles) tile.image.width = tile.image.height = 0;
    demands.clear();
    for (const release of releases) release();
    releases.length = 0;
  };
  const entry = (id: string) => {
    args.signal?.throwIfAborted();
    if (disposed) throw new Error('Prepared source pass is disposed.');
    const item = demands.get(id);
    if (!item) throw new Error('Prepared source demand is missing.');
    return item;
  };
  try {
    // Admit all physical destinations before a backend can allocate its output canvas.
    for (const item of demands.values()) {
      if (!item.magnified) continue;
      item.planned = planEnhancedRegion({
        mode: 'clark-x2',
        sourceSize: identity.sourceSize,
        roi: item.demand.originalPixelROI,
        targetSize: item.demand.targetRasterSize,
        zoomActive: true,
      }).tiles;
      for (const tile of item.planned) {
        const release = args.budget.reserve(tile.destination.width, tile.destination.height);
        releases.push(release);
        item.reservations.push(release);
      }
    }
    for (const item of demands.values()) {
      const { demand } = item;
      if (!item.magnified) continue;
      const result = await args.enhancer.withEnhancedRegion(
        {
          source: args.source,
          sourceSize: identity.sourceSize,
          roi: demand.originalPixelROI,
          targetSize: demand.targetRasterSize,
          zoomActive: true,
          ...(args.signal ? { signal: args.signal } : {}),
        },
        (tile) => {
          args.signal?.throwIfAborted();
          const size = tile.destination;
          const expected = item.planned[item.tiles.length]?.destination;
          if (
            !expected ||
            size.x !== expected.x ||
            size.y !== expected.y ||
            size.width !== expected.width ||
            size.height !== expected.height
          )
            throw new Error('Prepared source tile does not match its demand.');
          let image: HTMLCanvasElement | undefined;
          try {
            image = (args.document ?? globalThis.document).createElement('canvas');
            image.width = size.width;
            image.height = size.height;
            const context = image.getContext('2d', { alpha: false, colorSpace: 'srgb' });
            if (!context) throw new Error('Prepared source tile is unavailable.');
            const crop = tile.sourceRect;
            context.drawImage(
              tile.image,
              crop.x,
              crop.y,
              crop.width,
              crop.height,
              0,
              0,
              image.width,
              image.height
            );
            const roi = demand.originalPixelROI;
            item.tiles.push({
              image,
              physicalSourceRect: { x: 0, y: 0, width: image.width, height: image.height },
              originalPixelROI: {
                x: roi.x + (size.x * roi.width) / demand.targetRasterSize.width,
                y: roi.y + (size.y * roi.height) / demand.targetRasterSize.height,
                width: (size.width * roi.width) / demand.targetRasterSize.width,
                height: (size.height * roi.height) / demand.targetRasterSize.height,
              },
            });
          } catch (error) {
            if (image) image.width = image.height = 0;
            throw error;
          }
        }
      );
      args.signal?.throwIfAborted();
      item.applied = result.applied;
      if (!result.applied) {
        if (item.tiles.length) throw new Error('Prepared source tiles are incomplete.');
        for (const release of item.reservations) release();
      }
      if (
        result.applied &&
        (!item.tiles.length ||
          item.tiles.length !== result.tileCount ||
          item.tiles.length !== item.planned.length)
      )
        throw new Error('Prepared source tiles are incomplete.');
    }
    const sampling: PreparedSourceSampling = {
      ...identity,
      visitPreparedTiles(id, consume) {
        const item = entry(id);
        if (!item.applied) return false;
        for (const tile of item.tiles) {
          entry(id);
          consume(tile);
        }
        return true;
      },
      drawPrepared(id, context, roi, destination) {
        const item = entry(id);
        if (!validRect(roi) || !validRect(destination))
          throw new RangeError('Prepared source draw bounds are invalid.');
        if (!item.applied) return false;
        const coverage = item.demand.originalPixelROI;
        const tolerance = 1e-9;
        if (
          roi.x < coverage.x - tolerance ||
          roi.y < coverage.y - tolerance ||
          roi.x + roi.width > coverage.x + coverage.width + tolerance ||
          roi.y + roi.height > coverage.y + coverage.height + tolerance
        )
          throw new RangeError('Prepared source draw exceeds its demand.');
        for (const tile of item.tiles) {
          const source = tile.originalPixelROI;
          const x = Math.max(roi.x, source.x),
            y = Math.max(roi.y, source.y);
          const width = Math.min(roi.x + roi.width, source.x + source.width) - x;
          const height = Math.min(roi.y + roi.height, source.y + source.height) - y;
          if (width <= 0 || height <= 0) continue;
          context.drawImage(
            tile.image,
            ((x - source.x) * tile.image.width) / source.width,
            ((y - source.y) * tile.image.height) / source.height,
            (width * tile.image.width) / source.width,
            (height * tile.image.height) / source.height,
            destination.x + ((x - roi.x) * destination.width) / roi.width,
            destination.y + ((y - roi.y) * destination.height) / roi.height,
            (width * destination.width) / roi.width,
            (height * destination.height) / roi.height
          );
        }
        return true;
      },
    };
    return { sampling, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

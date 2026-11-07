import {
  closeEffectRuntimeBitmaps,
  isImageBitmap,
} from '../../../../../contracts/effect-runtime/bitmap-lifetime';
import { isRecord } from '../../../../../contracts/effect-runtime/identity';

export const EFFECT_RUNTIME_RESOURCE_LIMITS = {
  maxAggregateCanvasPixelsPerFrame: 4 * 3840 * 2160,
  maxConsecutiveFailures: 3,
  maxAudioDecodeConcurrency: 2,
  maxAudioDecodeQueueDepth: 2,
  maxDecodedAudioCacheEntries: 32,
  maxDecodedAudioBytes: 128 * 1024 * 1024,
  maxDecodedRasterEntries: 64,
  maxDecodedRasterBytes: 128 * 1024 * 1024,
  maxInputFrames: 2,
  maxLiveCanvases: 8,
  maxOutputPixels: 3840 * 2160,
  maxQueueDepth: 2,
  mediaDecodeTimeoutMs: 3_000,
  renderTimeoutMs: 1_500,
  sandboxLoadTimeoutMs: 1_500,
  sandboxRequestTimeoutMs: 5_000,
} as const;

export class EffectRuntimeResourceError extends Error {
  readonly code = 'runtimeResourceLimit';

  constructor() {
    super('Effect runtime resource limit exceeded');
    this.name = 'EffectRuntimeResourceError';
  }
}

export function assertEffectRasterDimensions(width: unknown, height: unknown): number {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > Math.floor(EFFECT_RUNTIME_RESOURCE_LIMITS.maxOutputPixels / height)
  ) {
    throw new EffectRuntimeResourceError();
  }
  return width * height;
}

export function createEffectFrameCanvasBudget() {
  let aggregatePixels = 0;
  let liveCanvases = 0;
  return {
    allocate(width: unknown, height: unknown): () => void {
      const pixels = assertEffectRasterDimensions(width, height);
      if (
        liveCanvases >= EFFECT_RUNTIME_RESOURCE_LIMITS.maxLiveCanvases ||
        aggregatePixels + pixels > EFFECT_RUNTIME_RESOURCE_LIMITS.maxAggregateCanvasPixelsPerFrame
      ) {
        throw new EffectRuntimeResourceError();
      }
      aggregatePixels += pixels;
      liveCanvases += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        liveCanvases -= 1;
      };
    },
    snapshot() {
      return { aggregatePixels, liveCanvases };
    },
  };
}

export interface EffectRuntimeFrameResourceScope {
  allocateCanvas(width: unknown, height: unknown): () => void;
  retainBitmap(bitmap: ImageBitmap, chargeAggregate?: boolean): void;
  snapshot(): {
    aggregatePixels: number;
    liveDecodedRasterBytes: number;
    liveRasterResources: number;
  };
}

interface EffectRuntimeCompositionResourceLedger {
  createFrameScope(): EffectRuntimeFrameResourceScope;
  snapshot(): { liveDecodedRasterBytes: number; liveRasterResources: number };
}

const bitmapReleases = new WeakMap<ImageBitmap, () => void>();

interface CompositionResourceState {
  liveDecodedRasterBytes: number;
  liveRasterResources: number;
}

export function createEffectRuntimeCompositionResourceLedger(): EffectRuntimeCompositionResourceLedger {
  const state: CompositionResourceState = {
    liveDecodedRasterBytes: 0,
    liveRasterResources: 0,
  };
  return {
    createFrameScope: () => createEffectRuntimeFrameResourceScope(state),
    snapshot: () => ({ ...state }),
  };
}

function createEffectRuntimeFrameResourceScope(
  state: CompositionResourceState
): EffectRuntimeFrameResourceScope {
  let aggregatePixels = 0;
  const admitRaster = (width: unknown, height: unknown, chargeAggregate = true): (() => void) => {
    const pixels = assertEffectRasterDimensions(width, height);
    if (
      chargeAggregate &&
      aggregatePixels + pixels > EFFECT_RUNTIME_RESOURCE_LIMITS.maxAggregateCanvasPixelsPerFrame
    ) {
      throw new EffectRuntimeResourceError();
    }
    const release = reserveEffectRuntimeRaster(state, width, height);
    if (chargeAggregate) aggregatePixels += pixels;
    return release;
  };
  return {
    allocateCanvas(width, height) {
      return admitRaster(width, height);
    },
    retainBitmap(bitmap, chargeAggregate = true) {
      if (bitmapReleases.has(bitmap)) throw new EffectRuntimeResourceError();
      bitmapReleases.set(bitmap, admitRaster(bitmap.width, bitmap.height, chargeAggregate));
    },
    snapshot: () => ({ aggregatePixels, ...state }),
  };
}

function reserveEffectRuntimeRaster(
  state: CompositionResourceState,
  width: unknown,
  height: unknown
): () => void {
  const bytes = assertEffectDecodedRaster(width, height);
  if (
    state.liveRasterResources >= EFFECT_RUNTIME_RESOURCE_LIMITS.maxLiveCanvases ||
    state.liveDecodedRasterBytes + bytes > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes
  ) {
    throw new EffectRuntimeResourceError();
  }
  state.liveRasterResources += 1;
  state.liveDecodedRasterBytes += bytes;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.liveRasterResources -= 1;
    state.liveDecodedRasterBytes -= bytes;
  };
}

export function releaseEffectRuntimeBitmap(bitmap: ImageBitmap): void {
  const release = bitmapReleases.get(bitmap);
  if (!release) return;
  bitmapReleases.delete(bitmap);
  release();
}

export function closeEffectRuntimeBitmap(bitmap: ImageBitmap): void {
  releaseEffectRuntimeBitmap(bitmap);
  bitmap.close();
}

export function assertEffectDecodedRaster(
  width: unknown,
  height: unknown,
  bytesPerPixel = 4
): number {
  const pixels = assertEffectRasterDimensions(width, height);
  const bytes = pixels * bytesPerPixel;
  if (
    !Number.isSafeInteger(bytesPerPixel) ||
    bytesPerPixel <= 0 ||
    !Number.isSafeInteger(bytes) ||
    bytes > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes
  ) {
    throw new EffectRuntimeResourceError();
  }
  return bytes;
}

export function assertEffectDecodedAudio(args: {
  channels: unknown;
  frames: unknown;
  sampleRate: unknown;
}): number {
  if (
    typeof args.channels !== 'number' ||
    typeof args.frames !== 'number' ||
    typeof args.sampleRate !== 'number' ||
    !Number.isSafeInteger(args.channels) ||
    !Number.isSafeInteger(args.frames) ||
    !Number.isFinite(args.sampleRate) ||
    args.channels <= 0 ||
    args.channels > 8 ||
    args.frames <= 0 ||
    args.sampleRate < 8_000 ||
    args.sampleRate > 192_000
  ) {
    throw new EffectRuntimeResourceError();
  }
  const bytes = args.channels * args.frames * 4;
  if (!Number.isSafeInteger(bytes) || bytes > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedAudioBytes) {
    throw new EffectRuntimeResourceError();
  }
  return bytes;
}

/** Close every flat-table handle once, even when malformed metadata prevents parsing. */
export function closeEffectRuntimeGpuPlanResources(value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value['resources'])) return;
  const closed = new Set<ImageBitmap>();
  for (const resource of value['resources']) {
    if (!isRecord(resource) || !isImageBitmap(resource['bitmap']) || closed.has(resource['bitmap']))
      continue;
    closed.add(resource['bitmap']);
    resource['bitmap'].close();
  }
}

/** Release scene output; oversized rejected tables yield between bounded cleanup tasks. */
export function closeEffectRuntimeGpuSceneResources(value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value['resources'])) {
    closeEffectRuntimeBitmaps(value);
    return;
  }
  const resources = value['resources'];
  if (resources.length <= 512) {
    closeEffectRuntimeGpuPlanResources(value);
    return;
  }
  const closed = new Set<ImageBitmap>();
  let offset = 0;
  const release = () => {
    const end = Math.min(offset + 512, resources.length);
    for (; offset < end; offset += 1) {
      const resource: unknown = resources[offset];
      if (
        !isRecord(resource) ||
        !isImageBitmap(resource['bitmap']) ||
        closed.has(resource['bitmap'])
      )
        continue;
      closed.add(resource['bitmap']);
      resource['bitmap'].close();
    }
    if (offset < resources.length) setTimeout(release, 0);
  };
  setTimeout(release, 0);
}

/** Account for live packet rasters until the last GPU borrow returns. */
export function createEffectRuntimeGpuFrameLedger(
  reserveBytes?: (bytes: number) => { release(): void },
  maximumInFlight: 1 | 2 = 1
) {
  let bytes = 0;
  return {
    createFrameScope() {
      let frameBytes = 0;
      return {
        reserve(rasters: readonly ImageBitmap[]) {
          const cost = rasters.reduce(
            (sum, raster) => sum + assertEffectDecodedRaster(raster.width, raster.height),
            0
          );
          const frameLimit = EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes;
          if (frameBytes + cost > frameLimit || bytes + cost > frameLimit * maximumInFlight)
            throw new EffectRuntimeResourceError();
          const reservation = reserveBytes?.(cost);
          frameBytes += cost;
          bytes += cost;
          let released = false;
          return {
            release() {
              if (released) return;
              released = true;
              frameBytes -= cost;
              bytes -= cost;
              reservation?.release();
            },
          };
        },
      };
    },
    snapshot: () => ({ liveDecodedRasterBytes: bytes }),
  };
}

import type { VideoExportDetailMode } from '../../project/types/export';
import { parseEnhancementMode } from './mode';
import {
  paintPaddedInput,
  planEnhancedRegion,
  type EnhancementRect,
  type EnhancementRegionRequest,
} from './region-plan';
import type { BicubicBackend } from './bicubic';
import type { ClarkBackend } from './vendor/clark-x2/realtimeVideoUpscaler.js';

export type ExportEnhancementErrorCode =
  | 'invalid-input'
  | 'unavailable'
  | 'initialization-failed'
  | 'device-lost'
  | 'invalid-output'
  | 'disposed'
  | 'busy';
export class ExportEnhancementError extends Error {
  constructor(
    readonly mode: VideoExportDetailMode,
    readonly code: ExportEnhancementErrorCode,
    cause?: unknown
  ) {
    super(`Export enhancement failed: ${code}`, { cause });
    this.name = 'ExportEnhancementError';
  }
}
export interface EnhancedRegionRequest extends Omit<EnhancementRegionRequest, 'mode'> {
  source: CanvasImageSource;
  signal?: AbortSignal;
  timestamp?: number;
}
export interface EnhancedRegionTile {
  image: HTMLCanvasElement | OffscreenCanvas;
  sourceRect: EnhancementRect;
  destination: EnhancementRect;
}
export interface ExportEnhancerOptions {
  mode?: VideoExportDetailMode;
  document?: Pick<Document, 'createElement'>;
  createClark?: (size: { width: number; height: number }) => Promise<ClarkBackend | null>;
  createBicubic?: (source: HTMLCanvasElement) => BicubicBackend | Promise<BicubicBackend>;
  createFrame?: (source: HTMLCanvasElement, options: VideoFrameInit) => VideoFrame;
}

export async function probeEnhancementCapabilities(gpuApi = globalThis.navigator?.gpu) {
  if (!gpuApi?.requestAdapter) return { clark: false, reason: 'webgpu-unavailable' } as const;
  try {
    const adapter = await gpuApi.requestAdapter();
    if (!adapter) return { clark: false, reason: 'adapter-unavailable' } as const;
    return {
      clark: adapter.features.has('shader-f16'),
      reason: adapter.features.has('shader-f16') ? 'supported' : 'shader-f16-unavailable',
    } as const;
  } catch {
    return { clark: false, reason: 'adapter-request-failed' } as const;
  }
}

async function createClarkBackend(size: { width: number; height: number }) {
  const [runtime, asset] = await Promise.all([
    import('./vendor/clark-x2/realtimeVideoUpscaler.js'),
    import('./vendor/clark-x2/model.bin?url'),
  ]);
  return runtime.createRealtimeVideoUpscaler({
    ...size,
    model: { ...runtime.REALTIME_VIDEO_MODEL, url: asset.default },
  });
}

/** One export job owns this session. The caller retains every source until drain completes. */
export function createExportEnhancer(options: ExportEnhancerOptions = {}) {
  const mode = parseEnhancementMode(options.mode);
  let closed = false;
  let active: Promise<void> | null = null;
  let clark: ClarkBackend | null = null;
  let bicubic: BicubicBackend | null = null;
  let input: HTMLCanvasElement | null = null;
  let dimensions = '';
  const fail = (code: ExportEnhancementErrorCode, cause?: unknown) =>
    new ExportEnhancementError(mode, code, cause);
  const check = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (closed) throw fail('disposed');
  };
  const backendError = (error: unknown, code: ExportEnhancementErrorCode) => {
    if (
      error instanceof ExportEnhancementError ||
      (error instanceof DOMException && error.name === 'AbortError')
    )
      return error;
    return fail(code, error);
  };
  const bicubicTile = (
    bicubic: BicubicBackend,
    tile: ReturnType<typeof planEnhancedRegion>['tiles'][number]
  ) => {
    let image: HTMLCanvasElement | OffscreenCanvas;
    let sourceRect: EnhancementRect;
    if (bicubic.gl.isContextLost()) throw fail('device-lost');
    const core = tile.coreInInput;
    try {
      image = bicubic.draw(
        [core.x, core.y, core.width, core.height],
        1,
        0.35,
        tile.destination.width,
        tile.destination.height
      );
      bicubic.gl.finish();
    } catch (error) {
      throw backendError(error, 'invalid-output');
    }
    if (bicubic.gl.isContextLost()) throw fail('device-lost');
    if (image.width !== tile.destination.width || image.height !== tile.destination.height)
      throw fail('invalid-output');
    sourceRect = { x: 0, y: 0, width: image.width, height: image.height };
    return { image, sourceRect };
  };
  const clarkTile = (
    clark: ClarkBackend,
    output: HTMLCanvasElement | null,
    input: HTMLCanvasElement,
    tile: ReturnType<typeof planEnhancedRegion>['tiles'][number]
  ) => {
    let image: HTMLCanvasElement | OffscreenCanvas;
    let sourceRect: EnhancementRect;
    if (clark.unavailable) throw fail('device-lost');
    if (
      !output ||
      !clark.ready ||
      output.width !== input.width * 2 ||
      output.height !== input.height * 2
    )
      throw fail('invalid-output');
    image = output;
    const core = tile.coreInInput;
    sourceRect = {
      x: core.x * 2,
      y: core.y * 2,
      width: core.width * 2,
      height: core.height * 2,
    };
    return { image, sourceRect };
  };
  return {
    /** The tile image remains valid only until the consume callback completes. */
    async withEnhancedRegion(
      request: EnhancedRegionRequest,
      consume: (tile: EnhancedRegionTile) => void | Promise<void>
    ) {
      check(request.signal);
      if (active) throw fail('busy');
      let plan;
      try {
        plan = planEnhancedRegion({ ...request, mode });
      } catch (error) {
        throw fail('invalid-input', error);
      }
      if (!plan.applied) return { applied: false, tileCount: 0 };
      let finish!: () => void;
      active = new Promise<void>((resolve) => {
        finish = resolve;
      });
      try {
        for (const tile of plan.tiles) {
          check(request.signal);
          try {
            input ??= (options.document ?? globalThis.document).createElement('canvas');
            if (input.width !== tile.input.width) input.width = tile.input.width;
            if (input.height !== tile.input.height) input.height = tile.input.height;
            const context = input.getContext('2d', { alpha: false, colorSpace: 'srgb' });
            if (!context) throw fail('unavailable');
            paintPaddedInput(context, request.source, request.sourceSize, tile.input);
          } catch (error) {
            throw backendError(error, 'invalid-input');
          }
          let image: HTMLCanvasElement | OffscreenCanvas;
          let sourceRect: EnhancementRect;
          if (mode === 'bicubic-sharpen') {
            if (!bicubic) {
              try {
                bicubic = await (
                  options.createBicubic ??
                  (async (source) => (await import('./bicubic')).createBicubic(source))
                )(input);
              } catch (error) {
                throw backendError(error, 'initialization-failed');
              }
            } else {
              try {
                bicubic.update(input);
              } catch (error) {
                throw backendError(
                  error,
                  bicubic.gl.isContextLost() ? 'device-lost' : 'invalid-output'
                );
              }
            }
            check(request.signal);
            ({ image, sourceRect } = bicubicTile(bicubic, tile));
          } else {
            const key = `${input.width}x${input.height}`;
            if (dimensions !== key) {
              clark?.destroy();
              clark = null;
              dimensions = '';
              try {
                clark = await (options.createClark ?? createClarkBackend)({
                  width: input.width,
                  height: input.height,
                });
              } catch (error) {
                throw backendError(error, 'initialization-failed');
              }
              if (!clark) throw fail('unavailable');
              dimensions = key;
            }
            check(request.signal);
            if (!clark || clark.unavailable) throw fail('device-lost');
            let frame: VideoFrame;
            try {
              frame = (options.createFrame ?? ((source, init) => new VideoFrame(source, init)))(
                input,
                { timestamp: request.timestamp ?? 0, alpha: 'discard' }
              );
            } catch (error) {
              throw backendError(error, 'invalid-input');
            }
            let output: HTMLCanvasElement | null;
            try {
              output = await clark.enhance(frame);
            } catch (error) {
              throw backendError(error, clark.unavailable ? 'device-lost' : 'invalid-output');
            } finally {
              frame.close();
            }
            check(request.signal);
            ({ image, sourceRect } = clarkTile(clark, output, input, tile));
          }
          check(request.signal);
          await consume({ image, sourceRect, destination: tile.destination });
          check(request.signal);
        }
        return { applied: true, tileCount: plan.tiles.length };
      } finally {
        finish();
        active = null;
      }
    },
    async dispose() {
      closed = true;
      if (active) await active;
      clark?.destroy();
      clark = null;
      dimensions = '';
      bicubic?.dispose();
      bicubic = null;
      if (input) input.width = input.height = 0;
      input = null;
    },
  };
}
export type ExportEnhancer = ReturnType<typeof createExportEnhancer>;

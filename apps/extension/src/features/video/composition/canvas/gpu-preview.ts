import type { CameraSpatialFrame, CameraSpatialRect } from '../../project/motion/spatial';
import type { QuickEditHomography } from '../motion/spatial-geometry';
import { quickEditRotationMatrix } from '../motion/spatial-geometry';
import { gpuPreviewShader } from './gpu-preview-shaders';
import { createGpuPreviewFilter } from './gpu-preview-filter';
import { createGpuPreviewCssFilter } from './gpu-preview-css-filter';
import { prepareDecodedVideoFrame } from '../draw/decoded-sample';

type Size = { width: number; height: number };
type Reservation = { release(): void };
type Raster = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

/** Hardware availability/loss permits the existing renderer; invalid scene plans remain errors. */
export class GpuPreviewDeviceError extends Error {
  override name = 'GpuPreviewDeviceError';
}

/** A retained scene description becomes a GPU render target, never a CPU-composited screenshot. */
export interface GpuPreviewGroup {
  kind: 'group';
  output: Size;
  logical: Size;
  layers: readonly GpuPreviewLayer[];
}

/** A layer borrows its source through completion; inverse maps output logical points to its plane. */
export interface GpuPreviewLayer {
  source: Raster | VideoFrame | GpuPreviewGroup;
  rect: CameraSpatialRect;
  inverse: QuickEditHomography;
  clip?: { rect: CameraSpatialRect; radius: number; shape?: 'ellipse' };
  lens?: {
    bounds: CameraSpatialRect;
    scale: number;
    optics: 'flat' | 'optical';
    edgeWidth: number;
    corner: number | 'circle';
  };
  blur?: number;
  depth?: {
    frame: CameraSpatialFrame;
    window: CameraSpatialRect;
    planeInverse?: QuickEditHomography;
  };
  opacity?: number;
  orientation?: { rotation: 0 | 90 | 180 | 270; flip: boolean };
  /** Fuses an RGBA8 source write and destination-in raster mask in the source plane. */
  alphaMask?: {
    source: Raster;
    rect: CameraSpatialRect;
    cache?: { key: string; revision: object | string | number };
  };
  blend?: 'over' | 'add' | 'mask' | 'erase' | 'screen' | 'atop';
  cssFilter?: { blur?: number; brightness?: number; saturate?: number };
  tint?: readonly [number, number, number, number];
  /** Coverage of the destination operation, not a mask in the source plane. */
  operationClip?: {
    source: Raster;
    cache?: { key: string; revision: object | string | number };
  };
  cache?: { key: string; revision: object | string | number };
}

/** The caller retains frame/publication authority and closes each returned bitmap. */
export interface GpuPreviewRenderer {
  readonly allocatedBytes: number;
  render(args: {
    output: Size;
    logical: Size;
    layers: readonly GpuPreviewLayer[];
    signal: AbortSignal;
  }): Promise<ImageBitmap>;
  dispose(): void;
}

const MAX_LAYERS = 64;
const MAX_RENDER_LAYERS = 512;
const MAX_TEXTURE_BYTES = 256 * 1024 * 1024;
/** Explicit per-layer GPU storage, also used by preview admission before allocation. */
export const GPU_PREVIEW_UNIFORM_BYTES = 336;
const UNIFORM_BYTES = GPU_PREVIEW_UNIFORM_BYTES;
// WebGPU IDL flag values; the DOM types currently omit the GPU*Usage namespace constants.
const TEXTURE_USAGE = 0x02 | 0x04 | 0x10;
const UNIFORM_USAGE = 0x08 | 0x40;

function isGroup(source: GpuPreviewLayer['source']): source is GpuPreviewGroup {
  return 'kind' in source && source.kind === 'group';
}

function validSize(size: Size, maximum: number) {
  if (
    !Number.isSafeInteger(size.width) ||
    !Number.isSafeInteger(size.height) ||
    size.width <= 0 ||
    size.height <= 0 ||
    size.width > maximum ||
    size.height > maximum
  )
    throw new Error('GPU preview dimensions are unavailable.');
}

function validRect(rect: CameraSpatialRect) {
  if (!Object.values(rect).every(Number.isFinite) || rect.width <= 0 || rect.height <= 0)
    throw new Error('GPU preview geometry is unavailable.');
}

function validLogicalSize(size: Size) {
  if (
    ![size.width, size.height].every(
      (value) => Number.isFinite(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER
    )
  )
    throw new Error('GPU preview logical dimensions are unavailable.');
}

function layerValues(layer: GpuPreviewLayer, output: Size, logical: Size) {
  const m = layer.inverse;
  const r = layer.rect;
  const clip = layer.clip?.rect ?? r;
  validRect(r);
  validRect(clip);
  const opacity = layer.opacity ?? 1;
  const radius = layer.clip?.radius ?? 0;
  const lens = layer.lens;
  const depth = layer.depth;
  const plane = depth?.planeInverse ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const window = depth?.window ?? r;
  const focusA = depth?.frame.focus[0];
  const focusB = depth?.frame.focus[1];
  const rotation = depth ? quickEditRotationMatrix(depth.frame.rotation) : [];
  const orientation = layer.orientation;
  const maskRect = layer.alphaMask?.rect ?? { x: 0, y: 0, width: 1, height: 1 };
  if (layer.alphaMask) validRect(maskRect);
  if (orientation && ![0, 90, 180, 270].includes(orientation.rotation))
    throw new Error('GPU preview source orientation is unavailable.');
  const angle = ((orientation?.rotation ?? 0) * Math.PI) / 180;
  if (depth) validRect(depth.window);
  if (lens) {
    validRect(lens.bounds);
    if (
      !Number.isFinite(lens.scale) ||
      lens.scale < 1 ||
      !Number.isFinite(lens.edgeWidth) ||
      lens.edgeWidth < 0 ||
      (lens.corner !== 'circle' &&
        (!Number.isFinite(lens.corner) || lens.corner < 0 || lens.corner > 1))
    )
      throw new Error('GPU preview lens is unavailable.');
  }
  if (
    !m.every(Number.isFinite) ||
    !Number.isFinite(opacity) ||
    opacity < 0 ||
    opacity > 1 ||
    !Number.isFinite(radius) ||
    radius < 0 ||
    !Number.isFinite(layer.blur ?? 0) ||
    (layer.blur ?? 0) < 0 ||
    !plane.every(Number.isFinite)
  )
    throw new Error('GPU preview geometry is unavailable.');
  if (
    layer.tint &&
    !layer.tint.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
  )
    throw new Error('GPU preview tint is unavailable.');
  if (
    layer.cssFilter &&
    ![
      layer.cssFilter.blur ?? 0,
      layer.cssFilter.brightness ?? 1,
      layer.cssFilter.saturate ?? 1,
    ].every((value) => Number.isFinite(value) && value >= 0)
  )
    throw new Error('GPU preview CSS filter is unavailable.');
  const values = new Float32Array([
    m[0],
    m[1],
    m[2],
    0,
    m[3],
    m[4],
    m[5],
    0,
    m[6],
    m[7],
    m[8],
    0,
    output.width,
    output.height,
    logical.width,
    logical.height,
    r.x,
    r.y,
    r.width,
    r.height,
    clip.x,
    clip.y,
    clip.width,
    clip.height,
    radius,
    opacity,
    layer.clip ? 1 : 0,
    layer.clip?.shape === 'ellipse' ? 1 : 0,
    lens?.bounds.x ?? 0,
    lens?.bounds.y ?? 0,
    lens?.bounds.width ?? 1,
    lens?.bounds.height ?? 1,
    lens?.scale ?? 0,
    lens?.optics === 'optical' ? 1 : 0,
    lens?.edgeWidth ?? 0,
    lens?.corner === 'circle' ? -1 : (lens?.corner ?? 0),
    plane[0]!,
    plane[1]!,
    plane[2]!,
    0,
    plane[3]!,
    plane[4]!,
    plane[5]!,
    0,
    plane[6]!,
    plane[7]!,
    plane[8]!,
    0,
    window.x,
    window.y,
    window.width,
    window.height,
    focusA?.settings.x ?? 0.5,
    focusA?.settings.y ?? 0.5,
    focusA?.settings.width ?? 1,
    focusA ? focusA.settings.strength * focusA.weight : 0,
    focusB?.settings.x ?? 0.5,
    focusB?.settings.y ?? 0.5,
    focusB?.settings.width ?? 1,
    focusB ? focusB.settings.strength * focusB.weight : 0,
    focusA?.settings.softness ?? 1,
    focusB?.settings.softness ?? 1,
    focusA?.settings.mode === 'depth' ? 1 : 0,
    focusB?.settings.mode === 'depth' ? 1 : 0,
    rotation[6] ?? 0,
    rotation[7] ?? 0,
    layer.blur ?? 0,
    depth ? 1 : 0,
    Math.cos(angle),
    Math.sin(angle),
    orientation?.flip ? 1 : 0,
    0,
    maskRect.x,
    maskRect.y,
    maskRect.width,
    maskRect.height,
    ...(layer.tint ?? [1, 1, 1, 1]),
    layer.blend === 'mask' ? 1 : 0,
    0,
    0,
    0,
  ]);
  if (!values.every(Number.isFinite)) throw new Error('GPU preview uniforms are unavailable.');
  return values;
}

async function createPreviewPipelines(
  device: GPUDevice,
  format: GPUTextureFormat,
  effects: boolean,
  masked = false,
  operation: { clip: boolean; tint: boolean } = { clip: false, tint: false }
) {
  const modules = [false, true].map((external) =>
    device.createShaderModule({ code: gpuPreviewShader(external, effects, masked, operation) })
  );
  const components: GPUBlendComponent[] = [
    { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    { srcFactor: 'one', dstFactor: 'one' },
    { srcFactor: 'zero', dstFactor: 'src-alpha' },
    { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha' },
  ];
  const blends: GPUBlendState[] = [
    ...components.map((blend): GPUBlendState => ({ color: blend, alpha: blend })),
    {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    },
    {
      color: { srcFactor: 'dst-alpha', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'dst-alpha', dstFactor: 'one-minus-src-alpha' },
    },
  ];
  return Promise.all(
    blends.flatMap((blend) =>
      modules.map((module) =>
        device.createRenderPipelineAsync({
          layout: 'auto',
          vertex: { module, entryPoint: 'vertex' },
          fragment: {
            module,
            entryPoint: 'fragment',
            targets: [{ format, blend }],
          },
          primitive: { topology: 'triangle-list' },
        })
      )
    )
  ).catch((error: unknown) => {
    if (
      typeof GPUPipelineError !== 'undefined' &&
      error instanceof GPUPipelineError &&
      error.reason === 'internal'
    )
      throw new GpuPreviewDeviceError('GPU preview pipeline device failure.', { cause: error });
    throw error;
  });
}

type GpuPreviewRequest = Parameters<GpuPreviewRenderer['render']>[0];
type PreviewPipelineFamilies = {
  effects: GPURenderPipeline[] | null;
  masked: GPURenderPipeline[] | null;
  maskedEffects: GPURenderPipeline[] | null;
  operations: Map<string, GPURenderPipeline[]>;
};

function operationKey(layer: GpuPreviewLayer) {
  const filtered = !!layer.lens || requiresGpuPreviewFilter(layer);
  return `${filtered}:${!!layer.alphaMask}:${!!layer.operationClip}:${!!layer.tint}`;
}

function requiresRasterSource(layer: GpuPreviewLayer) {
  return requiresGpuPreviewFilter(layer) || !!layer.cssFilter;
}

function requiresGpuPreviewFilter(layer: GpuPreviewLayer) {
  return !!layer.depth || (layer.blur ?? 0) > 0;
}

/** Validate the complete graph before any resource mutation or command encoding. */
function validateGpuPreviewFrame(request: GpuPreviewRequest, maximumTextureDimension: number) {
  if (request.layers.length > MAX_LAYERS) throw new Error('GPU preview layer budget exceeded.');
  validSize(request.output, maximumTextureDimension);
  validLogicalSize(request.logical);
  const retainedKeys = new Set<string>();
  const cacheOwners = new Map<
    string,
    { source: Raster; revision: object | string | number | undefined }
  >();
  const targetKeys = new Set<string>();
  const visiting = new Set<GpuPreviewGroup>();
  const validatedGroups = new Set<GpuPreviewGroup>();
  let hasEffects = false;
  let hasMasked = false;
  let hasMaskedEffects = false;
  let layerCount = 0;
  const operations = new Map<string, GpuPreviewLayer>();
  const nativeFrames = new Set<VideoFrame>();
  const retainRaster = (
    raster: { source: Raster; cache?: GpuPreviewLayer['cache'] },
    path: string
  ) => {
    if (raster.cache) {
      const owner = cacheOwners.get(raster.cache.key);
      if (owner && (owner.source !== raster.source || owner.revision !== raster.cache.revision))
        throw new Error('GPU preview cache key has conflicting sources.');
      cacheOwners.set(raster.cache.key, {
        source: raster.source,
        revision: raster.cache.revision,
      });
    }
    retainedKeys.add(raster.cache?.key ?? `transient:${path}`);
  };
  const validateLayers = (
    layers: readonly GpuPreviewLayer[],
    output: Size,
    logical: Size,
    prefix: string,
    depth: number
  ) => {
    if (
      layers.length > MAX_LAYERS ||
      depth > 16 ||
      (layerCount += layers.length) > MAX_RENDER_LAYERS
    )
      throw new Error('GPU preview layer budget exceeded.');
    validSize(output, maximumTextureDimension);
    validLogicalSize(logical);
    layers.forEach((layer, index) => {
      const path = `${prefix}/${index}`;
      layerValues(layer, output, logical);
      const effects = !!layer.lens || requiresGpuPreviewFilter(layer);
      if (layer.operationClip || layer.tint) operations.set(operationKey(layer), layer);
      if (layer.operationClip) retainRaster(layer.operationClip, `${path}/operation-clip`);
      if (layer.alphaMask) {
        hasMasked ||= !effects;
        hasMaskedEffects ||= effects;
        retainRaster(layer.alphaMask, `${path}/alpha-mask`);
      } else hasEffects ||= effects;
      if (requiresRasterSource(layer) && layer.source instanceof VideoFrame)
        targetKeys.add(`${path}/decoded`);
      if (isGroup(layer.source)) {
        const group = layer.source;
        if (visiting.has(group)) throw new Error('GPU preview groups contain a cycle.');
        if (validatedGroups.has(group)) return;
        visiting.add(group);
        targetKeys.add(path);
        validateLayers(group.layers, group.output, group.logical, path, depth + 1);
        visiting.delete(group);
        validatedGroups.add(group);
      } else if (layer.source instanceof VideoFrame) {
        nativeFrames.add(layer.source);
      } else {
        retainRaster({ source: layer.source, cache: layer.cache }, path);
      }
    });
  };
  validateLayers(request.layers, request.output, request.logical, '', 0);
  return {
    retainedKeys,
    targetKeys,
    hasEffects,
    hasMasked,
    hasMaskedEffects,
    operations,
    nativeFrames,
  };
}

function requestHasCssFilter(layers: readonly GpuPreviewLayer[]): boolean {
  return layers.some(
    (layer) =>
      !!layer.cssFilter || (isGroup(layer.source) && requestHasCssFilter(layer.source.layers))
  );
}

/** Creates one isolated device; missing WebGPU returns null without changing the current preview. */
export async function createGpuPreviewRenderer(
  args: {
    reserve?: (bytes: number) => Reservation;
  } = {}
): Promise<GpuPreviewRenderer | null> {
  if (!navigator.gpu) return null;
  let device: GPUDevice;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch (error) {
    throw new GpuPreviewDeviceError('GPU preview device is unavailable.', { cause: error });
  }
  try {
    const format = navigator.gpu.getPreferredCanvasFormat();
    const surface = new OffscreenCanvas(1, 1);
    const context = surface.getContext('webgpu');
    if (!context || !('configure' in context))
      throw new GpuPreviewDeviceError('GPU preview surface is unavailable.');
    const pipelines = await createPreviewPipelines(device, format, false);
    let effectPipelines: Promise<GPURenderPipeline[]> | null = null;
    let maskedPipelines: Promise<GPURenderPipeline[]> | null = null;
    let maskedEffectPipelines: Promise<GPURenderPipeline[]> | null = null;
    const operationPipelines = new Map<string, Promise<GPURenderPipeline[]>>();
    const sampler = device.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      mipmapFilter: 'linear',
    });
    let disposed = false;
    let busy = false;
    let failure: Error | null = null;
    let bytes = 0;
    let outputReservation: Reservation | null = null;
    const uniforms: { buffer: GPUBuffer; reservation: Reservation }[] = [];
    type TextureEntry = {
      source: Raster;
      revision: object | string | number | undefined;
      texture: GPUTexture;
      reservation: Reservation;
      bytes: number;
    };
    const textures = new Map<string, TextureEntry>();
    const targets = new Map<
      string,
      { texture: GPUTexture; reservation: Reservation; bytes: number }
    >();
    const reserve = (count: number): Reservation => {
      const admitted = args.reserve?.(count);
      bytes += count;
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          bytes -= count;
          admitted?.release();
        },
      };
    };
    const filter = await createGpuPreviewFilter(device, reserve);
    let cssFilter: Awaited<ReturnType<typeof createGpuPreviewCssFilter>> | null = null;
    const dropTexture = (key: string, entry: TextureEntry) => {
      textures.delete(key);
      entry.texture.destroy();
      entry.reservation.release();
    };
    const clean = () => {
      for (const [key, entry] of textures) dropTexture(key, entry);
      for (const entry of targets.values()) {
        entry.texture.destroy();
        entry.reservation.release();
      }
      targets.clear();
      filter.dispose();
      cssFilter?.dispose();
      for (const entry of uniforms.splice(0)) {
        entry.buffer.destroy();
        entry.reservation.release();
      }
      context.unconfigure();
      outputReservation?.release();
      outputReservation = null;
      device.removeEventListener('uncapturederror', uncaptured);
      device.destroy();
    };
    const uncaptured = (event: GPUUncapturedErrorEvent) => {
      failure =
        typeof GPUOutOfMemoryError !== 'undefined' && event.error instanceof GPUOutOfMemoryError
          ? new GpuPreviewDeviceError(event.error.message)
          : new Error(event.error.message);
    };
    device.addEventListener('uncapturederror', uncaptured);
    void device.lost.then((info) => {
      failure = new GpuPreviewDeviceError(info.message || 'GPU preview device was lost.');
    });

    const check = (signal: AbortSignal) => {
      signal.throwIfAborted();
      if (disposed) throw new Error('GPU preview is disposed.');
      if (failure) throw failure;
    };
    const drain = async () => {
      try {
        await device.queue.onSubmittedWorkDone();
      } catch (error) {
        if (failure instanceof GpuPreviewDeviceError) throw failure;
        throw new GpuPreviewDeviceError('GPU preview queue failed.', { cause: error });
      }
    };
    const textureFor = (
      layer: Pick<GpuPreviewLayer, 'source' | 'cache'>,
      path: string
    ): GPUTexture => {
      if (layer.source instanceof VideoFrame || isGroup(layer.source))
        throw new Error('GPU source is not a raster.');
      const key = layer.cache?.key ?? `transient:${path}`;
      const previous = textures.get(key);
      if (
        previous &&
        layer.cache &&
        previous.source === layer.source &&
        previous.revision === layer.cache.revision &&
        previous.texture.width === layer.source.width &&
        previous.texture.height === layer.source.height
      )
        return previous.texture;
      if (previous) dropTexture(key, previous);
      validSize(layer.source, device.limits.maxTextureDimension2D);
      const count = layer.source.width * layer.source.height * 4;
      const textureBytes = [...textures.values(), ...targets.values()].reduce(
        (sum, entry) => sum + entry.bytes,
        0
      );
      if (count + textureBytes > MAX_TEXTURE_BYTES)
        throw new Error('GPU preview texture budget exceeded.');
      const reservation = reserve(count);
      let texture: GPUTexture | undefined;
      try {
        texture = device.createTexture({
          size: [layer.source.width, layer.source.height],
          format: 'rgba8unorm',
          usage: TEXTURE_USAGE,
        });
        device.queue.copyExternalImageToTexture(
          { source: layer.source },
          { texture, premultipliedAlpha: true },
          [layer.source.width, layer.source.height]
        );
        textures.set(key, {
          source: layer.source,
          revision: layer.cache?.revision,
          texture,
          reservation,
          bytes: count,
        });
        return texture;
      } catch (error) {
        texture?.destroy();
        reservation.release();
        throw error;
      }
    };

    /** Encode child targets before their parent pass without changing frame lifetime authority. */
    const encodeFrame = (
      request: GpuPreviewRequest,
      families: PreviewPipelineFamilies,
      packedFrames: ReadonlyMap<VideoFrame, VideoFrame>
    ) => {
      const { effects, masked, maskedEffects } = families;
      const encoder = device.createCommandEncoder();
      let uniformIndex = 0;
      const renderedGroups = new Map<GpuPreviewGroup, GPUTexture>();
      const targetFor = (path: string, output: Size) => {
        let target = targets.get(path);
        if (
          target &&
          (target.texture.width !== output.width || target.texture.height !== output.height)
        ) {
          targets.delete(path);
          target.texture.destroy();
          target.reservation.release();
          target = undefined;
        }
        if (target) return target.texture;
        const count = output.width * output.height * 4;
        const textureBytes = [...textures.values(), ...targets.values()].reduce(
          (sum, entry) => sum + entry.bytes,
          0
        );
        if (textureBytes + count > MAX_TEXTURE_BYTES)
          throw new Error('GPU preview texture budget exceeded.');
        const reservation = reserve(count);
        try {
          const texture = device.createTexture({
            size: [output.width, output.height],
            format,
            usage: TEXTURE_USAGE,
          });
          targets.set(path, { texture, reservation, bytes: count });
          return texture;
        } catch (error) {
          reservation.release();
          throw error;
        }
      };
      const renderLayers = (
        layers: readonly GpuPreviewLayer[],
        output: Size,
        logical: Size,
        prefix: string,
        destination: GPUTexture
      ) => {
        const sources = layers.map((layer, index) => {
          const path = `${prefix}/${index}`;
          let source: GPUTexture;
          if (isGroup(layer.source)) {
            const group = layer.source;
            source = renderedGroups.get(group) ?? targetFor(path, group.output);
            if (!renderedGroups.has(group)) {
              renderLayers(group.layers, group.output, group.logical, path, source);
              renderedGroups.set(group, source);
            }
          } else if (layer.source instanceof VideoFrame) {
            if (!requiresRasterSource(layer))
              return device.importExternalTexture({
                source: packedFrames.get(layer.source) ?? layer.source,
              });
            const size = {
              width: layer.source.displayWidth,
              height: layer.source.displayHeight,
            };
            validSize(size, device.limits.maxTextureDimension2D);
            source = targetFor(`${path}/decoded`, size);
            renderLayers(
              [
                {
                  source: layer.source,
                  rect: { x: 0, y: 0, ...size },
                  inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
                },
              ],
              size,
              size,
              `${path}/decoded`,
              source
            );
          } else source = textureFor(layer, path);
          if (layer.cssFilter) {
            if (!cssFilter) throw new Error('GPU preview CSS filter is unavailable.');
            source = cssFilter.prepare(encoder, source, path, layer.cssFilter);
          }
          if (requiresGpuPreviewFilter(layer)) source = filter.prepare(encoder, source, path);
          return source.createView();
        });
        const masks = layers.map((layer, index) =>
          layer.alphaMask
            ? textureFor(layer.alphaMask, `${prefix}/${index}/alpha-mask`).createView()
            : null
        );
        const operationClips = layers.map((layer, index) =>
          layer.operationClip
            ? textureFor(layer.operationClip, `${prefix}/${index}/operation-clip`).createView()
            : null
        );
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: destination.createView(),
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: [0, 0, 0, 0],
            },
          ],
        });
        layers.forEach((layer, index) => {
          const slot = uniformIndex++;
          let uniform = uniforms[slot];
          if (!uniform) {
            const reservation = reserve(UNIFORM_BYTES);
            try {
              uniform = {
                buffer: device.createBuffer({ size: UNIFORM_BYTES, usage: UNIFORM_USAGE }),
                reservation,
              };
              uniforms.push(uniform);
            } catch (error) {
              reservation.release();
              throw error;
            }
          }
          device.queue.writeBuffer(uniform.buffer, 0, layerValues(layer, output, logical));
          const external = layer.source instanceof VideoFrame && !requiresRasterSource(layer);
          const selectedPipelines = layer.alphaMask
            ? layer.lens || requiresGpuPreviewFilter(layer)
              ? maskedEffects
              : masked
            : layer.lens || requiresGpuPreviewFilter(layer)
              ? effects
              : pipelines;
          const activePipelines =
            layer.operationClip || layer.tint
              ? families.operations.get(operationKey(layer))
              : selectedPipelines;
          const pipeline =
            activePipelines?.[
              (layer.blend === 'atop'
                ? 10
                : layer.blend === 'screen'
                  ? 8
                  : layer.blend === 'erase'
                    ? 6
                    : layer.blend === 'mask'
                      ? 4
                      : layer.blend === 'add'
                        ? 2
                        : 0) + (external ? 1 : 0)
            ];
          const pixels = sources[index];
          const mask = masks[index];
          if (!pipeline || !pixels) throw new Error('GPU preview pipeline is unavailable.');
          pass.setPipeline(pipeline);
          pass.setBindGroup(
            0,
            device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: uniform.buffer } },
                { binding: 1, resource: sampler },
                { binding: 2, resource: pixels },
                ...(mask ? [{ binding: 3, resource: mask }] : []),
                ...(operationClips[index] ? [{ binding: 4, resource: operationClips[index] }] : []),
              ],
            })
          );
          pass.draw(3);
        });
        pass.end();
      };
      renderLayers(
        request.layers,
        request.output,
        request.logical,
        '',
        context.getCurrentTexture()
      );
      return encoder.finish();
    };

    return {
      get allocatedBytes() {
        return bytes;
      },
      async render(request) {
        check(request.signal);
        if (busy) throw new Error('GPU preview already has a frame in flight.');
        const plan = validateGpuPreviewFrame(request, device.limits.maxTextureDimension2D);
        busy = true;
        device.pushErrorScope('validation');
        let scopeOpen = true;
        const packedFrames = new Map<VideoFrame, VideoFrame>();
        const packedSources: { frame: VideoFrame; reservation: Reservation }[] = [];
        try {
          for (const source of plan.nativeFrames) {
            const visible = source.visibleRect;
            if (
              source.format !== 'NV12' ||
              !visible ||
              (visible.x === 0 &&
                visible.y === 0 &&
                visible.width === source.codedWidth &&
                visible.height === source.codedHeight)
            )
              continue;
            // Native copy storage and the packed frame overlap during construction.
            const count = source.allocationSize() * 2;
            if (bytes + count > MAX_TEXTURE_BYTES)
              throw new Error('GPU preview source budget exceeded.');
            const reservation = reserve(count);
            try {
              const frame = await prepareDecodedVideoFrame(source.clone(), request.signal);
              packedSources.push({ frame, reservation });
              packedFrames.set(source, frame);
            } catch (error) {
              reservation.release();
              throw error;
            }
          }
          if (plan.hasEffects) effectPipelines ??= createPreviewPipelines(device, format, true);
          const effects = plan.hasEffects ? await effectPipelines : null;
          if (plan.hasMasked)
            maskedPipelines ??= createPreviewPipelines(device, format, false, true);
          const masked = plan.hasMasked ? await maskedPipelines : null;
          if (plan.hasMaskedEffects)
            maskedEffectPipelines ??= createPreviewPipelines(device, format, true, true);
          const maskedEffects = plan.hasMaskedEffects ? await maskedEffectPipelines : null;
          const operations = new Map<string, GPURenderPipeline[]>();
          for (const [key, layer] of plan.operations) {
            let promise = operationPipelines.get(key);
            if (!promise) {
              promise = createPreviewPipelines(
                device,
                format,
                !!layer.lens || requiresGpuPreviewFilter(layer),
                !!layer.alphaMask,
                { clip: !!layer.operationClip, tint: !!layer.tint }
              );
              operationPipelines.set(key, promise);
            }
            operations.set(key, await promise);
          }
          if (!cssFilter && requestHasCssFilter(request.layers))
            cssFilter = await createGpuPreviewCssFilter(device, reserve).catch((error: unknown) => {
              if (
                typeof GPUPipelineError !== 'undefined' &&
                error instanceof GPUPipelineError &&
                error.reason === 'internal'
              )
                throw new GpuPreviewDeviceError('GPU preview pipeline device failure.', {
                  cause: error,
                });
              throw error;
            });
          check(request.signal);
          filter.beginFrame();
          cssFilter?.beginFrame();
          if (
            surface.width !== request.output.width ||
            surface.height !== request.output.height ||
            !outputReservation
          ) {
            context.unconfigure();
            outputReservation?.release();
            outputReservation = null;
            outputReservation = reserve(request.output.width * request.output.height * 8);
            surface.width = request.output.width;
            surface.height = request.output.height;
            context.configure({ device, format, alphaMode: 'premultiplied' });
          }
          for (const [key, entry] of textures)
            if (!plan.retainedKeys.has(key)) dropTexture(key, entry);
          for (const [key, entry] of targets)
            if (!plan.targetKeys.has(key)) {
              targets.delete(key);
              entry.texture.destroy();
              entry.reservation.release();
            }
          device.queue.submit([
            encodeFrame(request, { effects, masked, maskedEffects, operations }, packedFrames),
          ]);
          scopeOpen = false;
          // Both completions retain borrowed sources; a rejection must not release the other barrier.
          const [submitted, validation] = await Promise.allSettled([
            drain(),
            Promise.resolve().then(() => device.popErrorScope()),
          ]);
          if (submitted.status === 'rejected') throw submitted.reason;
          if (validation.status === 'rejected') throw validation.reason;
          const error = validation.value;
          if (error) throw new Error(error.message);
          check(request.signal);
          return surface.transferToImageBitmap();
        } finally {
          // A failed encode can still contain texture uploads; drain before borrowed frames or resources leave scope.
          try {
            if (scopeOpen) await drain();
          } finally {
            try {
              if (scopeOpen) await device.popErrorScope();
            } finally {
              for (const source of packedSources) {
                source.frame.close();
                source.reservation.release();
              }
              busy = false;
              filter.endFrame();
              cssFilter?.endFrame();
              if (disposed) clean();
            }
          }
        }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        if (!busy) clean();
      },
    };
  } catch (error) {
    device.destroy();
    if (
      typeof GPUPipelineError !== 'undefined' &&
      error instanceof GPUPipelineError &&
      error.reason === 'internal'
    )
      throw new GpuPreviewDeviceError('GPU preview pipeline device failure.', { cause: error });
    throw error;
  }
}

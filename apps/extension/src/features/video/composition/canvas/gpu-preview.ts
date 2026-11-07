import { createGpuPreviewPresentationOwner } from './gpu-preview-presentation';
import type { GpuPreviewGroup, GpuPreviewLayer, GpuPreviewRenderer } from './gpu-preview-types';
export type {
  GpuPreviewGroup,
  GpuPreviewLayer,
  GpuPreviewRenderer,
  GpuPreviewPresentationSurface,
} from './gpu-preview-types';
import type { CameraSpatialRect } from '../../project/motion/spatial';
import { quickEditRotationMatrix } from '../motion/spatial-geometry';
import { gpuPreviewShader } from './gpu-preview-shaders';
import { createGpuPreviewDrawBounds } from './gpu-preview-bounds';
import { createGpuPreviewFilter } from './gpu-preview-filter';
import { createGpuPreviewCssFilter } from './gpu-preview-css-filter';

type Size = { width: number; height: number };
type Reservation = { release(): void };
type Raster = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

/** Hardware availability/loss permits the existing renderer; invalid scene plans remain errors. */
export class GpuPreviewDeviceError extends Error {
  override name = 'GpuPreviewDeviceError';
}

export const GPU_PREVIEW_LIMITS = { layersPerPass: 64, totalLayers: 512, groupDepth: 16 } as const;
const MAX_LAYERS = GPU_PREVIEW_LIMITS.layersPerPass;
const MAX_RENDER_LAYERS = GPU_PREVIEW_LIMITS.totalLayers;
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

function sourceEdgeFlags(edges: GpuPreviewLayer['clampSourceEdges']): number {
  if (edges === undefined) return 0;
  if (!Array.isArray(edges) || edges.length > 4)
    throw new Error('GPU preview source edges are unavailable.');
  let flags = 0;
  for (const edge of edges) {
    switch (edge) {
      case 'left':
        flags |= 1;
        break;
      case 'top':
        flags |= 2;
        break;
      case 'right':
        flags |= 4;
        break;
      case 'bottom':
        flags |= 8;
        break;
      default:
        throw new Error('GPU preview source edges are unavailable.');
    }
  }
  return flags;
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
    (layer.clip?.shape === 'hard-rect' && radius !== 0) ||
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
    layer.clip?.shape === 'hard-rect' ? 2 : layer.clip?.shape === 'ellipse' ? 1 : 0,
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
    sourceEdgeFlags(layer.clampSourceEdges),
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

/** Preserve the packed path's native-size RGB sampling without reading decoded planes on CPU. */
function needsNativeRgbSource(source: VideoFrame): boolean {
  const visible = source.visibleRect;
  return (
    source.format === 'NV12' &&
    !!visible &&
    (visible.x !== 0 ||
      visible.y !== 0 ||
      visible.width !== source.codedWidth ||
      visible.height !== source.codedHeight)
  );
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
  let hasCssFilter = false;
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
      depth > GPU_PREVIEW_LIMITS.groupDepth ||
      (layerCount += layers.length) > MAX_RENDER_LAYERS
    )
      throw new Error('GPU preview layer budget exceeded.');
    validSize(output, maximumTextureDimension);
    validLogicalSize(logical);
    layers.forEach((layer, index) => {
      const path = `${prefix}/${index}`;
      layerValues(layer, output, logical);
      hasCssFilter ||= !!layer.cssFilter;
      const effects = !!layer.lens || requiresGpuPreviewFilter(layer);
      if (layer.operationClip || layer.tint) operations.set(operationKey(layer), layer);
      if (layer.operationClip) retainRaster(layer.operationClip, `${path}/operation-clip`);
      if (layer.alphaMask) {
        hasMasked ||= !effects;
        hasMaskedEffects ||= effects;
        retainRaster(layer.alphaMask, `${path}/alpha-mask`);
      } else hasEffects ||= effects;
      if (
        requiresRasterSource(layer) &&
        layer.source instanceof VideoFrame &&
        !needsNativeRgbSource(layer.source)
      )
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
  let nativeIndex = 0;
  for (const source of nativeFrames) {
    if (needsNativeRgbSource(source)) targetKeys.add(`native:${nativeIndex}`);
    nativeIndex++;
  }
  return {
    retainedKeys,
    targetKeys,
    hasCssFilter,
    hasEffects,
    hasMasked,
    hasMaskedEffects,
    operations,
    nativeFrames,
  };
}

function isNeutralFullLayer(layer: GpuPreviewLayer, logical: Size, origin = { x: 0, y: 0 }) {
  const effects = [
    'lens',
    'blur',
    'depth',
    'orientation',
    'clampSourceEdges',
    'alphaMask',
    'cssFilter',
    'tint',
    'operationClip',
  ] as const;
  return (
    layer.rect.x === origin.x &&
    layer.rect.y === origin.y &&
    layer.rect.width === logical.width &&
    layer.rect.height === logical.height &&
    layer.inverse.length === 9 &&
    layer.inverse.every(
      (value, index) => value === [1, 0, origin.x, 0, 1, origin.y, 0, 0, 1][index]
    ) &&
    (layer.opacity ?? 1) === 1 &&
    (layer.blend ?? 'over') === 'over' &&
    effects.every((key) => layer[key] === undefined)
  );
}

function canOmitLeadingGroupCopy(
  layer: GpuPreviewLayer,
  parent: Pick<GpuPreviewRequest, 'output' | 'logical'>
) {
  if (!isGroup(layer.source)) return false;
  const group = layer.source;
  // A bounded integer offset cancels exactly on a native-density pixel grid.
  const origin =
    parent.output.width === parent.logical.width &&
    parent.output.height === parent.logical.height &&
    Number.isSafeInteger(layer.rect.x) &&
    Number.isSafeInteger(layer.rect.y) &&
    Math.abs(layer.rect.x) <= parent.logical.width &&
    Math.abs(layer.rect.y) <= parent.logical.height
      ? layer.rect
      : undefined;
  return (
    group.output.width === parent.output.width &&
    group.output.height === parent.output.height &&
    group.logical.width === parent.logical.width &&
    group.logical.height === parent.logical.height &&
    layer.clip === undefined &&
    isNeutralFullLayer(layer, parent.logical, origin)
  );
}

/** Known opaque full-plane video overwrites prior draws; unknown alpha keeps the original graph. */
function coversOpaqueDestination(
  layer: GpuPreviewLayer,
  parent: Pick<GpuPreviewRequest, 'output' | 'logical'>
): boolean {
  if (isGroup(layer.source)) {
    const last = layer.source.layers.at(-1);
    return (
      !!last &&
      canOmitLeadingGroupCopy(layer, parent) &&
      coversOpaqueDestination(last, layer.source)
    );
  }
  if (
    !(layer.source instanceof VideoFrame) ||
    !['NV12', 'I420', 'I422', 'I444', 'RGBX', 'BGRX'].includes(layer.source.format ?? '') ||
    !isNeutralFullLayer(layer, parent.logical)
  )
    return false;
  const clip = layer.clip;
  return (
    !clip ||
    (clip.radius === 0 &&
      clip.shape !== 'ellipse' &&
      clip.rect.x === 0 &&
      clip.rect.y === 0 &&
      clip.rect.width === parent.logical.width &&
      clip.rect.height === parent.logical.height)
  );
}

/** An isolated same-grid copy can borrow its source target even when that source is shared. */
function aliasCopiedGroups(request: GpuPreviewRequest): GpuPreviewRequest {
  const completed = new Map<GpuPreviewGroup, GpuPreviewGroup>();
  const normalize = (layers: readonly GpuPreviewLayer[]): readonly GpuPreviewLayer[] => {
    const mapped = layers.map((layer) => {
      if (!isGroup(layer.source)) return layer;
      const source = layer.source;
      let group = completed.get(source);
      if (!group) {
        const children = normalize(source.layers);
        const copy = children.length === 1 ? children[0] : undefined;
        group =
          copy && isGroup(copy.source) && canOmitLeadingGroupCopy(copy, source)
            ? copy.source
            : children === source.layers
              ? source
              : { ...source, layers: children };
        completed.set(source, group);
      }
      return group === source ? layer : { ...layer, source: group };
    });
    return mapped.every((layer, index) => layer === layers[index]) ? layers : mapped;
  };
  const layers = normalize(request.layers);
  return layers === request.layers ? request : { ...request, layers };
}

/** Only leading draws share the same transparent destination as their isolated group. */
function omitLeadingGroupCopies(request: GpuPreviewRequest): GpuPreviewRequest {
  // Count readers after aliases so expanding a formerly private source cannot duplicate shared work.
  request = aliasCopiedGroups(request);
  const references = new Map<GpuPreviewGroup, number>();
  const visited = new Set<GpuPreviewGroup>();
  const count = (layers: readonly GpuPreviewLayer[]) => {
    for (const layer of layers) {
      if (!isGroup(layer.source)) continue;
      const group = layer.source;
      references.set(group, (references.get(group) ?? 0) + 1);
      if (visited.has(group)) continue;
      visited.add(group);
      count(group.layers);
    }
  };
  count(request.layers);
  const groups = new Map<GpuPreviewGroup, GpuPreviewGroup>();
  const normalize = (
    layers: readonly GpuPreviewLayer[],
    parent: Pick<GpuPreviewRequest, 'output' | 'logical'>
  ): readonly GpuPreviewLayer[] => {
    const mapped = layers.map((layer) => {
      if (!isGroup(layer.source)) return layer;
      const source = layer.source;
      let group = groups.get(source);
      if (!group) {
        const children = normalize(source.layers, source);
        group = children === source.layers ? source : { ...source, layers: children };
        groups.set(source, group);
        references.set(group, references.get(source) ?? 0);
      }
      return group === source ? layer : { ...layer, source: group };
    });
    let result = mapped.every((layer, index) => layer === layers[index]) ? layers : mapped;
    for (let index = result.length - 1; index >= 0; index--) {
      if (!coversOpaqueDestination(result[index]!, parent)) continue;
      if (index > 0) result = result.slice(index);
      break;
    }
    while (result[0] && canOmitLeadingGroupCopy(result[0], parent)) {
      const group = result[0].source;
      if (
        !isGroup(group) ||
        references.get(group) !== 1 ||
        group.layers.length + result.length - 1 > MAX_LAYERS
      )
        break;
      result = [...group.layers, ...result.slice(1)];
    }
    return result;
  };
  const layers = normalize(request.layers, request);
  return layers === request.layers ? request : { ...request, layers };
}

/** Creates one isolated device; missing WebGPU returns null without changing the current preview. */
export async function createGpuPreviewRenderer(
  args: {
    reserve?: (bytes: number) => Reservation;
    /** Complete requests retain private resources until both GPU barriers settle. Defaults to one. */
    maximumInFlight?: 1 | 2;
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
    let failure: Error | null = null;
    let bytes = 0;
    let destroyed = false;
    let presentation: ReturnType<typeof createGpuPreviewPresentationOwner> | null = null;
    let encodingTail: Promise<void> | null = null;
    type Slot = Awaited<ReturnType<typeof createSlot>>;
    const slots: { busy: boolean; value?: Slot }[] = [{ busy: false }];
    const cleanAll = () => {
      if (
        destroyed ||
        !disposed ||
        slots.some((slot) => slot.busy) ||
        presentation?.pending ||
        presentation?.allocatedBytes
      )
        return;
      destroyed = true;
      for (const slot of slots) slot.value?.clean();
      device.removeEventListener('uncapturederror', uncaptured);
      device.destroy();
    };
    // Error scopes belong to the device stack. Encoding can overlap GPU completion only after pop is invoked.
    const enterEncoding = () => {
      const wait = encodingTail;
      let finish!: () => void;
      const completion = new Promise<void>((resolve) => {
        finish = resolve;
      });
      encodingTail = completion;
      let released = false;
      return {
        wait,
        release() {
          if (released) return;
          released = true;
          if (encodingTail === completion) encodingTail = null;
          finish();
        },
      };
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
    async function createSlot() {
      const surface = new OffscreenCanvas(1, 1);
      const context = surface.getContext('webgpu');
      if (!context || !('configure' in context))
        throw new GpuPreviewDeviceError('GPU preview surface is unavailable.');
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
      const filter = await createGpuPreviewFilter(device, reserve).catch((error: unknown) => {
        context.unconfigure();
        if (
          typeof GPUPipelineError !== 'undefined' &&
          error instanceof GPUPipelineError &&
          error.reason === 'internal'
        )
          throw new GpuPreviewDeviceError('GPU preview pipeline device failure.', { cause: error });
        throw error;
      });
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
        nativeFrames: ReadonlySet<VideoFrame>,
        outputTexture?: () => GPUTexture
      ) => {
        const { effects, masked, maskedEffects } = families;
        const drawBounds = createGpuPreviewDrawBounds();
        const encoder = device.createCommandEncoder();
        let uniformIndex = 0;
        const renderedGroups = new Map<GpuPreviewGroup, GPUTexture>();
        const preparedFrames = new Map<VideoFrame, GPUTexture>();
        const frameRasters = new Map<GpuPreviewLayer['source'], GPUTexture>();
        const rasterFor = (layer: Pick<GpuPreviewLayer, 'source' | 'cache'>, path: string) => {
          const previous = !layer.cache && frameRasters.get(layer.source);
          if (previous) return previous;
          const texture = textureFor(layer, path);
          if (!layer.cache) frameRasters.set(layer.source, texture);
          return texture;
        };
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
              const prepared = preparedFrames.get(layer.source);
              if (prepared) source = prepared;
              else {
                if (!requiresRasterSource(layer))
                  return device.importExternalTexture({
                    source: layer.source,
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
              }
            } else source = rasterFor(layer, path);
            if (layer.cssFilter) {
              if (!cssFilter) throw new Error('GPU preview CSS filter is unavailable.');
              source = cssFilter.prepare(encoder, source, path, layer.cssFilter);
            }
            if (requiresGpuPreviewFilter(layer)) source = filter.prepare(encoder, source, path);
            return source.createView();
          });
          const masks = layers.map((layer, index) =>
            layer.alphaMask
              ? rasterFor(layer.alphaMask, `${prefix}/${index}/alpha-mask`).createView()
              : null
          );
          const operationClips = layers.map((layer, index) =>
            layer.operationClip
              ? rasterFor(layer.operationClip, `${prefix}/${index}/operation-clip`).createView()
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
            const preparedNative =
              layer.source instanceof VideoFrame && preparedFrames.has(layer.source);
            const samplingLayer =
              preparedNative && !requiresRasterSource(layer)
                ? { ...layer, clampSourceEdges: ['left', 'top', 'right', 'bottom'] as const }
                : layer;
            device.queue.writeBuffer(
              uniform.buffer,
              0,
              layerValues(samplingLayer, output, logical)
            );
            const external =
              layer.source instanceof VideoFrame && !preparedNative && !requiresRasterSource(layer);
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
                  ...(operationClips[index]
                    ? [{ binding: 4, resource: operationClips[index] }]
                    : []),
                ],
              })
            );
            pass.setScissorRect(...drawBounds(layer, output, logical));
            pass.draw(3);
          });
          pass.end();
        };
        let nativeIndex = 0;
        for (const source of nativeFrames) {
          if (needsNativeRgbSource(source)) {
            const size = { width: source.displayWidth, height: source.displayHeight };
            validSize(size, device.limits.maxTextureDimension2D);
            const path = `native:${nativeIndex}`;
            const target = targetFor(path, size);
            renderLayers(
              [{ source, rect: { x: 0, y: 0, ...size }, inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
              size,
              size,
              path,
              target
            );
            preparedFrames.set(source, target);
          }
          nativeIndex++;
        }
        renderLayers(
          request.layers,
          request.output,
          request.logical,
          '',
          outputTexture ? outputTexture() : context.getCurrentTexture()
        );
        return encoder.finish();
      };

      return {
        clean,
        async render(
          request: GpuPreviewRequest,
          releaseEncoding: () => void,
          outputTexture?: () => GPUTexture
        ) {
          check(request.signal);
          let plan = validateGpuPreviewFrame(request, device.limits.maxTextureDimension2D);
          const normalized = omitLeadingGroupCopies(request);
          if (normalized !== request) {
            request = normalized;
            plan = validateGpuPreviewFrame(request, device.limits.maxTextureDimension2D);
          }
          device.pushErrorScope('validation');
          let scopeOpen = true;
          try {
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
            if (!cssFilter && plan.hasCssFilter)
              cssFilter = await createGpuPreviewCssFilter(device, reserve).catch(
                (error: unknown) => {
                  if (
                    typeof GPUPipelineError !== 'undefined' &&
                    error instanceof GPUPipelineError &&
                    error.reason === 'internal'
                  )
                    throw new GpuPreviewDeviceError('GPU preview pipeline device failure.', {
                      cause: error,
                    });
                  throw error;
                }
              );
            check(request.signal);
            filter.beginFrame();
            cssFilter?.beginFrame();
            if (
              !outputTexture &&
              (surface.width !== request.output.width ||
                surface.height !== request.output.height ||
                !outputReservation)
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
              encodeFrame(
                request,
                { effects, masked, maskedEffects, operations },
                plan.nativeFrames,
                outputTexture
              ),
            ]);
            scopeOpen = false;
            // Both completions retain borrowed sources; a rejection must not release the other barrier.
            const [submitted, validation] = await Promise.allSettled([
              drain(),
              Promise.resolve().then(() => {
                try {
                  return device.popErrorScope();
                } finally {
                  releaseEncoding();
                }
              }),
            ]);
            if (submitted.status === 'rejected') throw submitted.reason;
            if (validation.status === 'rejected') throw validation.reason;
            const error = validation.value;
            if (error) throw new Error(error.message);
            check(request.signal);
            return outputTexture ? undefined : surface.transferToImageBitmap();
          } finally {
            // A failed encode can still contain texture uploads; drain before borrowed frames or resources leave scope.
            try {
              if (scopeOpen) await drain();
            } finally {
              try {
                if (scopeOpen) {
                  let validation: Promise<GPUError | null>;
                  try {
                    validation = device.popErrorScope();
                  } finally {
                    releaseEncoding();
                  }
                  await validation;
                }
              } finally {
                filter.endFrame();
                cssFilter?.endFrame();
              }
            }
          }
        },
      };
    }
    slots[0]!.value = await createSlot();
    const execute = async (request: GpuPreviewRequest, outputTexture?: () => GPUTexture) => {
      check(request.signal);
      let slot = slots.find((entry) => !entry.busy);
      if (!slot && slots.length < (args.maximumInFlight ?? 1)) {
        slot = { busy: false };
        slots.push(slot);
      }
      if (!slot) throw new Error('GPU preview already has a frame in flight.');
      slot.busy = true;
      const encoding = enterEncoding();
      try {
        if (encoding.wait) await encoding.wait;
        check(request.signal);
        slot.value ??= await createSlot();
        return await slot.value.render(request, encoding.release, outputTexture);
      } finally {
        encoding.release();
        slot.busy = false;
        cleanAll();
      }
    };
    presentation = createGpuPreviewPresentationOwner({
      device,
      format,
      maximumSurfaces: (args.maximumInFlight ?? 1) + 1,
      maximumBytes: MAX_TEXTURE_BYTES,
      ...(args.reserve ? { reserve: args.reserve } : {}),
      check,
      execute: async (request, outputTexture) => {
        await execute(request, outputTexture);
      },
      onIdle: cleanAll,
      unavailable: () =>
        new GpuPreviewDeviceError('GPU preview presentation surface is unavailable.'),
    });
    const presentationOwner = presentation;
    return {
      get allocatedBytes() {
        return bytes + presentationOwner.allocatedBytes;
      },
      createSurface: (canvas, options) => presentationOwner.create(canvas, options),
      async render(request) {
        const bitmap = await execute(request);
        if (!bitmap) throw new Error('GPU preview bitmap output is unavailable.');
        return bitmap;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        presentationOwner.dispose();
        cleanAll();
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

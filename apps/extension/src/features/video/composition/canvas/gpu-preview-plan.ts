import { hasSourceImageFilters } from '../../../image-filters/contract';
import {
  compileSourceImageFilters,
  type SourceImageFilterProgram,
} from '../../../image-filters/plan';
import { glTransitionUniforms } from '../../project/transition/gl-catalog';
import {
  EFFECT_RUNTIME_GPU_PAINT_LIMITS,
  parseEffectRuntimeGpuPaint,
} from '../../../../contracts/effect-runtime/gpu-plan';
import type {
  GpuPreviewPaintSource,
  GpuPreviewGroup,
  GpuPreviewLayer,
  GpuPreviewRenderer,
} from './gpu-preview-types';
import type { CameraSpatialRect } from '../../project/motion/spatial';
import {
  quickEditRotationMatrix,
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  projectQuickEditPoint,
  scaleQuickEditRectAboutCenter,
  type QuickEditHomography,
} from '../motion/spatial-geometry';
import { getCanvasPointsBounds } from '@sniptale/runtime-contracts/canvas-interactions';
import { samplingRasterSize } from '../export-enhancement/projection-density';
type Size = { width: number; height: number };
export type Raster = HTMLCanvasElement | OffscreenCanvas | ImageBitmap | GpuPreviewPaintSource;
export function isPaintSource(source: Raster): source is GpuPreviewPaintSource {
  return 'kind' in source && source.kind === 'paint';
}

export const GPU_PREVIEW_LIMITS = { layersPerPass: 64, totalLayers: 512, groupDepth: 16 } as const;
const MAX_LAYERS = GPU_PREVIEW_LIMITS.layersPerPass;
const MAX_RENDER_LAYERS = GPU_PREVIEW_LIMITS.totalLayers;
export const MAX_TEXTURE_BYTES = 256 * 1024 * 1024;
/** Explicit per-layer GPU storage, also used by preview admission before allocation. */
export const GPU_PREVIEW_UNIFORM_BYTES = 336;
export function isGroup(source: GpuPreviewLayer['source']): source is GpuPreviewGroup {
  return 'kind' in source && source.kind === 'group';
}

export function validSize(size: Size, maximum: number) {
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

export function layerValues(layer: GpuPreviewLayer, output: Size, logical: Size) {
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
    sourceEdgeFlags(layer.clampSourceEdges) |
      (layer.source instanceof VideoFrame && layer.source.colorSpace?.primaries === 'smpte170m'
        ? 16
        : 0),
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

export type PreviewPipelineVariant = {
  blend: number;
  external: boolean;
  effects: boolean;
  masked: boolean;
  clip: boolean;
  tint: boolean;
};

export function previewPipelineVariant(
  layer: GpuPreviewLayer,
  external: boolean
): PreviewPipelineVariant {
  return {
    blend:
      layer.blend === 'atop'
        ? 5
        : layer.blend === 'screen'
          ? 4
          : layer.blend === 'erase'
            ? 3
            : layer.blend === 'mask'
              ? 2
              : layer.blend === 'add'
                ? 1
                : 0,
    external,
    effects: !!layer.lens || requiresGpuPreviewFilter(layer),
    masked: !!layer.alphaMask,
    clip: !!layer.operationClip,
    tint: !!layer.tint,
  };
}

export function previewPipelineKey(variant: PreviewPipelineVariant) {
  return JSON.stringify(variant);
}

/** One device shares only requested pipeline variants across all frame slots. */
export type GpuPreviewRequest = Parameters<GpuPreviewRenderer['render']>[0];
export function requiresRasterSource(layer: GpuPreviewLayer) {
  return (
    requiresGpuPreviewFilter(layer) ||
    !!layer.cssFilter ||
    !!(layer.imageFilters && hasSourceImageFilters(layer.imageFilters.stack))
  );
}

/** Preserve the packed path's native-size RGB sampling without reading decoded planes on CPU. */
export function needsNativeRgbSource(source: VideoFrame): boolean {
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

export function requiresGpuPreviewFilter(layer: GpuPreviewLayer) {
  return !!layer.depth || (layer.blur ?? 0) > 0;
}

/** Validate the complete graph before any resource mutation or command encoding. */
export function validateGpuPreviewFrame(
  request: GpuPreviewRequest,
  maximumTextureDimension: number
) {
  if (request.layers.length > MAX_LAYERS) throw new Error('GPU preview layer budget exceeded.');
  validSize(request.output, maximumTextureDimension);
  validLogicalSize(request.logical);
  const retainedKeys = new Set<string>();
  let paintBytes = 0;
  const cacheOwners = new Map<
    string,
    { source: Raster; revision: object | string | number | undefined }
  >();
  const targetKeys = new Set<string>();
  const visiting = new Set<GpuPreviewGroup>();
  const validatedGroups = new Set<GpuPreviewGroup>();
  let hasCssFilter = false;
  let layerCount = 0;
  const pipelines = new Map<string, PreviewPipelineVariant>();
  const nativeFrames = new Set<VideoFrame>();
  const imageFilters = new Map<GpuPreviewLayer, SourceImageFilterProgram>();
  const glTransitions = new Map<GpuPreviewGroup, NonNullable<GpuPreviewGroup['composition']>>();
  const retainRaster = (
    raster: { source: Raster; cache?: GpuPreviewLayer['cache'] },
    path: string
  ) => {
    if (isPaintSource(raster.source)) {
      validSize(raster.source, maximumTextureDimension);
      if (!parseEffectRuntimeGpuPaint(raster.source.paint))
        throw new Error('GPU paint operands are invalid.');
      paintBytes += JSON.stringify(raster.source.paint).length * 2;
      if (paintBytes > EFFECT_RUNTIME_GPU_PAINT_LIMITS.bytesPerPlan)
        throw new Error('GPU paint data budget exceeded.');
    }
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
      if (layer.imageFilters) {
        const program = compileSourceImageFilters(
          layer.imageFilters.stack,
          layer.imageFilters.logical,
          layer.imageFilters.projectTime
        );
        if (program.steps.length) imageFilters.set(layer, program);
      }
      layerValues(layer, output, logical);
      hasCssFilter ||= !!layer.cssFilter;
      const native = layer.source instanceof VideoFrame;
      const rasterized =
        layer.source instanceof VideoFrame &&
        (requiresRasterSource(layer) || needsNativeRgbSource(layer.source));
      const variant = previewPipelineVariant(layer, native && !rasterized);
      pipelines.set(previewPipelineKey(variant), variant);
      if (rasterized) {
        const conversion: PreviewPipelineVariant = {
          blend: 0,
          external: true,
          effects: false,
          masked: false,
          clip: false,
          tint: false,
        };
        pipelines.set(previewPipelineKey(conversion), conversion);
      }
      if (layer.operationClip) retainRaster(layer.operationClip, `${path}/operation-clip`);
      if (layer.alphaMask) {
        retainRaster(layer.alphaMask, `${path}/alpha-mask`);
      }
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
        if (group.composition) {
          if (
            group.composition.kind !== 'gl-transition' ||
            group.layers.length !== 2 ||
            !glTransitionUniforms(
              group.composition.selection,
              group.composition.progress,
              group.logical.width / group.logical.height
            )
          )
            throw new Error('GPU transition composition is invalid.');
          glTransitions.set(group, structuredClone(group.composition));
          targetKeys.add(`${path}/gl-from`);
          targetKeys.add(`${path}/gl-to`);
        }
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
    imageFilters,
    pipelines,
    nativeFrames,
    glTransitions,
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
    effects.every((key) => layer[key] === undefined) &&
    !(layer.imageFilters && hasSourceImageFilters(layer.imageFilters.stack))
  );
}

function canOmitLeadingGroupCopy(
  layer: GpuPreviewLayer,
  parent: Pick<GpuPreviewRequest, 'output' | 'logical'>
) {
  if (!isGroup(layer.source)) return false;
  const group = layer.source;
  if (group.composition) return false;
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

/** A same-grid opaque video rectangle has binary coverage before its isolated copy. */
function canInlineOpaqueVideo(
  layer: GpuPreviewLayer,
  parent: Pick<GpuPreviewRequest, 'output' | 'logical'>
): boolean {
  if (!canOmitLeadingGroupCopy(layer, parent) || !isGroup(layer.source)) return false;
  if (
    parent.output.width !== parent.logical.width ||
    parent.output.height !== parent.logical.height ||
    layer.source.layers.length !== 1
  )
    return false;
  const video = layer.source.layers[0]!;
  const source = video.source;
  if (
    !(source instanceof VideoFrame) ||
    !['NV12', 'I420', 'I422', 'I444', 'RGBX', 'BGRX'].includes(source.format ?? '') ||
    video.cache ||
    (video.orientation?.rotation ?? 0) !== 0 ||
    video.orientation?.flip
  )
    return false;
  const rect = video.rect;
  if (
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > parent.logical.width ||
    rect.y + rect.height > parent.logical.height ||
    rect.width !== source.displayWidth ||
    rect.height !== source.displayHeight
  )
    return false;
  const clip = video.clip;
  if (
    clip &&
    (clip.radius !== 0 ||
      clip.shape === 'ellipse' ||
      clip.rect.x !== rect.x ||
      clip.rect.y !== rect.y ||
      clip.rect.width !== rect.width ||
      clip.rect.height !== rect.height)
  )
    return false;
  const { clip: _clip, orientation: _orientation, ...neutral } = video;
  return isNeutralFullLayer(
    { ...neutral, rect: { x: 0, y: 0, width: rect.width, height: rect.height } },
    rect
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
          !source.composition &&
          copy &&
          isGroup(copy.source) &&
          canOmitLeadingGroupCopy(copy, source)
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
export function omitLeadingGroupCopies(request: GpuPreviewRequest): GpuPreviewRequest {
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
    parent: Pick<GpuPreviewRequest, 'output' | 'logical'> & {
      composition?: GpuPreviewGroup['composition'];
    }
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
    if (parent.composition) return result;
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
    const direct = result.map((layer) =>
      isGroup(layer.source) &&
      references.get(layer.source) === 1 &&
      canInlineOpaqueVideo(layer, parent)
        ? layer.source.layers[0]!
        : layer
    );
    return direct.every((layer, index) => layer === result[index]) ? result : direct;
  };
  const layers = normalize(request.layers, request);
  return layers === request.layers ? request : { ...request, layers };
}

/** Preserve detailed source rasters only over the GPU aperture that can read them. */
export function resolveGpuPreviewGroupRasters({
  layers,
  output,
  logical,
  sourceDensity,
  futureScale = 1,
}: {
  layers: readonly GpuPreviewLayer[];
  output: Size;
  logical: Size;
  sourceDensity: number;
  futureScale?: number;
}): GpuPreviewLayer[] {
  const IDENTITY: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (sourceDensity <= 1) return [...layers];
  type Rect = GpuPreviewLayer['rect'];
  const full = (group: GpuPreviewGroup): Rect => ({ x: 0, y: 0, ...group.logical });
  const intersect = (a: Rect, b: Rect): Rect | null => {
    const x = Math.max(a.x, b.x),
      y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
  };
  const expand = (rect: Rect, x: number, y = x): Rect => ({
    x: rect.x - x,
    y: rect.y - y,
    width: rect.width + x * 2,
    height: rect.height + y * 2,
  });
  const union = (a: Rect, b: Rect): Rect => {
    const x = Math.min(a.x, b.x),
      y = Math.min(a.y, b.y);
    return {
      x,
      y,
      width: Math.max(a.x + a.width, b.x + b.width) - x,
      height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
  };
  const project = (rect: Rect, matrix: QuickEditHomography): Rect | null => {
    if (!matrix.every(Number.isFinite)) throw new TypeError('Invalid homography');
    const points = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ].map((point) => projectQuickEditPoint(matrix, point));
    if (points.some((point) => !point)) return null;
    return getCanvasPointsBounds(points.map((point) => point!));
  };
  const horizon = (error: unknown) =>
    error instanceof RangeError &&
    (error.message === 'ROI crosses projection horizon' ||
      error.message === 'Projection behind camera');
  const requests = new Map<GpuPreviewGroup, { roi: Rect; density: number }>();
  const visited = new Map<GpuPreviewGroup, Set<string>>();
  const inspect = (
    layers: readonly GpuPreviewLayer[],
    ancestor: QuickEditHomography,
    aperture: Rect,
    parentScale: number
  ) => {
    for (const layer of layers) {
      if (!('kind' in layer.source) || layer.source.kind !== 'group') continue;
      const group = layer.source;
      const forward = invertQuickEditProjection(layer.inverse);
      if (!forward) throw new Error('Preview projection is unavailable.');
      const placement: QuickEditHomography = [
        layer.rect.width / group.logical.width,
        0,
        layer.rect.x,
        0,
        layer.rect.height / group.logical.height,
        layer.rect.y,
        0,
        0,
        1,
      ];
      const lens = layer.lens
        ? scaleQuickEditRectAboutCenter(layer.lens.bounds, layer.lens.scale)
        : IDENTITY;
      const projection = multiplyQuickEditProjections(
        ancestor,
        multiplyQuickEditProjections(forward, multiplyQuickEditProjections(lens, placement))
      );
      let plane = project(aperture, layer.inverse);
      if (plane && layer.clip) {
        let coverage = layer.clip.rect;
        if (layer.clip.shape !== 'hard-rect') {
          try {
            coverage = expand(
              coverage,
              (2 * samplingRasterSize({ roi: aperture, projection: layer.inverse }).density) /
                parentScale
            );
          } catch (error) {
            if (!horizon(error)) throw error;
            plane = null;
          }
        }
        if (plane) {
          const visible = intersect(plane, coverage);
          if (!visible) continue;
          plane = visible;
        }
      }
      let roi: Rect;
      if (!plane) roi = full(group);
      else {
        if (layer.lens) {
          const optical = layer.lens.optics === 'optical';
          const dispersion = optical ? 0.012 * Math.min(1, layer.lens.scale - 1) : 0;
          const low = 1 / layer.lens.scale - dispersion;
          const high = optical ? 1 + dispersion : low;
          const first = project(plane, scaleQuickEditRectAboutCenter(layer.lens.bounds, low))!;
          const last = project(plane, scaleQuickEditRectAboutCenter(layer.lens.bounds, high))!;
          plane = union(first, last);
        }
        const sampled = {
          x: ((plane.x - layer.rect.x) * group.logical.width) / layer.rect.width,
          y: ((plane.y - layer.rect.y) * group.logical.height) / layer.rect.height,
          width: (plane.width * group.logical.width) / layer.rect.width,
          height: (plane.height * group.logical.height) / layer.rect.height,
        };
        const visible = intersect(sampled, full(group));
        if (!visible) continue;
        roi = visible;
      }
      const orientation = layer.orientation;
      const unsafe =
        group.composition ||
        layer.depth ||
        layer.blur ||
        layer.cssFilter ||
        (layer.imageFilters && hasSourceImageFilters(layer.imageFilters.stack)) ||
        (orientation && (orientation.rotation || orientation.flip)) ||
        group.layers.some((child) => child.operationClip || child.depth);
      // Filter support and destination-UV masks retain their original target coordinate system.
      if (unsafe) roi = full(group);
      else
        roi = intersect(
          expand(
            roi,
            (2 * group.logical.width) / group.output.width,
            (2 * group.logical.height) / group.output.height
          ),
          full(group)
        )!;
      const key = JSON.stringify([projection, roi]);
      let contexts = visited.get(group);
      if (!contexts) {
        contexts = new Set();
        visited.set(group, contexts);
      }
      if (contexts.has(key)) continue;
      contexts.add(key);
      let density: number;
      try {
        density = samplingRasterSize({ roi, projection }).density;
      } catch (error) {
        if (!horizon(error)) throw error;
        density = sourceDensity;
      }
      const previous = requests.get(group);
      requests.set(group, {
        roi: previous ? union(previous.roi, roi) : roi,
        density: Math.max(previous?.density ?? 0, density),
      });
      inspect(
        group.layers,
        projection,
        roi,
        Math.min(
          group.output.width / group.logical.width,
          group.output.height / group.logical.height
        )
      );
    }
  };
  inspect(
    layers,
    [
      (futureScale * output.width) / logical.width,
      0,
      0,
      0,
      (futureScale * output.height) / logical.height,
      0,
      0,
      0,
      1,
    ],
    { x: 0, y: 0, ...logical },
    Math.min(output.width / logical.width, output.height / logical.height)
  );
  const groups = new Map<GpuPreviewGroup, { source: GpuPreviewGroup; crop: Rect }>();
  const visit = (layers: readonly GpuPreviewLayer[]): GpuPreviewLayer[] =>
    layers.map((layer) => {
      if (!('kind' in layer.source) || layer.source.kind !== 'group') return layer;
      const group = layer.source;
      let lowered = groups.get(group);
      if (!lowered) {
        const request = requests.get(group);
        if (!request)
          lowered = {
            source: {
              kind: 'group',
              output: { width: 1, height: 1 },
              logical: { width: 1, height: 1 },
              layers: [],
            },
            crop: full(group),
          };
        else {
          const width = Math.max(
            group.output.width,
            Math.ceil(group.logical.width * request.density)
          );
          const height = Math.max(
            group.output.height,
            Math.ceil(group.logical.height * request.density)
          );
          const sx = width / group.logical.width,
            sy = height / group.logical.height;
          const x = Math.max(0, Math.floor(request.roi.x * sx)),
            y = Math.max(0, Math.floor(request.roi.y * sy));
          const right = Math.min(width, Math.ceil((request.roi.x + request.roi.width) * sx));
          const bottom = Math.min(height, Math.ceil((request.roi.y + request.roi.height) * sy));
          const crop = {
            x: x / sx,
            y: y / sy,
            width: (right - x) / sx,
            height: (bottom - y) / sy,
          };
          const translate: QuickEditHomography = [1, 0, crop.x, 0, 1, crop.y, 0, 0, 1];
          lowered = {
            crop,
            source: {
              ...group,
              output: { width: right - x, height: bottom - y },
              logical: { width: crop.width, height: crop.height },
              layers: visit(group.layers).map((child) => ({
                ...child,
                inverse: multiplyQuickEditProjections(child.inverse, translate),
              })),
            },
          };
        }
        groups.set(group, lowered);
      }
      const crop = lowered.crop;
      const changed =
        crop.x !== 0 ||
        crop.y !== 0 ||
        crop.width !== group.logical.width ||
        crop.height !== group.logical.height;
      if (!changed) return { ...layer, source: lowered.source };
      // Source cropping must not narrow the pre-warp output coverage of a lens or destination mask.
      return {
        ...layer,
        source: lowered.source,
        clip: layer.clip ?? { rect: layer.rect, radius: 0 },
        rect: {
          x: layer.rect.x + (crop.x * layer.rect.width) / group.logical.width,
          y: layer.rect.y + (crop.y * layer.rect.height) / group.logical.height,
          width: (crop.width * layer.rect.width) / group.logical.width,
          height: (crop.height * layer.rect.height) / group.logical.height,
        },
      };
    });
  return visit(layers);
}

/** Count backend texture identities; an optional group models one owned snapshot replacement. */
export function gpuPreviewTextureBytes(
  layers: readonly GpuPreviewLayer[],
  materialized?: GpuPreviewGroup
): number {
  const groups = new Set<GpuPreviewGroup>();
  const rasters = new Set<object | string>();
  const caches = new Map<
    string,
    {
      source: GpuPreviewLayer['source'];
      revision: NonNullable<GpuPreviewLayer['cache']>['revision'];
    }
  >();
  let bytes = 0;
  const add = (size: Size) => {
    validSize(size, Number.MAX_SAFE_INTEGER);
    bytes += size.width * size.height * 4;
    if (!Number.isSafeInteger(bytes)) throw new Error('GPU preview texture budget exceeded.');
  };
  const raster = (source: GpuPreviewLayer['source'], cache?: GpuPreviewLayer['cache']) => {
    if (isGroup(source)) return;
    const key = cache ? `cache:${cache.key}` : source;
    if (cache) {
      const previous = caches.get(cache.key);
      if (previous && (previous.source !== source || previous.revision !== cache.revision))
        throw new Error('GPU preview cache key has conflicting sources.');
      caches.set(cache.key, { source, revision: cache.revision });
    }
    if (rasters.has(key)) return;
    rasters.add(key);
    if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame)
      add({ width: source.displayWidth, height: source.displayHeight });
    else if ('width' in source) add(source);
    else add({ width: source.displayWidth, height: source.displayHeight });
  };
  const visit = (layers: readonly GpuPreviewLayer[]) => {
    for (const layer of layers) {
      if (layer.operationClip) raster(layer.operationClip.source, layer.operationClip.cache);
      if (layer.alphaMask) raster(layer.alphaMask.source, layer.alphaMask.cache);
      if (isGroup(layer.source)) {
        if (layer.source === materialized) {
          const key = layer.source;
          if (!rasters.has(key)) {
            rasters.add(key);
            add(layer.source.output);
          }
          continue;
        }
        if (groups.has(layer.source)) continue;
        groups.add(layer.source);
        add(layer.source.output);
        if (layer.source.composition) {
          add(layer.source.output);
          add(layer.source.output);
        }
        visit(layer.source.layers);
      } else if (
        typeof VideoFrame === 'undefined' ||
        !(layer.source instanceof VideoFrame) ||
        requiresRasterSource(layer) ||
        needsNativeRgbSource(layer.source)
      )
        raster(layer.source, layer.cache);
    }
  };
  visit(layers);
  return bytes;
}

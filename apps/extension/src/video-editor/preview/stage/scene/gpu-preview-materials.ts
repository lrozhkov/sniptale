import {
  type GpuPreviewLayer,
  type GpuPreviewGroup,
} from '../../../../features/video/composition/canvas/gpu-preview';
import { resolveVideoWindowMedia } from '../../../../features/video/composition/draw/video';
import { resolveVideoMediaShadowParams } from '../../../../features/video/composition/canvas/media-shadow';

import { buildNativeGpuPreviewLayers } from './gpu-preview-layers';
import { nativeGpuWindowHeader, paintNativeGpuDecoration } from './gpu-preview-video';
import { getFittedMediaWindowFrame } from '../../../../features/video/composition/draw/fitted-media';
import { roundedWindowRadius } from '../../../../features/video/project/window-geometry';

import { admittedVisualWindowHeader } from '../../../../features/video/composition/draw/window-header';

import { motionCameraPlaneTransform } from '../../../../features/video/composition/motion/spatial';
import {
  invertQuickEditProjection,
  type QuickEditHomography,
} from '../../../../features/video/composition/motion/spatial-geometry';
import {
  drawSceneBackground,
  getProjectSceneBackground,
} from '../../../../features/video/project/scene/background';
import {
  evaluateSceneBackgroundMotion,
  hasSceneBackgroundMotion,
  sceneBackgroundDriftRect,
} from '../../../../features/video/project/scene/background-motion';
import { resolveSceneBackgroundAudioEnvelope } from '../../../../features/video/project/scene/background-audio';
import type { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import type { VideoCompositionVisualLayer } from '../../../../features/video/composition/types';
import type { PreviewSceneRenderInput as Input } from './types';

type Passes = ReturnType<typeof resolveVideoCompositionRenderPasses>;
type VideoLayer = Extract<VideoCompositionVisualLayer, { kind: 'video' }>;
const IDENTITY: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const DECORATION_PADDING = 128;
type NativeGpuPlan = Awaited<ReturnType<typeof buildNativeGpuPreviewLayers>>;
interface RetainedDepthPlan {
  key: string;
  header: HTMLImageElement | undefined;
  plan: NativeGpuPlan;
}

function isGpuGroup(source: GpuPreviewLayer['source']): source is GpuPreviewGroup {
  return 'kind' in source && source.kind === 'group';
}

function depthPlanKey(input: Input, layer: VideoLayer, frame: VideoFrame): string {
  return JSON.stringify([
    input.project.width,
    input.project.height,
    layer.clipId,
    layer.x,
    layer.y,
    layer.width,
    layer.height,
    layer.clip.fitMode,
    layer.clip.windowHeader,
    layer.clip.windowCornerRadius,
    layer.clip.shadowIntensity,
    layer.clip.shadowMode,
    layer.clip.shadowColor,
    layer.clip.sourceCrop,
    layer.cameraShadowVector,
    layer.sourceContentTransform,
    input.decodedVideoFrames?.get(layer.clipId)?.orientation,
    input.decodedVideoFrames?.get(layer.clipId)?.sourceWidth,
    input.decodedVideoFrames?.get(layer.clipId)?.sourceHeight,
    frame.displayWidth,
    frame.displayHeight,
  ]);
}

function inlineRetainedMask(node: GpuPreviewLayer): GpuPreviewLayer | null {
  if (!isGpuGroup(node.source)) return null;
  const group = node.source;
  const video = group.layers[0],
    mask = group.layers[1];
  if (
    group.layers.length !== 2 ||
    !video ||
    !mask ||
    !(video.source instanceof VideoFrame) ||
    isGpuGroup(mask.source) ||
    mask.source instanceof VideoFrame ||
    mask.blend !== 'mask' ||
    (node.opacity ?? 1) !== 1 ||
    (node.blur ?? 0) !== 0 ||
    node.clip ||
    node.depth ||
    node.lens ||
    node.orientation ||
    node.clampSourceEdges ||
    node.alphaMask ||
    (node.blend !== undefined && node.blend !== 'over') ||
    (video.opacity ?? 1) !== 1 ||
    (video.blur ?? 0) !== 0 ||
    video.clip ||
    video.depth ||
    video.lens ||
    video.alphaMask ||
    video.clampSourceEdges ||
    (video.blend !== undefined && video.blend !== 'over') ||
    (mask.opacity ?? 1) !== 1 ||
    (mask.blur ?? 0) !== 0 ||
    mask.clip ||
    mask.depth ||
    mask.lens ||
    mask.orientation ||
    mask.clampSourceEdges ||
    mask.alphaMask ||
    group.output.width !== group.logical.width ||
    group.output.height !== group.logical.height ||
    node.rect.width !== group.logical.width ||
    node.rect.height !== group.logical.height ||
    !node.inverse.every(
      (value, index) => value === [1, 0, node.rect.x, 0, 1, node.rect.y, 0, 0, 1][index]
    ) ||
    !video.inverse.every((value, index) => value === mask.inverse[index])
  )
    return null;
  return {
    ...video,
    alphaMask: {
      source: mask.source,
      rect: mask.rect,
      ...(mask.cache ? { cache: mask.cache } : {}),
    },
  };
}

/** Only removes a same-size texel-center copy; masks, source opacity and spatial density remain intact. */
function retainedDepthLayers(
  plan: NativeGpuPlan,
  source: VideoFrame,
  passes: Passes,
  inverse: QuickEditHomography,
  backdrop: GpuPreviewLayer,
  revision: object
): GpuPreviewLayer[] {
  const groups = new Map<GpuPreviewGroup, GpuPreviewGroup>();
  const rasters = new Map<
    HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
    NonNullable<GpuPreviewLayer['cache']>
  >();
  const spatial = passes.overlayFrame.camera.spatial;
  if (!spatial) throw new Error('Depth source geometry is unavailable.');
  const transform = motionCameraPlaneTransform(passes.overlayFrame.camera);
  const planeInverse = transform ? invertQuickEditProjection(transform) : null;
  const rasterCache = (pixels: HTMLCanvasElement | OffscreenCanvas | ImageBitmap) => {
    let cached = rasters.get(pixels);
    if (!cached) {
      cached = { key: `native-depth-static:${rasters.size}`, revision };
      rasters.set(pixels, cached);
    }
    return cached;
  };
  const clone = (node: GpuPreviewLayer): GpuPreviewLayer => {
    node = inlineRetainedMask(node) ?? node;
    let pixels = node.source;
    let cache = node.cache;
    if (isGpuGroup(pixels)) {
      let group = pixels;
      const child = group.layers[0];
      if (
        node.depth &&
        group.layers.length === 1 &&
        child &&
        'kind' in child.source &&
        child.source.kind === 'group' &&
        (child.opacity ?? 1) === 1 &&
        (child.blur ?? 0) === 0 &&
        !child.clip &&
        !child.depth &&
        !child.lens &&
        !child.orientation &&
        !child.clampSourceEdges &&
        (child.blend === undefined || child.blend === 'over') &&
        group.output.width === child.source.output.width &&
        group.output.height === child.source.output.height &&
        group.logical.width === child.source.logical.width &&
        group.logical.height === child.source.logical.height &&
        child.rect.width === group.logical.width &&
        child.rect.height === group.logical.height &&
        child.inverse.every(
          (value, index) => value === [1, 0, child.rect.x, 0, 1, child.rect.y, 0, 0, 1][index]
        )
      )
        group = child.source;
      let copied = groups.get(group);
      if (!copied) {
        // Mask fusion uses the source group's local grid; the outside depth plane stays intact.
        const masked = node.depth
          ? inlineRetainedMask({
              source: group,
              rect: { x: 0, y: 0, ...group.logical },
              inverse: IDENTITY,
            })
          : null;
        copied = { ...group, layers: (masked ? [masked] : group.layers).map(clone) };
        groups.set(group, copied);
      }
      pixels = copied;
    } else if (pixels instanceof VideoFrame) pixels = source;
    else if (!cache) cache = rasterCache(pixels);
    return {
      ...node,
      source: pixels,
      ...(cache ? { cache } : {}),
      ...(node.alphaMask
        ? {
            alphaMask: {
              ...node.alphaMask,
              cache: node.alphaMask.cache ?? rasterCache(node.alphaMask.source),
            },
          }
        : {}),
      ...(node.depth
        ? {
            inverse,
            depth: {
              frame: spatial,
              window: spatial.reference,
              ...(planeInverse ? { planeInverse } : {}),
            },
          }
        : {}),
    };
  };
  return plan.layers.map((node, index) => (index === 0 ? backdrop : clone(node)));
}

interface RetainedRaster {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  key: string;
  image: HTMLImageElement | undefined;
  revision: number;
}

function createRaster(ownerDocument: Document): RetainedRaster {
  const canvas = ownerDocument.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.width = canvas.height = 0;
    throw new Error('Preview raster is unavailable.');
  }
  return { canvas, context, key: '', image: undefined, revision: 0 };
}

function backgroundLayer(
  input: Input,
  passes: Passes,
  raster: RetainedRaster,
  size = { width: input.project.width, height: input.project.height },
  cacheKey = 'native-background'
): GpuPreviewLayer {
  const sceneBackground = getProjectSceneBackground(input.project);
  const image =
    sceneBackground.kind === 'image' ? input.imageBank[sceneBackground.assetId] : undefined;
  const retainedDrift =
    sceneBackground.enabled !== false &&
    sceneBackground.kind !== 'solid' &&
    sceneBackground.motion?.mode === 'drift' &&
    hasSceneBackgroundMotion(sceneBackground.motion) &&
    (sceneBackground.blur ?? 0) === 0 &&
    (sceneBackground.kind !== 'gradient' ||
      !sceneBackground.animation ||
      sceneBackground.animation.mode === 'none');
  const { motion: _motion, ...basePaint } = sceneBackground;
  const paint = retainedDrift ? basePaint : sceneBackground;
  const camera = passes.overlayFrame.camera.backgroundCamera;
  const density = retainedDrift ? Math.min(1, 2048 / Math.max(size.width, size.height)) : 1;
  const rasterWidth = Math.max(1, Math.round(size.width * density));
  const rasterHeight = Math.max(1, Math.round(size.height * density));
  const animated =
    sceneBackground.enabled !== false &&
    (hasSceneBackgroundMotion(sceneBackground.motion) ||
      (sceneBackground.kind === 'gradient' &&
        sceneBackground.animation?.mode !== undefined &&
        sceneBackground.animation.mode !== 'none'));
  const key = JSON.stringify([
    size.width,
    size.height,
    paint,
    retainedDrift ? null : camera,
    animated && !retainedDrift ? input.currentTime : null,
    retainedDrift,
  ]);
  if (raster.key !== key || raster.image !== image) {
    raster.canvas.width = retainedDrift ? rasterWidth : Math.ceil(size.width);
    raster.canvas.height = retainedDrift ? rasterHeight : Math.ceil(size.height);
    drawSceneBackground({
      context: raster.context,
      width: retainedDrift ? rasterWidth : size.width,
      height: retainedDrift ? rasterHeight : size.height,
      projectScale: (retainedDrift ? rasterWidth : size.width) / input.project.width,
      currentTime: input.currentTime,
      audioEnvelope: resolveSceneBackgroundAudioEnvelope(input.project, input.currentTime),
      sceneBackground: paint,
      loadedImages: input.imageBank,
      ...(!retainedDrift && camera ? { camera } : {}),
    });
    raster.key = key;
    raster.image = image;
    raster.revision++;
  }
  const full = { x: 0, y: 0, ...size };
  const rect =
    retainedDrift && sceneBackground.motion
      ? sceneBackgroundDriftRect(
          evaluateSceneBackgroundMotion(sceneBackground.motion, input.currentTime),
          size.width,
          size.height
        )
      : full;
  const projectScale = size.width / input.project.width;
  const inverse: QuickEditHomography =
    retainedDrift && camera
      ? [
          1 / camera.scale,
          0,
          camera.viewportX * projectScale,
          0,
          1 / camera.scale,
          camera.viewportY * projectScale,
          0,
          0,
          1,
        ]
      : IDENTITY;
  return {
    source: raster.canvas,
    rect,
    inverse,
    ...(retainedDrift ? { clip: { rect: full, radius: 0, shape: 'hard-rect' as const } } : {}),
    cache: { key: cacheKey, revision: raster.revision },
  };
}

function decorationLayer(
  input: Input,
  layer: VideoLayer,
  source: VideoFrame,
  inverse: QuickEditHomography,
  raster: RetainedRaster
): GpuPreviewLayer {
  const image = admittedVisualWindowHeader(layer.clip, input.imageBank, false).windowHeaderImage;
  const shadow = resolveVideoMediaShadowParams(
    layer.clip.shadowIntensity,
    1,
    layer.clip.shadowMode
  );
  const padding = Math.max(
    DECORATION_PADDING,
    Math.ceil(
      (shadow?.blur ?? 0) * 3 + Math.abs(shadow?.offsetX ?? 0) + Math.abs(shadow?.offsetY ?? 0) + 8
    )
  );
  const bounds = {
    x: Math.floor(layer.x - padding),
    y: Math.floor(layer.y - padding),
    width: Math.ceil(layer.x + layer.width + padding) - Math.floor(layer.x - padding),
    height: Math.ceil(layer.y + layer.height + padding) - Math.floor(layer.y - padding),
  };
  const key = JSON.stringify([
    input.project.width,
    input.project.height,
    layer.x,
    layer.y,
    layer.width,
    layer.height,
    layer.rotation,
    layer.clip.windowHeader,
    layer.clip.windowCornerRadius,
    layer.clip.fitMode,
    layer.clip.shadowIntensity,
    layer.clip.shadowMode,
    layer.clip.shadowColor,
    layer.cameraShadowVector,
    source.displayWidth,
    source.displayHeight,
  ]);
  if (raster.key !== key || raster.image !== image) {
    raster.canvas.width = bounds.width;
    raster.canvas.height = bounds.height;
    raster.context.translate(-bounds.x, -bounds.y);
    paintNativeGpuDecoration(raster.context, {
      ...resolveVideoWindowMedia(
        layer,
        { sourceWidth: source.displayWidth, sourceHeight: source.displayHeight, draw() {} },
        1,
        input.imageBank
      ),
      frame: layer,
    });
    raster.key = key;
    raster.image = image;
    raster.revision++;
  }
  return {
    source: raster.canvas,
    rect: bounds,
    inverse,
    cache: { key: 'native-decoration', revision: raster.revision },
  };
}

interface RetainedSourceMask {
  raster: RetainedRaster;
  ownerDocument: Document;
  bounds: GpuPreviewLayer['rect'];
  borrowers: number;
  retired: boolean;
}

function createSourceMaskMaterials() {
  let sourceMask: RetainedSourceMask | null = null;
  let sourceMaskRevision = 0;
  let disposed = false;
  const retireSourceMask = (entry: RetainedSourceMask) => {
    entry.retired = true;
    if (entry.borrowers === 0) entry.raster.canvas.width = entry.raster.canvas.height = 0;
  };
  const borrowSourceMask = (entry: RetainedSourceMask, cached: boolean) => {
    entry.borrowers++;
    let released = false;
    return {
      layer: {
        source: entry.raster.canvas,
        rect: { ...entry.bounds },
        inverse: IDENTITY,
        ...(cached
          ? { cache: { key: 'native-source-mask', revision: entry.raster.revision } }
          : {}),
      } satisfies GpuPreviewLayer,
      release() {
        if (released) return;
        released = true;
        entry.borrowers--;
        if (entry.retired && entry.borrowers === 0)
          entry.raster.canvas.width = entry.raster.canvas.height = 0;
      },
    };
  };
  return {
    sourceMask(
      ownerDocument: Document,
      bounds: GpuPreviewLayer['rect'],
      key: string,
      paint: (context: CanvasRenderingContext2D) => void
    ) {
      if (disposed) throw new Error('Source mask materials are disposed.');
      const previous = sourceMask;
      if (
        previous &&
        previous.ownerDocument === ownerDocument &&
        previous.raster.key === key &&
        previous.bounds.x === bounds.x &&
        previous.bounds.y === bounds.y &&
        previous.bounds.width === bounds.width &&
        previous.bounds.height === bounds.height
      )
        return borrowSourceMask(previous, true);
      const raster = createRaster(ownerDocument);
      const entry: RetainedSourceMask = {
        raster,
        ownerDocument,
        bounds: { ...bounds },
        borrowers: 0,
        retired: false,
      };
      try {
        raster.canvas.width = bounds.width;
        raster.canvas.height = bounds.height;
        raster.context.translate(-bounds.x, -bounds.y);
        paint(raster.context);
        if (disposed) throw new Error('Source mask materials are disposed.');
      } catch (error) {
        retireSourceMask(entry);
        throw error;
      }
      if (previous && previous.borrowers > 0) {
        entry.retired = true;
        return borrowSourceMask(entry, false);
      }
      raster.key = key;
      raster.revision = ++sourceMaskRevision;
      sourceMask = entry;
      if (previous) retireSourceMask(previous);
      return borrowSourceMask(entry, true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (sourceMask) retireSourceMask(sourceMask);
      sourceMask = null;
    },
  };
}

/** Owns retained source-density artwork and its canonical depth-plan invalidation. */
export function createNativeGpuPreviewMaterials() {
  let background: RetainedRaster | null = null;
  let decoration: RetainedRaster | null = null;
  let header: RetainedRaster | null = null;
  let presentationBackground: RetainedRaster | null = null;
  let depthPlan: RetainedDepthPlan | null = null;
  const sourceMaskMaterials = createSourceMaskMaterials();
  return {
    sourceMask: sourceMaskMaterials.sourceMask,
    background(
      input: Input,
      passes: Passes,
      size?: { width: number; height: number },
      cacheKey?: string
    ) {
      if (size) {
        presentationBackground ??= createRaster(input.canvas.ownerDocument);
        return backgroundLayer(input, passes, presentationBackground, size, cacheKey);
      }
      background ??= createRaster(input.canvas.ownerDocument);
      return backgroundLayer(input, passes, background);
    },
    decoration(input: Input, layer: VideoLayer, source: VideoFrame, inverse: QuickEditHomography) {
      decoration ??= createRaster(input.canvas.ownerDocument);
      const shadow = decorationLayer(input, layer, source, inverse, decoration);
      const media = {
        ...resolveVideoWindowMedia(
          layer,
          { sourceWidth: source.displayWidth, sourceHeight: source.displayHeight, draw() {} },
          1,
          input.imageBank
        ),
        frame: layer,
      };
      const image = media.windowHeaderImage;
      if (!image) return [shadow];
      header ??= createRaster(input.canvas.ownerDocument);
      const raster = header;
      const key = JSON.stringify([
        layer.clip.windowHeader,
        image.naturalWidth,
        image.naturalHeight,
      ]);
      const artwork = nativeGpuWindowHeader(
        media,
        (paint, _padded, bounds) => {
          if (!bounds) throw new Error('Header raster dimensions are unavailable.');
          if (raster.key !== key || raster.image !== image) {
            raster.canvas.width = bounds.width;
            raster.canvas.height = bounds.height;
            paint(raster.context);
            raster.key = key;
            raster.image = image;
            raster.revision++;
          }
          return {
            source: raster.canvas,
            rect: bounds,
            inverse: IDENTITY,
            cache: { key: 'native-header', revision: raster.revision },
          };
        },
        inverse
      );
      if (!artwork) return [shadow];
      const window = getFittedMediaWindowFrame(media);
      return [
        shadow,
        {
          ...artwork,
          clip: {
            rect: window,
            radius: roundedWindowRadius(
              window.width,
              window.height,
              layer.clip.windowCornerRadius ?? 0
            ),
          },
        },
      ];
    },
    async depth(
      args: Parameters<typeof buildNativeGpuPreviewLayers>[0],
      layer: VideoLayer,
      source: VideoFrame,
      inverse: QuickEditHomography,
      isDisposed: () => boolean
    ) {
      const key = depthPlanKey(args.input, layer, source);
      const header = admittedVisualWindowHeader(
        layer.clip,
        args.input.imageBank,
        false
      ).windowHeaderImage;
      if (!depthPlan || depthPlan.key !== key || depthPlan.header !== header) {
        depthPlan?.plan.release();
        depthPlan = null;
        const prepared = await buildNativeGpuPreviewLayers(args);
        if (isDisposed()) {
          prepared.release();
          return null;
        }
        depthPlan = { key, header, plan: prepared };
      }
      return retainedDepthLayers(
        depthPlan.plan,
        source,
        args.passes,
        inverse,
        args.background,
        depthPlan
      );
    },
    dispose() {
      sourceMaskMaterials.dispose();
      depthPlan?.plan.release();
      depthPlan = null;
      for (const raster of [background, decoration, header, presentationBackground])
        if (raster) raster.canvas.width = raster.canvas.height = 0;
      background = decoration = header = presentationBackground = null;
    },
  };
}

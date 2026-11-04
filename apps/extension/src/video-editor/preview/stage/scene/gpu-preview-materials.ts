import {
  type GpuPreviewLayer,
  type GpuPreviewGroup,
} from '../../../../features/video/composition/canvas/gpu-preview';
import { drawVideoLayer } from '../../../../features/video/composition/draw/video';
import { resolveVideoMediaShadowParams } from '../../../../features/video/composition/canvas/media-shadow';

import { buildNativeGpuPreviewLayers } from './gpu-preview-layers';

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
import { hasSceneBackgroundMotion } from '../../../../features/video/project/scene/background-motion';
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
    node.alphaMask ||
    (node.blend !== undefined && node.blend !== 'over') ||
    (video.opacity ?? 1) !== 1 ||
    (video.blur ?? 0) !== 0 ||
    video.clip ||
    video.depth ||
    video.lens ||
    video.alphaMask ||
    (video.blend !== undefined && video.blend !== 'over') ||
    (mask.opacity ?? 1) !== 1 ||
    (mask.blur ?? 0) !== 0 ||
    mask.clip ||
    mask.depth ||
    mask.lens ||
    mask.orientation ||
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
        copied = { ...group, layers: group.layers.map(clone) };
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
  if (!context) throw new Error('Preview raster is unavailable.');
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
  const animated =
    sceneBackground.enabled !== false &&
    (hasSceneBackgroundMotion(sceneBackground.motion) ||
      (sceneBackground.kind === 'gradient' &&
        sceneBackground.animation?.mode !== undefined &&
        sceneBackground.animation.mode !== 'none'));
  const key = JSON.stringify([
    size.width,
    size.height,
    sceneBackground,
    passes.overlayFrame.camera.backgroundCamera,
    animated ? input.currentTime : null,
  ]);
  if (raster.key !== key || raster.image !== image) {
    raster.canvas.width = Math.ceil(size.width);
    raster.canvas.height = Math.ceil(size.height);
    drawSceneBackground({
      context: raster.context,
      width: size.width,
      height: size.height,
      projectScale: size.width / input.project.width,
      currentTime: input.currentTime,
      audioEnvelope: resolveSceneBackgroundAudioEnvelope(input.project, input.currentTime),
      sceneBackground,
      loadedImages: input.imageBank,
      ...(passes.overlayFrame.camera.backgroundCamera
        ? { camera: passes.overlayFrame.camera.backgroundCamera }
        : {}),
    });
    raster.key = key;
    raster.image = image;
    raster.revision++;
  }
  return {
    source: raster.canvas,
    rect: { x: 0, y: 0, ...size },
    inverse: IDENTITY,
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
    drawVideoLayer(
      raster.context,
      layer,
      layer,
      1,
      new Map([
        [
          layer.clipId,
          {
            sourceWidth: source.displayWidth,
            sourceHeight: source.displayHeight,
            draw() {},
          },
        ],
      ]),
      input.imageBank
    );
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

/** Owns retained source-density artwork and its canonical depth-plan invalidation. */
export function createNativeGpuPreviewMaterials() {
  let background: RetainedRaster | null = null;
  let decoration: RetainedRaster | null = null;
  let presentationBackground: RetainedRaster | null = null;
  let depthPlan: RetainedDepthPlan | null = null;
  return {
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
      return decorationLayer(input, layer, source, inverse, decoration);
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
      depthPlan?.plan.release();
      depthPlan = null;
      for (const raster of [background, decoration, presentationBackground])
        if (raster) raster.canvas.width = raster.canvas.height = 0;
      background = decoration = presentationBackground = null;
    },
  };
}

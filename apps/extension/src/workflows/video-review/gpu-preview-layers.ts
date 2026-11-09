import { getCanvasPointsBounds } from '@sniptale/runtime-contracts/canvas-interactions';
import { projectedOpening } from '../../features/video/composition/draw/spotlight';
import type { VideoCompositionFrameSource } from '../../features/video/composition/draw/media-source';
import type { RetainedRasterMaterialLease } from '../../features/video/composition/canvas/retained-raster-material';
import type {
  GpuPreviewGroup,
  GpuPreviewLayer,
} from '../../features/video/composition/canvas/gpu-preview';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { cameraContentFrame } from '../../features/video/project/camera/appearance';
import { resolveCameraShadowVector } from '../../features/video/project/camera/shadow-direction';
import {
  traceCameraShape,
  drawMediaFrameShadow,
} from '../../features/video/composition/draw/media-shadow';
import { drawSceneBorders } from '../../features/video/composition/draw/border';
import {
  createSceneSpotlightMasks,
  type SceneSpotlightLayer,
} from '../../features/video/composition/draw/spotlight';
import {
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../features/video/composition/motion/spatial-geometry';
import { evaluateQuickEditBordersAtTime } from '../../features/video/review/advanced/border';
import { evaluateQuickEditSpotlightsAtTime } from '../../features/video/review/advanced/focus';
import {
  computeQuickEditSourceWindowTransform,
  computeQuickEditSceneCamera,
  computeQuickEditSpatialWindow,
} from '../../features/video/review/advanced/scene';
import {
  quickEditWebcamBounds,
  type QuickEditWebcam,
  type QuickEditWebcamPlacement,
} from '../../features/video/review/advanced/webcam';
import { evaluateReviewClicks } from '../../features/video/review/click-animation';
import { isCanvasCommentVisibleAt } from '../../features/video/review/comments';
import {
  presentationMainColor,
  presentationMainColorOpacity,
} from '../../features/video/review/presentation-sequence';
import { drawReviewComments } from './render-comments';
import { drawReviewClicks } from './render-click-animation';
import {
  drawPointerFeedbackLensShadow,
  pointerFeedbackLensPaintBounds,
} from '../../features/video/composition/draw/pointer-feedback';
import { drawReviewKeys } from './render-key-animation';
import { type createReviewAnnotationRenderer } from './annotation-renderer';
import {
  reviewGpuAnnotationLayer,
  reviewGpuAnnotationGroup,
  reviewGpuAnnotationDensity,
} from './gpu-preview-annotations';
import { reviewSplitScreenAt, reviewSplitCameraStyle } from './camera-split-screen';
import type { createWatermarkRenderer } from '../../features/video/composition/canvas/watermark';
import type { PreviewScene, PreviewSceneDimensions } from './preview-scene';
import type { ReviewPresentedGeometry } from './gpu-preview-geometry';

type Rect = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };
const identity: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Existing camera capture authority lends pixels until GPU completion. */
export interface ReviewGpuCamera {
  source: Size;
  placement: QuickEditWebcamPlacement;
  crop?: Pick<QuickEditWebcam['appearance'], 'zoom' | 'panX' | 'panY'>;
  drawable: Pick<VideoCompositionFrameSource, 'orientation'> & { videoFrame?(): VideoFrame };
}

/** Raster primitives are tracked by the existing ledger and never read source video pixels. */
export function createReviewGpuPrimitives(
  resources: RenderResources,
  acquireMaterial?: (
    role: string,
    key: string,
    size: Size,
    paint: (context: CanvasRenderingContext2D) => void
  ) => RetainedRasterMaterialLease<HTMLCanvasElement>
) {
  const leases: { release(): void }[] = [];
  const raster = (role: string, size: Size, draw: (context: CanvasRenderingContext2D) => void) => {
    const lease = resources.canvas(role, {
      width: Math.max(1, Math.ceil(size.width)),
      height: Math.max(1, Math.ceil(size.height)),
    });
    leases.push(lease);
    draw(lease.context);
    return lease.canvas;
  };
  return {
    raster,
    material(
      role: string,
      key: string,
      size: Size,
      paint: (context: CanvasRenderingContext2D) => void
    ) {
      if (!acquireMaterial) return { source: raster(role, size, paint), revision: {} };
      const material = acquireMaterial(role, key, size, paint);
      leases.push(material);
      return { source: material.value, revision: material.revision };
    },
    retain(lease: { release(): void }) {
      leases.push(lease);
    },
    resources,
    dispose() {
      for (const lease of leases.splice(0)) lease.release();
    },
  };
}
export type ReviewGpuPrimitives = ReturnType<typeof createReviewGpuPrimitives>;

function texture(source: HTMLCanvasElement, rect: Rect, inverse = identity): GpuPreviewLayer {
  return { source, rect, inverse };
}

function clickPaintBounds(bounds: Rect, padding: number): Rect {
  const x = Math.floor(bounds.x - padding);
  const y = Math.floor(bounds.y - padding);
  const right = Math.ceil(bounds.x + bounds.width + padding);
  const bottom = Math.ceil(bounds.y + bounds.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}
/** Uniform fields sample only texel centres, outside the source-edge antialiasing ramp. */
function uniformViewportLayer(source: HTMLCanvasElement, output: Size): GpuPreviewLayer {
  return texture(source, { x: 0, y: 0, ...output }, [
    0.5,
    0,
    output.width / 4,
    0,
    0.5,
    output.height / 4,
    0,
    0,
    1,
  ]);
}
function group(
  layers: readonly GpuPreviewLayer[],
  dimensions: PreviewSceneDimensions
): GpuPreviewGroup {
  return { kind: 'group', logical: dimensions.canonical, output: dimensions.backing, layers };
}

/** Source crop excludes the header from content objects; borders keep the decorated window. */
function clipCroppedContent(
  context: CanvasRenderingContext2D,
  layout: ReviewPresentedGeometry['layout']
) {
  const visible = layout.visibleVideoRect;
  if (!layout.sourceCrop || !visible) return;
  context.beginPath();
  context.rect(visible.x, visible.y, visible.width, visible.height);
  context.clip();
}

/** Draw sharp authored content in the original plane; GPU alone applies camera projection. */
export async function reviewGpuContentLayers(args: {
  scene: PreviewScene;
  dimensions: PreviewSceneDimensions;
  base: ReviewPresentedGeometry['layout'];
  geometry: ReviewPresentedGeometry;
  sourceTime: number;
  fps: number;
  original: GpuPreviewGroup;
  primitives: ReviewGpuPrimitives;
  annotations: Awaited<ReturnType<typeof createReviewAnnotationRenderer>> | null;
  admit(bitmaps: readonly Size[]): void;
  signal: AbortSignal;
  sourceClip?: GpuPreviewLayer['clip'];
  retainAnnotationBatch?(
    batch: Awaited<
      ReturnType<Awaited<ReturnType<typeof createReviewAnnotationRenderer>>['prepareGpu']>
    >
  ): void;
}) {
  const { scene, dimensions, geometry, base, primitives } = args;
  const scale = dimensions.canonical.width / (scene.canvas?.width ?? scene.source.width);
  const density = reviewGpuAnnotationDensity(
    scene.source,
    dimensions,
    geometry.layout.videoTransform
  );
  const plans =
    args.annotations?.describe(
      geometry.resultTime,
      density,
      args.fps,
      scene.annotationEffects?.lane.instances
    ) ?? [];
  args.admit(plans.map(({ plan }) => plan.renderDimensions));
  const annotations = await args.annotations?.prepareGpu(
    geometry.resultTime,
    density,
    args.fps,
    args.signal,
    scene.annotationEffects?.lane.instances
  );
  try {
    if (annotations?.entries.length) {
      if (args.retainAnnotationBatch) args.retainAnnotationBatch(annotations);
      else primitives.retain(annotations.retain());
    }
    const comments = scene.comments
      .filter((comment) => isCanvasCommentVisibleAt(comment, args.sourceTime))
      .map((comment) => (scene.showEditorComments ? { ...comment, renderToVideo: true } : comment));
    const content =
      annotations?.entries.filter((entry) => entry.instance.attachment === 'content') ?? [];
    const viewport =
      annotations?.entries.filter((entry) => entry.instance.attachment === 'viewport') ?? [];
    const borders = evaluateQuickEditBordersAtTime({
      regions: scene.zoomRegions,
      time: geometry.resultTime,
      output: dimensions.canonical,
      video: computeQuickEditSourceWindowTransform(base),
      scale,
    });
    const clicks = evaluateReviewClicks(scene.clicks, geometry.resultTime);
    const contentComments = comments.filter((comment) => comment.attachment === 'content');
    const viewportComments = comments.filter((comment) => comment.attachment === 'viewport');
    const clip = {
      rect: base.windowRect,
      radius: scene.background.enabled ? scene.background.layout.cornerRadius * scale : 0,
    };
    const contentLayers: GpuPreviewLayer[] = [];
    const overflowLayers = new Set<GpuPreviewLayer>();
    const viewportLayers: GpuPreviewLayer[] = [];
    const full = { x: 0, y: 0, ...dimensions.canonical };
    if (borders.length)
      contentLayers.push(
        texture(
          primitives.raster('preview-gpu-borders', dimensions.canonical, (context) =>
            drawSceneBorders(context, dimensions.canonical, borders, clip, primitives.resources)
          ),
          full,
          geometry.inverse
        )
      );
    let pendingClicks: typeof clicks = [];
    const flushClicks = () => {
      if (!pendingClicks.length) return;
      const batch = pendingClicks;
      pendingClicks = [];
      contentLayers.push(
        texture(
          primitives.raster('preview-gpu-click', dimensions.canonical, (context) => {
            clipCroppedContent(context, base);
            drawReviewClicks(context, batch, base.videoRect, scene.source.width, clip);
          }),
          full,
          geometry.inverse
        )
      );
    };
    for (const click of clicks) {
      if (click.effect !== 'magnify' || !click.lens || click.lens.scale <= 1) {
        pendingClicks.push(click);
        continue;
      }
      flushClicks();
      const sourceScale = base.videoRect.width / scene.source.width;
      const point = {
        x: base.videoRect.x + click.point.x * base.videoRect.width,
        y: base.videoRect.y + click.point.y * base.videoRect.height,
      };
      const radius = click.radius * sourceScale;
      const bounds = {
        x: point.x - radius,
        y: point.y - radius,
        width: radius * 2,
        height: radius * 2,
      };
      const trace = (context: CanvasRenderingContext2D) => {
        context.beginPath();
        if (click.lens!.shape === 'circle') context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        else context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius * 0.18);
      };
      const artworkBounds = pointerFeedbackLensPaintBounds({
        ...click,
        point,
        radius,
        stroke: click.stroke * sourceScale,
      });
      if (!artworkBounds) continue;
      const shadowBounds = clickPaintBounds(bounds, radius * (0.16 * 3 + 0.04) + 2);
      const shadow = primitives.raster('preview-gpu-click-shadow', shadowBounds, (context) => {
        context.translate(-shadowBounds.x, -shadowBounds.y);
        drawPointerFeedbackLensShadow(context, {
          ...click,
          point,
          radius,
          stroke: click.stroke * sourceScale,
        });
      });
      const lens: GpuPreviewLayer = {
        source: args.original,
        rect: full,
        inverse: identity,
        clip: {
          rect: bounds,
          radius: click.lens.shape === 'circle' ? radius : radius * 0.18,
          ...(click.lens.shape === 'circle' ? { shape: 'ellipse' as const } : {}),
        },
        lens: {
          bounds,
          scale: click.lens.scale,
          optics: click.lens.optics ?? 'flat',
          edgeWidth: click.lens.edgeWidth ?? 8,
          corner: click.lens.shape === 'circle' ? 'circle' : 0.18,
        },
      };
      const ringBounds = clickPaintBounds(bounds, (click.stroke * sourceScale) / 2 + 2);
      const ring = primitives.raster('preview-gpu-click-ring', ringBounds, (context) => {
        context.translate(-ringBounds.x, -ringBounds.y);
        trace(context);
        context.globalAlpha = click.opacity;
        context.strokeStyle = click.color;
        context.lineWidth = click.stroke * sourceScale;
        context.stroke();
      });
      const localToScene: QuickEditHomography = [
        1,
        0,
        artworkBounds.x,
        0,
        1,
        artworkBounds.y,
        0,
        0,
        1,
      ];
      const lensGroup: GpuPreviewGroup = {
        kind: 'group',
        logical: { width: artworkBounds.width, height: artworkBounds.height },
        output: { width: artworkBounds.width, height: artworkBounds.height },
        layers: [texture(shadow, shadowBounds), lens, texture(ring, ringBounds)].map((layer) => ({
          ...layer,
          inverse: localToScene,
        })),
      };
      const layer = { source: lensGroup, rect: artworkBounds, inverse: geometry.inverse };
      contentLayers.push(layer);
      overflowLayers.add(layer);
    }
    flushClicks();
    if (content.length) {
      const mask = primitives.material(
        'preview-gpu-annotation-mask',
        JSON.stringify([dimensions.canonical, clip, base.sourceCrop, base.visibleVideoRect]),
        dimensions.canonical,
        (context) => {
          clipCroppedContent(context, base);
          context.beginPath();
          context.roundRect(
            clip.rect.x,
            clip.rect.y,
            clip.rect.width,
            clip.rect.height,
            clip.radius
          );
          context.fillStyle = '#ffffff';
          context.fill();
        }
      );
      const operationClip: NonNullable<GpuPreviewLayer['operationClip']> = {
        source: mask.source,
        ...(mask.revision
          ? { cache: { key: 'gallery-annotation-coverage', revision: mask.revision } }
          : {}),
      };
      // Scene coverage applies to each draw, so overlapping edge pixels retain Canvas clip semantics.
      contentLayers.push(
        reviewGpuAnnotationGroup(
          content.map((entry) => ({ ...entry, source: entry.source })),
          base.videoRect,
          dimensions.canonical,
          geometry.inverse,
          operationClip
        )
      );
    }
    if (contentComments.length) {
      const raster = primitives.raster('preview-gpu-content', dimensions.canonical, (context) => {
        context.save();
        clipCroppedContent(context, base);
        context.beginPath();
        context.roundRect(clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height, clip.radius);
        context.clip();
        drawReviewComments(context, contentComments, {
          attachment: 'content',
          canvas: dimensions.canonical,
          videoTransform: base.videoRect,
          scale: 1,
          sourceTime: args.sourceTime,
          resources: primitives.resources,
        });
        context.restore();
      });
      contentLayers.push(texture(raster, full, geometry.inverse));
    }
    if (viewportComments.length) {
      const raster = primitives.raster('preview-gpu-viewport', dimensions.canonical, (context) => {
        drawReviewComments(context, viewportComments, {
          attachment: 'viewport',
          canvas: dimensions.canonical,
          videoTransform: null,
          scale: 1,
          sourceTime: args.sourceTime,
          resources: primitives.resources,
        });
      });
      viewportLayers.push(texture(raster, full));
    }
    viewportLayers.push(
      ...viewport.map((entry) => reviewGpuAnnotationLayer(entry, full, entry.source))
    );
    const sourceClip = args.sourceClip;
    return {
      contentLayers: sourceClip
        ? contentLayers.map((layer) =>
            overflowLayers.has(layer) ? layer : { ...layer, clip: sourceClip }
          )
        : contentLayers,
      viewportLayers,
    };
  } finally {
    annotations?.release();
  }
}

/** Camera video remains an external texture; the existing silhouette painter supplies only alpha. */
function webcamLayers(
  scene: PreviewScene,
  dimensions: PreviewSceneDimensions,
  sourceTime: number,
  camera: ReviewGpuCamera | undefined,
  primitives: ReviewGpuPrimitives
): GpuPreviewLayer[] {
  const original = scene.webcam;
  if (!camera || !original) return [];
  const frame = camera.drawable.videoFrame?.();
  if (!frame) throw new Error('Camera GPU pixels are unavailable.');
  const screen = reviewSplitScreenAt(original, sourceTime, true);
  const webcam = reviewSplitCameraStyle(original, screen);
  const output = dimensions.canonical;
  const placement = quickEditWebcamBounds(camera.placement, output, webcam.appearance.shape);
  const appearance = { ...webcam.appearance, ...camera.crop };
  const rect = {
    x: placement.x * output.width,
    y: placement.y * output.height,
    width: placement.width * output.width,
    height: placement.height * output.height,
  };
  const crop = cameraContentFrame(
    rect.width,
    rect.height,
    camera.source.width,
    camera.source.height,
    appearance
  );
  const full = { x: 0, y: 0, ...output };
  const shadow = primitives.raster('preview-gpu-camera-shadow', output, (context) => {
    if (!webcam.shadow?.intensity) return;
    drawMediaFrameShadow(
      context,
      webcam.shadow.intensity,
      undefined,
      rect,
      Math.min(output.width, output.height) / 720,
      appearance,
      true,
      webcam.shadow.color,
      0,
      resolveCameraShadowVector(webcam.shadowDirection, rect, output)
    );
  });
  const mask = primitives.raster('preview-gpu-camera-mask', output, (context) => {
    context.fillStyle = '#ffffff';
    traceCameraShape(context, rect, appearance);
    context.fill();
  });
  const inverse: QuickEditHomography = webcam.mirrored
    ? [-1, 0, rect.x * 2 + rect.width, 0, 1, 0, 0, 0, 1]
    : identity;
  const video: GpuPreviewLayer = {
    source: frame,
    ...(camera.drawable.orientation ? { orientation: camera.drawable.orientation } : {}),
    rect: { x: rect.x + crop.x, y: rect.y + crop.y, width: crop.width, height: crop.height },
    inverse,
  };
  const masked = group([video, { ...texture(mask, full), blend: 'mask' }], dimensions);
  return [texture(shadow, full), { source: masked, rect: full, inverse: identity }];
}

/** Screen-pane composition precedes camera, keys, watermark, captions and the final fades. */
export function reviewGpuFinishLayers(args: {
  scene: PreviewScene;
  dimensions: PreviewSceneDimensions;
  main: GpuPreviewGroup;
  camera?: ReviewGpuCamera;
  sourceTime: number;
  resultTime: number;
  primitives: ReviewGpuPrimitives;
  caption: GpuPreviewLayer;
  watermark: Awaited<ReturnType<typeof createWatermarkRenderer>> | null;
  blackout?: { opacity: number; color: string };
}) {
  const { scene, dimensions, primitives } = args;
  const output = dimensions.canonical;
  const full = { x: 0, y: 0, ...output };
  const screen = reviewSplitScreenAt(scene.webcam, args.sourceTime, !!args.camera);
  const split = screen && (screen.width < 1 || screen.height < 1 || screen.clip);
  const layers: GpuPreviewLayer[] = [];
  if (split) {
    const fill = primitives.raster('preview-gpu-split-fill', { width: 2, height: 2 }, (context) => {
      context.fillStyle = '#101014';
      context.fillRect(0, 0, 2, 2);
    });
    layers.push(uniformViewportLayer(fill, output));
    const inverse: QuickEditHomography = [
      1 / screen.width,
      0,
      (-screen.x * output.width) / screen.width,
      0,
      1 / screen.height,
      (-screen.y * output.height) / screen.height,
      0,
      0,
      1,
    ];
    const pane = { source: args.main, rect: full, inverse };
    if (screen.clip) {
      const mask = primitives.raster('preview-gpu-split-mask', output, (context) => {
        context.fillStyle = '#ffffff';
        context.fillRect(
          screen.clip!.x * output.width,
          screen.clip!.y * output.height,
          screen.clip!.width * output.width,
          screen.clip!.height * output.height
        );
      });
      layers.push({
        source: group([pane, { ...texture(mask, full), blend: 'mask' }], dimensions),
        rect: full,
        inverse: identity,
      });
    } else layers.push(pane);
  } else layers.push({ source: args.main, rect: full, inverse: identity });
  layers.push(...webcamLayers(scene, dimensions, args.sourceTime, args.camera, primitives));
  if (scene.keys.length || (args.watermark && scene.watermark?.mode !== 'none')) {
    const overlay = primitives.raster('preview-gpu-keys-watermark', output, (context) => {
      drawReviewKeys(context, scene.keys, args.resultTime, output);
      args.watermark?.draw(context);
    });
    layers.push(texture(overlay, full));
  }
  layers.push(args.caption);
  const outer = scene.outerFadePlan
    ? presentationMainColorOpacity(scene.outerFadePlan, args.resultTime)
    : 0;
  if ((args.blackout?.opacity ?? 0) > 0 || outer > 0) {
    const fill = primitives.raster(
      'preview-gpu-final-fades',
      { width: 2, height: 2 },
      (context) => {
        if (args.blackout) {
          context.globalAlpha = args.blackout.opacity;
          context.fillStyle = args.blackout.color;
          context.fillRect(0, 0, 2, 2);
        }
        if (scene.outerFadePlan) {
          context.globalAlpha = outer;
          context.fillStyle = presentationMainColor(scene.outerFadePlan, args.resultTime);
          context.fillRect(0, 0, 2, 2);
        }
      }
    );
    layers.push(uniformViewportLayer(fill, output));
  }
  return layers;
}

/** Spotlight lenses sample GPU scene groups; mask generation has no access to video pixels. */
export function reviewGpuSpotlightLayers(args: {
  scene: PreviewScene;
  dimensions: PreviewSceneDimensions;
  geometry: ReviewPresentedGeometry;
  source: GpuPreviewGroup;
  projection: QuickEditHomography;
  primitives: ReviewGpuPrimitives;
}) {
  const { scene, dimensions, geometry, primitives } = args;
  const output = dimensions.canonical;
  const scale = output.width / (scene.canvas?.width ?? scene.source.width);
  const window = computeQuickEditSpatialWindow(geometry.layout, scene.background);
  const motion = computeQuickEditSceneCamera(geometry.layout, scene.background);
  const frames: SceneSpotlightLayer[] = evaluateQuickEditSpotlightsAtTime({
    regions: scene.zoomRegions,
    time: geometry.resultTime,
    output,
    video: computeQuickEditSourceWindowTransform(geometry.layout),
    scale: scale * geometry.camera.scale,
  }).map((frame) => ({
    ...frame,
    clip: {
      rect: geometry.layout.spatial ? window : motion.windowClip,
      radius: scene.background.enabled
        ? scene.background.layout.cornerRadius *
          scale *
          (geometry.layout.spatial ? window.width / geometry.layout.windowRect.width : motion.scale)
        : 0,
    },
    projection: geometry.layout.spatial ? args.projection : undefined,
  }));
  return applyReviewGpuSpotlightFrames({ dimensions, frames, source: args.source, primitives });
}

/** Main and inspector previews consume the same evaluated masks, lenses and GPU groups. */
export function applyReviewGpuSpotlightFrames(args: {
  dimensions: PreviewSceneDimensions;
  frames: readonly SceneSpotlightLayer[];
  source: GpuPreviewGroup;
  primitives: ReviewGpuPrimitives;
}) {
  const { dimensions, frames, primitives } = args;
  const output = dimensions.canonical;
  const full = { x: 0, y: 0, ...output };
  if (!frames.length) return args.source;
  const layers: GpuPreviewLayer[] = [{ source: args.source, rect: full, inverse: identity }];
  for (const frame of frames) {
    if (!frame.lens || frame.lens.scale <= 1) continue;
    const corners = [
      { x: frame.opening.x, y: frame.opening.y },
      { x: frame.opening.x + frame.opening.width, y: frame.opening.y },
      { x: frame.opening.x, y: frame.opening.y + frame.opening.height },
      { x: frame.opening.x + frame.opening.width, y: frame.opening.y + frame.opening.height },
    ].map((p) => (frame.projection ? projectQuickEditPoint(frame.projection, p) : p));
    if (corners.some((p) => !p)) throw new Error('Spotlight GPU bounds are unavailable.');
    const bounds = getCanvasPointsBounds(corners.map((point) => point!));
    const mask = primitives.raster('preview-gpu-lens-mask', output, (context) => {
      if (frame.clip)
        context.clip(projectedOpening(frame.clip.rect, frame.clip.radius, frame.projection));
      context.fillStyle = '#ffffff';
      context.fill(projectedOpening(frame.opening, frame.radius, frame.projection));
    });
    const lens = group(
      [
        {
          source: args.source,
          rect: full,
          inverse: identity,
          lens: {
            bounds,
            scale: frame.lens.scale,
            optics: frame.lens.optics ?? 'flat',
            edgeWidth: frame.lens.edgeWidth ?? 8,
            corner: Math.min(
              1,
              frame.radius / (Math.min(frame.opening.width, frame.opening.height) / 2)
            ),
          },
        },
        { ...texture(mask, full), blend: 'mask' },
      ],
      dimensions
    );
    layers.push({ source: lens, rect: full, inverse: identity });
  }
  const masked = frames.filter((frame) => frame.dim > 0 || frame.blur > 0);
  if (masked.length) {
    const masks = createSceneSpotlightMasks(output, masked, primitives.resources);
    primitives.retain({ release: masks.dispose });
    if (masks.radius > 0) {
      const source = group(layers.slice(), dimensions);
      const blur = group(
        [
          { source, rect: full, inverse: identity, blur: masks.radius },
          { ...texture(masks.blur, full), blend: 'mask' },
        ],
        dimensions
      );
      layers.push({ source: blur, rect: full, inverse: identity });
    }
    layers.push(texture(masks.dim, full));
  }
  return group(layers, dimensions);
}

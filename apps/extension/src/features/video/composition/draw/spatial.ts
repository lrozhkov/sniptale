import { motionCameraPlaneTransform } from '../motion/spatial';
import {
  invertQuickEditProjection,
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../motion/spatial-geometry';
import { resolveReviewSpatialFilterLevels } from '../canvas/spatial-filter-levels';
import {
  drawActionCompositionState,
  drawSceneActionCompositionStates,
  resolveActionCompositionPaintBounds,
} from './effects/actions';
import { drawCursorCompositionState, resolveCursorCompositionPaintBounds } from './effects/cursor';
import type { CameraSpatialRect } from '../../project/motion/spatial';
import type {
  VideoCompositionActionState,
  VideoCompositionCameraState,
  VideoCompositionCursorState,
  VideoCompositionVisualLayer,
} from '../types';
import type { ReviewSpatialRenderer } from '../canvas/spatial-renderer';
import { drawSpatialCameraGroup } from '../canvas/spatial-group';
import type { EffectRuntimeRenderedFrameMap } from '../effect-runtime/runtime/types';
import { isVideoCompositionFrameSource, type VideoCompositionMediaSource } from './media-source';
import { drawCompositionVisualLayer } from './visual';
import { drawEffectRuntimeVisualLayer, type EffectRuntimeDrawState } from './effect-runtime';
import { resolveCompositionPaintBounds } from './paint-bounds';
import { resolveVideoSourceLensPaintBounds } from './video';

export interface CompositionSharpOutput {
  /** Maps the existing rasterScale source plane directly into the final ROI raster. */
  projection: QuickEditHomography;
  output: { width: number; height: number };
  /** Final target pixels; publication does not apply the caller's previous transform again. */
  destination: CameraSpatialRect;
}

type SharpSpatialGeometry = {
  camera: VideoCompositionCameraState;
  rasterScale: number;
  sourceRasterScale?: number;
  output: { width: number };
  sourceRect: CameraSpatialRect;
  sharp?: boolean;
};

/** Resolve and validate the physical capture grid before any renderer allocation. */
function resolveSharpSpatialCapture(args: SharpSpatialGeometry, stage: CompositionSharpOutput) {
  const spatial = args.camera.spatial;
  if (!spatial) return { kind: 'inactive' } as const;
  const scale = args.rasterScale;
  const density = (args.sourceRasterScale ?? scale) / scale;
  if (
    ![stage.output.width, stage.output.height].every(
      (value) => Number.isSafeInteger(value) && value > 0
    ) ||
    ![density, scale, args.output.width].every((value) => Number.isFinite(value) && value > 0) ||
    !Object.values(stage.destination).every(Number.isFinite) ||
    stage.destination.width <= 0 ||
    stage.destination.height <= 0 ||
    !stage.projection.every(Number.isFinite)
  )
    throw new Error('Perspective sharp output is unavailable.');
  const inverse = invertQuickEditProjection(stage.projection);
  const plane = motionCameraPlaneTransform(args.camera, scale);
  const planeInverse = plane ? invertQuickEditProjection(plane) : null;
  if (!inverse || (plane && !planeInverse))
    throw new Error('Perspective sharp output is unavailable.');
  const ratio = args.output.width / stage.output.width;
  const frame = {
    ...spatial,
    focus: spatial.focus.map((focus) => ({ ...focus, weight: focus.weight * ratio })),
  };
  if (frame.focus.some((focus) => !Number.isFinite(focus.weight)))
    throw new Error('Perspective sharp output is unavailable.');
  const corners = [
    { x: 0, y: 0 },
    { x: stage.output.width, y: 0 },
    { x: 0, y: stage.output.height },
    { x: stage.output.width, y: stage.output.height },
  ].map((point) => projectQuickEditPoint(inverse, point));
  if (corners.some((point) => !point)) throw new Error('Perspective sharp output is unavailable.');
  const source = args.sourceRect;
  const bounds = {
    x: Math.floor(source.x * scale),
    y: Math.floor(source.y * scale),
    right: Math.ceil((source.x + source.width) * scale),
    bottom: Math.ceil((source.y + source.height) * scale),
  };
  const fullWidth = Math.ceil((bounds.right - bounds.x) * density);
  const fullHeight = Math.ceil((bounds.bottom - bounds.y) * density);
  const densityX = fullWidth / (bounds.right - bounds.x);
  const densityY = fullHeight / (bounds.bottom - bounds.y);
  const levels = resolveReviewSpatialFilterLevels({
    inverse,
    output: stage.output,
    precision: 16,
    sourceScale: { x: densityX, y: densityY },
    blurWeights: args.sharp
      ? []
      : frame.focus.map((focus) => focus.weight * focus.settings.strength),
  });
  // Every reduction and final cubic sample has support below six texels at its selected level.
  const padding = (6 * 2 ** (levels - 1) + 1) / Math.min(densityX, densityY);
  const left = Math.max(bounds.x, Math.min(...corners.map((point) => point!.x)) - padding);
  const top = Math.max(bounds.y, Math.min(...corners.map((point) => point!.y)) - padding);
  const right = Math.min(bounds.right, Math.max(...corners.map((point) => point!.x)) + padding);
  const bottom = Math.min(bounds.bottom, Math.max(...corners.map((point) => point!.y)) + padding);
  if (![left, top, right, bottom].every(Number.isFinite))
    throw new Error('Perspective sharp source is unavailable.');
  if (right <= left || bottom <= top) return { kind: 'empty' } as const;
  // Keep the same physical grid as the ordinary full capture, including ceil-rounded density.
  const alignment = 2 ** (levels - 1);
  const x = Math.max(0, Math.floor(((left - bounds.x) * densityX) / alignment) * alignment);
  const y = Math.max(0, Math.floor(((top - bounds.y) * densityY) / alignment) * alignment);
  const rightPixel = Math.min(
    fullWidth,
    Math.ceil(((right - bounds.x) * densityX) / alignment) * alignment
  );
  const bottomPixel = Math.min(
    fullHeight,
    Math.ceil(((bottom - bounds.y) * densityY) / alignment) * alignment
  );
  const width = rightPixel - x;
  const height = bottomPixel - y;
  const sourceRect = {
    x: bounds.x + x / densityX,
    y: bounds.y + y / densityY,
    width: width / densityX,
    height: height / densityY,
  };
  return {
    kind: 'ready' as const,
    spatial,
    scale,
    frame,
    planeInverse,
    sourceRect,
    width,
    height,
    densityX,
    densityY,
    bounds,
    x,
    y,
  };
}

/** Admit, paint and publish one complete final-density ROI. */
function drawSharpSpatialCameraGroup(
  args: Parameters<typeof drawSpatialCameraGroup>[0],
  stage: CompositionSharpOutput
): boolean {
  const plan = resolveSharpSpatialCapture(args, stage);
  if (plan.kind === 'inactive') return false;
  if (plan.kind === 'empty') return true;
  const {
    spatial,
    scale,
    frame,
    planeInverse,
    sourceRect,
    width,
    height,
    densityX,
    densityY,
    bounds,
    x,
    y,
  } = plan;
  args.renderer.validateSizes({ width, height }, stage.output);
  const output = args.renderer.surface('exposure', stage.output.width, stage.output.height);
  const input = args.renderer.surface(args.sharp ? 'overlay' : 'plane', width, height);
  input.context.save();
  try {
    input.context.setTransform(
      densityX,
      0,
      0,
      densityY,
      -bounds.x * densityX - x,
      -bounds.y * densityY - y
    );
    input.context.globalAlpha = 1;
    input.context.globalCompositeOperation = 'source-over';
    input.context.filter = 'none';
    args.paint(input.context, scale);
  } finally {
    input.context.restore();
  }
  const base = spatial.reference;
  args.renderer.draw(output.context, {
    source: input.canvas,
    sourceRect,
    output: stage.output,
    base: {
      x: base.x * scale,
      y: base.y * scale,
      width: base.width * scale,
      height: base.height * scale,
    },
    target: {
      x: (base.x - args.camera.viewportX) * args.camera.scale * scale,
      y: (base.y - args.camera.viewportY) * args.camera.scale * scale,
      width: base.width * args.camera.scale * scale,
      height: base.height * args.camera.scale * scale,
    },
    frame,
    projection: stage.projection,
    ...(planeInverse ? { planeInverse } : {}),
    ...(args.sharp === undefined ? {} : { sharp: args.sharp }),
  });
  args.context.save();
  try {
    args.context.setTransform(1, 0, 0, 1, 0, 0);
    args.context.drawImage(
      output.canvas,
      stage.destination.x,
      stage.destination.y,
      stage.destination.width,
      stage.destination.height
    );
  } finally {
    args.context.restore();
  }
  return true;
}

/** One contiguous scene plane, with sharp source actions that retain higher-layer occlusion. */
export function drawSpatialCompositionGroup(args: {
  camera: VideoCompositionCameraState;
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>;
  context: CanvasRenderingContext2D;
  destination: CameraSpatialRect;
  effectState: EffectRuntimeDrawState;
  frames?: EffectRuntimeRenderedFrameMap;
  imageBank: Record<string, HTMLImageElement>;
  layers: readonly VideoCompositionVisualLayer[];
  logicalSize: { width: number; height: number };
  output: { width: number; height: number };
  rasterScale: number;
  sourceRasterScale?: number;
  sharpOutput?: CompositionSharpOutput;
  renderer: ReviewSpatialRenderer;
}): boolean {
  if (!args.camera.spatial) return false;
  const sourceFeedbackBounds = new Map<VideoCompositionVisualLayer, CameraSpatialRect>();
  for (const layer of args.layers) {
    if (layer.kind !== 'video') continue;
    const source = args.clipMediaElements.get(layer.clipId);
    if (!(source instanceof HTMLVideoElement) && !isVideoCompositionFrameSource(source)) continue;
    const bounds = resolveVideoSourceLensPaintBounds(layer, source, 1, args.imageBank);
    if (bounds) sourceFeedbackBounds.set(layer, bounds);
  }
  const sourceRect = resolveCompositionPaintBounds({
    context: args.context,
    layers: args.layers,
    output: args.logicalSize,
    rasterScale: args.rasterScale,
    sourceFeedbackBounds,
    ...(args.frames ? { frames: args.frames } : {}),
  });
  const maskState: EffectRuntimeDrawState = {
    drawnTransitionIds: new Set(args.effectState.drawnTransitionIds),
  };
  const draw = (
    context: CanvasRenderingContext2D,
    layer: VideoCompositionVisualLayer,
    state: EffectRuntimeDrawState
  ) => {
    if (
      !drawEffectRuntimeVisualLayer({
        context,
        layer,
        frames: args.frames,
        scaleX: args.rasterScale,
        scaleY: args.rasterScale,
        state,
      })
    )
      drawCompositionVisualLayer(
        context,
        layer,
        args.rasterScale,
        args.rasterScale,
        args.imageBank,
        args.clipMediaElements
      );
  };
  const group = {
    camera: args.camera,
    context: args.context,
    destination: args.destination,
    output: args.output,
    rasterScale: args.rasterScale,
    ...(args.sourceRasterScale === undefined ? {} : { sourceRasterScale: args.sourceRasterScale }),
    renderer: args.renderer,
    sourceRect,
  };
  const withoutActions = (layer: VideoCompositionVisualLayer): VideoCompositionVisualLayer =>
    layer.kind === 'video' && layer.actions?.length ? { ...layer, actions: [] } : layer;
  const drawGroup = (input: Parameters<typeof drawSpatialCameraGroup>[0]) =>
    args.sharpOutput
      ? drawSharpSpatialCameraGroup(input, args.sharpOutput)
      : drawSpatialCameraGroup(input);
  drawGroup({
    ...group,
    paint(context) {
      for (const layer of args.layers) {
        if (!layer.effectActionsOnly) draw(context, withoutActions(layer), args.effectState);
      }
    },
  });
  if (
    !args.layers.some(
      (layer) =>
        layer.kind === 'video' &&
        (layer.actions?.length || (layer.deferSourceBorders && layer.borders?.length))
    )
  )
    return true;
  const explicitActions = new Set(
    args.layers.filter((layer) => layer.effectActionsOnly).map((layer) => layer.clipId)
  );
  drawGroup({
    ...group,
    sharp: true,
    paint(context) {
      for (const layer of args.layers) {
        if (!layer.effectActionsOnly) {
          context.save();
          try {
            context.globalCompositeOperation = 'destination-out';
            draw(context, withoutActions(layer), maskState);
          } finally {
            context.restore();
          }
        }
        if (
          layer.kind === 'video' &&
          (layer.actions?.length || (layer.deferSourceBorders && layer.borders?.length)) &&
          (layer.effectActionsOnly || !explicitActions.has(layer.clipId))
        )
          drawCompositionVisualLayer(
            context,
            { ...layer, effectActionsOnly: true },
            args.rasterScale,
            args.rasterScale,
            args.imageBank,
            args.clipMediaElements
          );
      }
    },
  });
  return true;
}

/** Global events and the cursor stay sharp; keystrokes keep their viewport coordinates and order. */
export function drawSpatialSceneOverlays(args: {
  actions: readonly VideoCompositionActionState[];
  camera: VideoCompositionCameraState;
  context: CanvasRenderingContext2D;
  cursor: VideoCompositionCursorState | null;
  destination: CameraSpatialRect;
  logicalSize: { width: number; height: number };
  output: { width: number; height: number };
  rasterScale: number;
  spatialRenderer?: (() => ReviewSpatialRenderer) | undefined;
}): boolean {
  if (!args.camera.spatial) return false;
  const scale = args.rasterScale;
  const viewport = {
    offsetX: args.destination.x,
    offsetY: args.destination.y,
    scaleX: args.destination.width / args.logicalSize.width,
    scaleY: args.destination.height / args.logicalSize.height,
  };
  const draw = (
    bounds: readonly CameraSpatialRect[],
    paint: (context: CanvasRenderingContext2D) => void
  ) => {
    if (!bounds.length) return;
    if (!args.spatialRenderer) throw new Error('Perspective renderer is unavailable.');
    let x = 0,
      y = 0,
      right = args.logicalSize.width * scale,
      bottom = args.logicalSize.height * scale;
    for (const b of bounds) {
      x = Math.min(x, b.x);
      y = Math.min(y, b.y);
      right = Math.max(right, b.x + b.width);
      bottom = Math.max(bottom, b.y + b.height);
    }
    drawSpatialCameraGroup({
      camera: args.camera,
      context: args.context,
      destination: args.destination,
      output: args.output,
      rasterScale: scale,
      renderer: args.spatialRenderer(),
      sharp: true,
      sourceRect: {
        x: x / scale,
        y: y / scale,
        width: (right - x) / scale,
        height: (bottom - y) / scale,
      },
      paint,
    });
  };
  let pending: VideoCompositionActionState[] = [];
  const flush = () => {
    const actions = pending;
    pending = [];
    const bounds = actions.flatMap((action) => {
      const rect = resolveActionCompositionPaintBounds(action, scale);
      return rect ? [rect] : [];
    });
    draw(bounds, (context) => {
      for (const action of actions) drawActionCompositionState(context, action, null, scale);
    });
  };
  const point = (p: { x: number; y: number }) => ({ x: p.x * scale, y: p.y * scale });
  for (const action of args.actions) {
    if (action.renderKind === 'keystroke') {
      flush();
      drawSceneActionCompositionStates(args.context, [action], args.camera, viewport);
    } else {
      const feedback = action.gestureFeedback;
      pending.push({
        ...action,
        point: action.point ? point(action.point) : null,
        ...(feedback
          ? {
              gestureFeedback: {
                ...feedback,
                point: point(feedback.point),
                ...(feedback.path ? { path: feedback.path.map(point) } : {}),
                ...(feedback.area
                  ? {
                      area: {
                        ...point(feedback.area),
                        width: feedback.area.width * scale,
                        height: feedback.area.height * scale,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      });
    }
  }
  flush();
  if (args.cursor?.visible) {
    const cursor = { ...args.cursor, ...point(args.cursor), scale: args.cursor.scale * scale };
    const bounds = resolveCursorCompositionPaintBounds(cursor);
    if (bounds) draw([bounds], (context) => drawCursorCompositionState(context, cursor));
  }
  return true;
}

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
import type { VideoCompositionMediaSource } from './media-source';
import { drawCompositionVisualLayer } from './visual';
import { drawEffectRuntimeVisualLayer, type EffectRuntimeDrawState } from './effect-runtime';
import { resolveCompositionPaintBounds } from './paint-bounds';

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
  renderer: ReviewSpatialRenderer;
}): boolean {
  if (!args.camera.spatial) return false;
  const sourceRect = resolveCompositionPaintBounds({
    context: args.context,
    layers: args.layers,
    output: args.logicalSize,
    rasterScale: args.rasterScale,
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
    renderer: args.renderer,
    sourceRect,
  };
  const withoutActions = (layer: VideoCompositionVisualLayer): VideoCompositionVisualLayer =>
    layer.kind === 'video' && layer.actions?.length ? { ...layer, actions: [] } : layer;
  drawSpatialCameraGroup({
    ...group,
    paint(context) {
      for (const layer of args.layers) {
        if (!layer.effectActionsOnly) draw(context, withoutActions(layer), args.effectState);
      }
    },
  });
  if (!args.layers.some((layer) => layer.kind === 'video' && layer.actions?.length)) return true;
  const explicitActions = new Set(
    args.layers.filter((layer) => layer.effectActionsOnly).map((layer) => layer.clipId)
  );
  drawSpatialCameraGroup({
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
          layer.actions?.length &&
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

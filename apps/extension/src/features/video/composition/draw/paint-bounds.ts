import type { CameraSpatialRect as Rect } from '../../project/motion/spatial';
import type { VideoCompositionVisualLayer } from '../types';
import type {
  EffectRuntimeRenderedFrame,
  EffectRuntimeRenderedFrameMap,
} from '../effect-runtime/runtime/types';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import { resolveVideoMediaShadowParams } from '../canvas/media-shadow';
import { resolveTextCompositionLayout } from './overlays';
import {
  mapAnnotationSceneFrame,
  resolveAnnotationNodeRenderFrame,
  readAnnotationNumber,
  readAnnotationString,
  readAnnotationBoolean,
  VideoAnnotationTargetBindingKind,
  type ResolvedAnnotationRenderNode,
  type ResolvedAnnotationScene,
} from '../../project/annotation-engine';

type Matrix = readonly [number, number, number, number, number, number];
const pad = (r: Rect, amount: number): Rect => ({
  x: r.x - amount,
  y: r.y - amount,
  width: r.width + amount * 2,
  height: r.height + amount * 2,
});
function union(a: Rect, b: Rect): Rect {
  if (![a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height].every(Number.isFinite))
    throw new Error('Perspective source bounds are unavailable.');
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
function about(r: Rect, sx: number, sy: number, degrees: number, tx: number, ty: number): Matrix {
  const c = Math.cos((degrees * Math.PI) / 180),
    s = Math.sin((degrees * Math.PI) / 180);
  const x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  return [
    sx * c,
    sy * s,
    -sx * s,
    sy * c,
    x + tx - sx * c * x + sx * s * y,
    y + ty - sy * s * x - sy * c * y,
  ];
}
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function mapRect(r: Rect, m: Matrix): Rect {
  const points = [
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x, r.y + r.height],
    [r.x + r.width, r.y + r.height],
  ].map(([x = 0, y = 0]) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }));
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
}
const matrixScale = (m: Matrix) => Math.max(1, Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));

/** Capture bounds use the same raster scale as painting, including minimum-size text and raw strokes. */
export function resolveCompositionPaintBounds(args: {
  context: CanvasRenderingContext2D;
  frames?: EffectRuntimeRenderedFrameMap;
  layers: readonly VideoCompositionVisualLayer[];
  output: { width: number; height: number };
  rasterScale: number;
}): Rect {
  const scale = args.rasterScale;
  if (!Number.isFinite(scale) || scale <= 0)
    throw new Error('Perspective source bounds are unavailable.');
  let result: Rect = {
    x: 0,
    y: 0,
    width: args.output.width * scale,
    height: args.output.height * scale,
  };
  args.context.save();
  try {
    for (const layer of args.layers) {
      if (layer.opacity <= 0) continue;
      const frame = {
        x: layer.x * scale,
        y: layer.y * scale,
        width: layer.width * scale,
        height: layer.height * scale,
      };
      const state = layer.renderState ?? IDENTITY_TRANSITION_VISUAL_STATE;
      const matrix = about(
        frame,
        state.scaleX,
        state.scaleY,
        layer.rotation,
        state.translateX * scale,
        state.translateY * scale
      );
      let bounds = layerBounds(args.context, layer, frame, scale);
      const effects = layerEffectBounds(layer.clipId, bounds, frame, scale, args.frames);
      bounds = effects.source;
      if (effects.viewport) result = union(result, effects.viewport);
      result = union(
        result,
        pad(mapRect(bounds, matrix), 2 + state.blurAmount * scale * 3 * matrixScale(matrix))
      );
    }
  } finally {
    args.context.restore();
  }
  const resolved = {
    x: result.x / scale,
    y: result.y / scale,
    width: result.width / scale,
    height: result.height / scale,
  };
  if (!Object.values(resolved).every(Number.isFinite))
    throw new Error('Perspective source bounds are unavailable.');
  return resolved;
}

function layerBounds(
  context: CanvasRenderingContext2D,
  layer: VideoCompositionVisualLayer,
  frame: Rect,
  scale: number
): Rect {
  if (layer.kind === 'video' || layer.kind === 'image') {
    const shadow =
      !layer.effectActionsOnly &&
      resolveVideoMediaShadowParams(
        layer.clip.shadowIntensity,
        scale,
        layer.clip.shadowMode,
        layer.kind === 'video' && layer.trackRole === 'CAMERA'
      );
    return shadow
      ? pad(frame, Math.ceil(shadow.blur + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + 2))
      : frame;
  }
  if (layer.kind === 'text') return textLayerBounds(context, layer, frame, scale);
  if (layer.kind === 'shape') return shapeLayerBounds(layer, frame);
  if (layer.kind === 'annotation' && layer.clip.scene)
    return annotationLayerBounds(layer.clip.scene, frame, scale);
  return frame;
}

function textLayerBounds(
  context: CanvasRenderingContext2D,
  layer: Extract<VideoCompositionVisualLayer, { kind: 'text' }>,
  frame: Rect,
  scale: number
): Rect {
  const layout = resolveTextCompositionLayout(context, layer.clip, frame, scale);
  let bounds = pad(frame, (layer.clip.style.borderWidth * Math.max(0.2, scale)) / 2);
  context.font = layout.font;
  context.textAlign = layer.clip.style.textAlign;
  context.textBaseline = 'top';
  for (const [index, line] of layout.lines.entries()) {
    const metrics = context.measureText(line);
    const fit = metrics.width > 0 ? Math.min(1, layout.contentWidth / metrics.width) : 1;
    const left = Number.isFinite(metrics.actualBoundingBoxLeft)
      ? metrics.actualBoundingBoxLeft
      : layout.fontSize;
    const right = Number.isFinite(metrics.actualBoundingBoxRight)
      ? metrics.actualBoundingBoxRight
      : metrics.width + layout.fontSize;
    const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
      ? metrics.actualBoundingBoxAscent
      : layout.fontSize;
    const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
      ? metrics.actualBoundingBoxDescent
      : layout.fontSize;
    bounds = union(bounds, {
      x: layout.anchorX - left * fit,
      y: frame.y + layout.padding + index * layout.lineHeightPx - ascent,
      width: Math.max(0, left + right) * fit,
      height: Math.max(0, ascent + descent),
    });
  }
  return bounds;
}

function shapeLayerBounds(
  layer: Extract<VideoCompositionVisualLayer, { kind: 'shape' }>,
  frame: Rect
): Rect {
  const clip = layer.clip;
  let bounds = pad(frame, Math.max(1, clip.style.strokeWidth) / 2);
  if (clip.shapeType === 'ARROW') {
    const size = Math.max(10, Math.max(1, clip.style.strokeWidth) * 3);
    bounds = union(bounds, {
      x: frame.x + frame.width - size,
      y: frame.y + frame.height / 2 - size / 2,
      width: size,
      height: size,
    });
  }
  if (clip.embeddedAsset && (clip.embeddedAsset.opacity ?? 1) > 0) {
    const p = clip.embeddedAsset.placement;
    const sx = frame.width / Math.max(1, clip.transform.width),
      sy = frame.height / Math.max(1, clip.transform.height);
    bounds = union(bounds, {
      x: frame.x + p.x * sx,
      y: frame.y + p.y * sy,
      width: p.width * sx,
      height: p.height * sy,
    });
  }
  return bounds;
}

function annotationLayerBounds(scene: ResolvedAnnotationScene, frame: Rect, scale: number): Rect {
  const label = scene.presentation.labelFrame;
  // The renderer clips ordinary scene/legacy annotations before their internal transforms.
  if (
    scene.target.binding === VideoAnnotationTargetBindingKind.NONE ||
    frame.x !== label.x ||
    frame.y !== label.y ||
    frame.width !== label.width ||
    frame.height !== label.height
  )
    return frame;
  const effects = scene.effects;
  const parent = about(
    frame,
    effects.scaleMultiplier,
    effects.scaleMultiplier,
    0,
    effects.translateX * scale,
    effects.translateY * scale
  );
  return union(
    frame,
    annotationNodeBounds(
      scene,
      scene.renderTree,
      frame,
      parent,
      effects.blurPx * scale * 3,
      scale
    ) ?? frame
  );
}

function annotationNodeBounds(
  scene: ResolvedAnnotationScene,
  node: ResolvedAnnotationRenderNode,
  viewport: Rect,
  parent: Matrix,
  inheritedBleed: number,
  scale: number
): Rect | null {
  const frame = mapAnnotationSceneFrame({
    frame: resolveAnnotationNodeRenderFrame(scene, node),
    scene,
    sourceFrame: scene.presentation.labelFrame,
    viewport,
  });
  if (node.opacity * node.frame.opacity <= 0 || frame.width <= 0 || frame.height <= 0) return null;
  const t = node.transform;
  const matrix = multiply(
    parent,
    about(frame, t.scale, t.scale, t.rotation, t.x * scale, t.y * scale)
  );
  const primitive = annotationPrimitiveBounds(node, frame, scale);
  const bleed = annotationNodeBleed(node, scale, primitive !== null, inheritedBleed);
  let result = primitive
    ? pad(mapRect(primitive, matrix), bleed.padding * matrixScale(matrix) + 2)
    : null;
  for (const child of node.children) {
    const bounds = annotationNodeBounds(scene, child, viewport, matrix, bleed.inherited, scale);
    if (bounds) result = result ? union(result, bounds) : bounds;
  }
  return result;
}

function annotationPrimitiveBounds(
  node: ResolvedAnnotationRenderNode,
  frame: Rect,
  scale: number
): Rect | null {
  let primitive: Rect | null = frame;
  const surface = isAnnotationSurface(node);
  if (
    surface &&
    !readAnnotationString(node.style['fill'], '') &&
    !readAnnotationString(node.style['stroke'], '')
  )
    primitive = null;
  if (node.nodeType === 'spotlight' || node.nodeType === 'marker') {
    const radius =
      node.nodeType === 'spotlight'
        ? Math.max(frame.width, frame.height) / 2
        : Math.max(1, Math.min(frame.width, frame.height) / 2);
    primitive = {
      x: frame.x + frame.width / 2 - radius,
      y: frame.y + frame.height / 2 - radius,
      width: radius * 2,
      height: radius * 2,
    };
  }
  if (
    (node.nodeType === 'line' || node.nodeType === 'path') &&
    readAnnotationBoolean(node.props['arrowEnd'], false)
  ) {
    const size = readAnnotationNumber(node.props['arrowSize'], 8) * scale;
    primitive = union(frame, {
      x: frame.x - size,
      y: frame.y + frame.height / 2 - size / 2,
      width: frame.width + size,
      height: size,
    });
  }
  return primitive;
}

function annotationNodeBleed(
  node: ResolvedAnnotationRenderNode,
  scale: number,
  hasPrimitive: boolean,
  inheritedBleed: number
) {
  const surface = isAnnotationSurface(node);
  const stroke = (readAnnotationNumber(node.style['strokeWidth'], 2) * Math.max(1, scale)) / 2;
  const font =
    node.nodeType === 'text' ? readAnnotationNumber(node.style['fontSize'], 18) * scale * 2 : 0;
  const shadow =
    surface && hasPrimitive
      ? readAnnotationNumber(node.style['shadowBlur'], 0) * 3 +
        Math.abs(readAnnotationNumber(node.style['shadowX'], 0)) +
        Math.abs(readAnnotationNumber(node.style['shadowY'], 0))
      : 0;
  const inherited = inheritedBleed + node.transform.blurPx * scale * 3 + shadow;
  return { inherited, padding: stroke + font + inherited };
}

function layerEffectBounds(
  clipId: string,
  bounds: Rect,
  frame: Rect,
  scale: number,
  frames?: EffectRuntimeRenderedFrameMap
) {
  let source = bounds;
  let viewport: Rect | null = null;
  for (const effect of frames?.values() ?? []) {
    const raster = effectRasterBounds(effect, clipId, frame);
    if (raster) source = union(source, raster);
    const transition = effectTransitionBounds(effect, clipId, scale);
    if (transition) viewport = viewport ? union(viewport, transition) : transition;
  }
  return { source, viewport };
}

function effectRasterBounds(
  effect: EffectRuntimeRenderedFrame,
  clipId: string,
  frame: Rect
): Rect | null {
  if (effect.target.kind !== 'clip' && effect.target.kind !== 'scene') return null;
  if (effect.target.clipId !== clipId || !effect.bitmapBounds) return null;
  const b = effect.bitmapBounds;
  return {
    x: frame.x + b.x * frame.width,
    y: frame.y + b.y * frame.height,
    width: b.width * frame.width,
    height: b.height * frame.height,
  };
}

function effectTransitionBounds(
  effect: EffectRuntimeRenderedFrame,
  clipId: string,
  scale: number
): Rect | null {
  if (effect.target.kind !== 'transition') return null;
  if (effect.target.leadingClipId !== clipId && effect.target.trailingClipId !== clipId)
    return null;
  return { x: 0, y: 0, width: effect.logicalWidth * scale, height: effect.logicalHeight * scale };
}

function isAnnotationSurface(node: ResolvedAnnotationRenderNode): boolean {
  return node.nodeType === 'group' || node.nodeType === 'mask' || node.nodeType === 'rect';
}

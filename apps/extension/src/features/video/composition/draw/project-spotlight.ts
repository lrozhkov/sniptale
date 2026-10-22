import { projectSourceContentRect } from '../motion/source-window';
import type { VideoProject } from '../../project/types';
import type {
  VideoCompositionFrame,
  VideoCompositionSpotlightState,
  VideoCompositionVisualLayer,
} from '../types';
import { motionCameraProjection } from '../motion/spatial';
import { shouldLockVisualLayerToViewport } from '../motion/layer-camera';
import {
  invertQuickEditProjection,
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../motion/spatial-geometry';
import {
  DEFAULT_CAMERA_APPEARANCE,
  cameraWindowFrame,
  cameraSilhouette,
} from '../../project/camera/appearance';
import { roundedWindowRadius } from '../../project/window-geometry';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import { admittedVisualWindowHeader } from './window-header';
import {
  getFittedMediaWindowFrame,
  getFittedMediaOriginalWindowFrame,
  mapWindowNormalizedPointToVisualLayer,
  type VisualLayerSourcePointMapping,
} from './fitted-media';
import {
  drawSceneSpotlights,
  type SceneSpotlightLayer,
  type SceneSpotlightClip,
} from './spotlight';
import { resolveSceneSpotlightTarget, sampleSceneSpotlight } from '../scene-spotlight';

type Rect = VideoCompositionSpotlightState['spotlight']['area'];

/** Native phases and linked gaps supply protection independently of their attachment projection. */
export function sampleCompositionSpotlightLayer(args: {
  state: VideoCompositionSpotlightState;
  window: Rect;
  extent: Rect;
  scale: number;
  projection: QuickEditHomography;
  clip?: SceneSpotlightClip;
}): SceneSpotlightLayer {
  const { state, window, scale } = args;
  const target = resolveSceneSpotlightTarget(state.spotlight, window, scale);
  const sample = sampleSceneSpotlight({
    spotlight: state.spotlight,
    window,
    extent: args.extent,
    scale,
    phase: state.phase,
    progress: state.progress,
    ...(state.from ? { from: resolveSceneSpotlightTarget(state.from, window, scale) } : {}),
  });
  const reveal = state.phase === 'exit' ? state.spotlight.exitReveal : state.spotlight.reveal;
  const protection = state.from ? sample : target;
  return {
    ...sample,
    projection: args.projection,
    ...(args.clip ? { clip: args.clip } : {}),
    protectionOpening: protection.opening,
    protectionRadius: protection.radius,
    presence: state.from ? 1 : state.progress,
    openingClipProgress: state.from || reveal !== 'contract' ? 1 : state.progress,
  };
}

/** Resolve attachment geometry after Native effects and transitions, in final raster coordinates. */
export function resolveCompositionSceneSpotlights(
  args: CompositionSpotlightGeometry
): SceneSpotlightLayer[] {
  const output = affineProjection(args.transform);
  const fit: QuickEditHomography = [
    args.composition.scale,
    0,
    args.composition.x,
    0,
    args.composition.scale,
    args.composition.y,
    0,
    0,
    1,
  ];
  const results: SceneSpotlightLayer[] = [];
  for (const state of args.frame.sceneSpotlights ?? []) {
    if (!state.clipId) {
      results.push(
        sampleCompositionSpotlightLayer({
          state,
          window: args.viewport,
          extent: args.viewport,
          projection: output,
          scale: args.composition.scale * projectionDensity(output, args.viewport),
        })
      );
      continue;
    }
    const bound = resolveBoundSceneSpotlight(args, state, output, fit);
    if (bound) results.push(bound);
  }
  return results;
}

function resolveBoundSceneSpotlight(
  args: CompositionSpotlightGeometry,
  state: VideoCompositionSpotlightState,
  output: QuickEditHomography,
  fit: QuickEditHomography
): SceneSpotlightLayer | null {
  const layer = args.frame.visualLayers.find(
    (item) => item.kind === 'video' && item.clipId === state.clipId
  );
  if (!layer || layer.kind !== 'video' || layer.opacity <= 0) return null;
  const attachment = spotlightWindowAttachment(args, layer, state.coordinateSpace);
  if (!attachment) return null;
  const camera = shouldLockVisualLayerToViewport(layer, args.frame.camera)
    ? IDENTITY_PROJECTION
    : args.frame.camera.spatial
      ? motionCameraProjection(args.frame.camera)
      : ([
          args.frame.camera.scale,
          0,
          -args.frame.camera.viewportX * args.frame.camera.scale,
          0,
          args.frame.camera.scale,
          -args.frame.camera.viewportY * args.frame.camera.scale,
          0,
          0,
          1,
        ] as const);
  if (!camera) return null;
  const projection = composeProjection(
    output,
    composeProjection(fit, composeProjection(camera, attachment.projection))
  );
  if (rectCorners(attachment.window).some((point) => !projectQuickEditPoint(projection, point)))
    return null;
  const extent = spotlightViewportExtent(args.viewport, output, projection);
  if (!extent) return null;
  const sample = sampleCompositionSpotlightLayer({
    state,
    window: attachment.window,
    extent,
    projection,
    clip: attachment.clip,
    scale: projectionDensity(projection, attachment.window) * attachment.sourceScale,
  });
  const opacity = Math.max(0, Math.min(1, layer.opacity));
  const weight = state.sourceTransition?.blend ? layer.renderState.opacityMultiplier : 1;
  const strengthOpacity = weight > 0 ? Math.min(1, opacity / weight) : 0;
  return {
    ...sample,
    dim: sample.dim * strengthOpacity,
    blur: sample.blur * strengthOpacity,
    presence: (sample.presence ?? 1) * opacity,
    ...(state.sourceTransition?.blend
      ? { blend: { groupId: state.sourceTransition.id, weight } }
      : {}),
  };
}

function spotlightViewportExtent(
  viewport: Rect,
  output: QuickEditHomography,
  projection: QuickEditHomography
): Rect | null {
  const inverse = invertQuickEditProjection(projection);
  if (!inverse) return null;
  const corners = rectCorners(viewport)
    .map((point) => projectQuickEditPoint(output, point))
    .map((point) => point && projectQuickEditPoint(inverse, point));
  if (corners.some((point) => !point)) return null;
  const xs = corners.map((point) => point!.x),
    ys = corners.map((point) => point!.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/** Both Native runtimes apply scene masks once, before viewport overlays and viewport borders. */
export function drawCompositionSceneSpotlights(
  args: Omit<CompositionSpotlightGeometry, 'transform'> & {
    context: CanvasRenderingContext2D;
    afterClipId?: string;
    blurSource?: () => HTMLCanvasElement | OffscreenCanvas;
  }
): void {
  const states = args.frame.sceneSpotlights?.filter(
    (state) => state.afterClipId === args.afterClipId
  );
  if (!states?.length) return;
  const transform = args.context.getTransform();
  const layers = resolveCompositionSceneSpotlights({
    ...args,
    frame: { ...args.frame, sceneSpotlights: states },
    transform,
  });
  if (!layers.length) return;
  args.context.save();
  try {
    args.context.beginPath();
    args.context.rect(args.viewport.x, args.viewport.y, args.viewport.width, args.viewport.height);
    args.context.clip();
    args.context.setTransform(1, 0, 0, 1, 0, 0);
    const source =
      layers.some((layer) => layer.blur > 0) && args.blurSource
        ? args.blurSource()
        : args.context.canvas;
    drawSceneSpotlights(args.context, source, null, layers);
  } finally {
    args.context.restore();
  }
}

type CompositionSpotlightGeometry = {
  project: Pick<VideoProject, 'assets'>;
  frame: Pick<VideoCompositionFrame, 'sceneSpotlights' | 'visualLayers' | 'camera'>;
  images: Record<string, HTMLImageElement>;
  viewport: Rect;
  composition: { x: number; y: number; scale: number };
  transform: Pick<DOMMatrixReadOnly, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>;
};
const IDENTITY_PROJECTION: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function spotlightWindowAttachment(
  args: CompositionSpotlightGeometry,
  layer: Extract<VideoCompositionVisualLayer, { kind: 'video' }>,
  coordinateSpace?: 'source-window'
) {
  const metadata = args.project.assets.find((asset) => asset.id === layer.clip.assetId)?.metadata;
  if (!metadata || metadata.width <= 0 || metadata.height <= 0) return null;
  const header = admittedVisualWindowHeader(layer.clip, args.images, layer.trackRole === 'CAMERA');
  const camera =
    layer.trackRole === 'CAMERA'
      ? (layer.clip.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE)
      : undefined;
  const frame = {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
  };
  const mapping: VisualLayerSourcePointMapping = {
    point: { x: 0, y: 0 },
    ...(coordinateSpace ? { coordinateSpace } : {}),
    frame,
    renderState: layer.renderState ?? IDENTITY_TRANSITION_VISUAL_STATE,
    fitMode: layer.clip.fitMode,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    ...(layer.clip.sourceCrop ? { sourceCrop: layer.clip.sourceCrop } : {}),
    ...(header.windowHeader ? { windowHeader: header.windowHeader } : {}),
    ...(camera ? { cameraAppearance: camera } : {}),
  };
  const visibleWindow = camera
    ? cameraWindowFrame(frame, camera.shape)
    : getFittedMediaWindowFrame(mapping);
  const window =
    !camera && coordinateSpace === 'source-window'
      ? getFittedMediaOriginalWindowFrame(mapping)
      : visibleWindow;
  if (window.width <= 0 || window.height <= 0) return null;
  const origin = mapWindowNormalizedPointToVisualLayer(mapping);
  const right = mapWindowNormalizedPointToVisualLayer({ ...mapping, point: { x: 1, y: 0 } });
  const bottom = mapWindowNormalizedPointToVisualLayer({ ...mapping, point: { x: 0, y: 1 } });
  if (!origin || !right || !bottom) return null;
  const a = (right.x - origin.x) / window.width,
    b = (right.y - origin.y) / window.width;
  const c = (bottom.x - origin.x) / window.height,
    d = (bottom.y - origin.y) / window.height;
  const projection: QuickEditHomography = [
    a,
    c,
    origin.x - a * window.x - c * window.y,
    b,
    d,
    origin.y - b * window.x - d * window.y,
    0,
    0,
    1,
  ];
  const radius = camera
    ? (Math.min(visibleWindow.width, visibleWindow.height) * camera.roundness) / 200
    : roundedWindowRadius(
        visibleWindow.width,
        visibleWindow.height,
        layer.clip.windowCornerRadius ?? 0
      );
  const clip: SceneSpotlightClip = {
    rect: visibleWindow,
    radius,
    ...(camera && camera.shape !== 'rounded'
      ? {
          outline: cameraSilhouette(window.width, window.height, camera).map((point) => ({
            x: point.x / window.width,
            y: point.y / window.height,
          })),
        }
      : {}),
  };
  const source =
    coordinateSpace === 'source-window' && layer.sourceContentTransform
      ? projectSourceContentRect(window, layer.sourceContentTransform)
      : null;
  return { window: source?.rect ?? window, clip, projection, sourceScale: source?.scale ?? 1 };
}

function affineProjection(
  transform: CompositionSpotlightGeometry['transform']
): QuickEditHomography {
  return [transform.a, transform.c, transform.e, transform.b, transform.d, transform.f, 0, 0, 1];
}
function composeProjection(a: QuickEditHomography, b: QuickEditHomography): QuickEditHomography {
  const cell = (row: number, column: number) =>
    a[row * 3]! * b[column]! + a[row * 3 + 1]! * b[column + 3]! + a[row * 3 + 2]! * b[column + 6]!;
  return [
    cell(0, 0),
    cell(0, 1),
    cell(0, 2),
    cell(1, 0),
    cell(1, 1),
    cell(1, 2),
    cell(2, 0),
    cell(2, 1),
    cell(2, 2),
  ];
}
function rectCorners(rect: Rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}
function projectionDensity(matrix: QuickEditHomography, rect: Rect): number {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const p = projectQuickEditPoint(matrix, center);
  const x = projectQuickEditPoint(matrix, { ...center, x: center.x + 1 });
  const y = projectQuickEditPoint(matrix, { ...center, y: center.y + 1 });
  return p && x && y
    ? (Math.hypot(x.x - p.x, x.y - p.y) + Math.hypot(y.x - p.x, y.y - p.y)) / 2
    : 0;
}

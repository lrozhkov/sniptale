import { drawCompositionSceneSpotlights } from '../../draw/project-spotlight';
import { splitVisualLayersForSourceSpotlights } from '../../visual-pass-layers';

type SourceSceneInput = Pick<
  Parameters<typeof drawCompositionSceneSpotlights>[0],
  'project' | 'frame'
>;
import { drawSpatialCompositionGroup } from '../../draw/spatial';
import { resolveEffectRuntimeVisualLayers } from '../../draw/effect-runtime';
import { segmentVisualLayersByViewportLock } from '../../motion/layer-camera';
import type { ReviewSpatialRenderer } from '../../canvas/spatial-renderer';
import { shouldLockVisualLayerToViewport } from '../../motion/layer-camera';
import type { VideoCompositionCameraState } from '../../types';
import type { EffectRuntimeRenderedFrameMap } from '../runtime/types';
import { acquireVideoCompositionBuffer } from '../../canvas/buffer-pool';
import {
  createEffectRuntimeDrawState,
  drawEffectRuntimeVisualLayer,
  drawCompositionVisualLayer,
} from '../../draw/index';
import type { VideoCompositionMediaSource } from '../../draw/media-source';
import type { VideoCompositionVisualLayer } from '../../types';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../../project/transition/presentation.types';
import type { EffectRuntimeInputMaterializer } from '../runtime/driver';
import {
  closeEffectRuntimeBitmap,
  createEffectRuntimeCompositionResourceLedger,
  type EffectRuntimeFrameResourceScope,
} from '../runtime/resource-limits';

type BackgroundPainter = (
  context: CanvasRenderingContext2D,
  dimensions: { width: number; height: number }
) => void;

export function createEffectRuntimeInputMaterializer(args: {
  drawBackground?: BackgroundPainter;
  scene?: SourceSceneInput;
  camera?: VideoCompositionCameraState;
  spatialRenderer?: () => ReviewSpatialRenderer;
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>;
  createBitmap?: (source: CanvasImageSource) => Promise<ImageBitmap>;
  imageBank: Record<string, HTMLImageElement>;
  ownerDocument?: Document;
  resourceScope?: EffectRuntimeFrameResourceScope;
  visualLayers: readonly VideoCompositionVisualLayer[];
}): EffectRuntimeInputMaterializer {
  args = {
    ...args,
    visualLayers: args.visualLayers.map((layer) =>
      layer.kind === 'video' ? { ...layer, actions: [] } : layer
    ),
  };
  const ownerDocument = args.ownerDocument ?? document;
  const createBitmap = args.createBitmap ?? createOwnerBoundBitmapFactory(ownerDocument);
  const resourceScope =
    args.resourceScope ?? createEffectRuntimeCompositionResourceLedger().createFrameScope();
  return {
    materializeTargetSource: (plan, frames) =>
      materializeTargetSource(
        { ...args, createBitmap, ownerDocument, resourceScope, frames: frames ?? new Map() },
        plan
      ),
    materializeTransitionInputs: (plan, frames) =>
      materializeTransitionInputs(
        { ...args, createBitmap, ownerDocument, resourceScope, frames: frames ?? new Map() },
        plan
      ),
  };
}

function createOwnerBoundBitmapFactory(
  ownerDocument: Document
): (source: CanvasImageSource) => Promise<ImageBitmap> {
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) fail();
  return (source) => ownerWindow.createImageBitmap(source);
}

type MaterializerArgs = Omit<
  Parameters<typeof drawIsolatedLayer>[0],
  'dimensions' | 'layer' | 'layers' | 'renderDimensions'
> & {
  visualLayers: readonly VideoCompositionVisualLayer[];
};

async function materializeTargetSource(
  args: MaterializerArgs,
  plan: Parameters<EffectRuntimeInputMaterializer['materializeTargetSource']>[0]
): Promise<ImageBitmap> {
  if (plan.target.kind === 'track' || plan.target.kind === 'video-group') {
    const ids = new Set(plan.target.clipIds);
    return drawIsolatedLayer({
      ...args,
      dimensions: plan.dimensions,
      renderDimensions: plan.renderDimensions,
      layers: args.visualLayers.filter((layer) => ids.has(layer.clipId)),
    });
  }
  if (plan.target.kind !== 'clip') fail();
  const layer = findLayer(args.visualLayers, plan.target.clipId);
  if (!layer) fail();
  const isolated = { ...layer };
  if (isolated.kind === 'effect') delete isolated.sourceAttachment;
  return drawIsolatedLayer({
    ...args,
    dimensions: plan.dimensions,
    renderDimensions: plan.renderDimensions,
    layer: {
      ...isolated,
      height: plan.target.placement.height,
      opacity: 1,
      renderState: IDENTITY_TRANSITION_VISUAL_STATE,
      rotation: 0,
      width: plan.target.placement.width,
      x: plan.bitmapBounds ? -plan.bitmapBounds.x * plan.target.placement.width : 0,
      y: plan.bitmapBounds ? -plan.bitmapBounds.y * plan.target.placement.height : 0,
    },
  });
}

async function materializeTransitionInputs(
  args: MaterializerArgs,
  plan: Parameters<EffectRuntimeInputMaterializer['materializeTransitionInputs']>[0]
): Promise<{ from: ImageBitmap; to: ImageBitmap }> {
  if (plan.target.kind !== 'transition') fail();
  const leading = findLayer(args.visualLayers, plan.target.leadingClipId);
  const trailing = findLayer(args.visualLayers, plan.target.trailingClipId);
  if (!leading || !trailing) fail();
  const from = await drawIsolatedLayer({
    ...args,
    dimensions: plan.dimensions,
    renderDimensions: plan.renderDimensions,
    layer: { ...leading, opacity: 1, renderState: IDENTITY_TRANSITION_VISUAL_STATE },
  });
  try {
    const to = await drawIsolatedLayer({
      ...args,
      dimensions: plan.dimensions,
      renderDimensions: plan.renderDimensions,
      layer: { ...trailing, opacity: 1, renderState: IDENTITY_TRANSITION_VISUAL_STATE },
    });
    return { from, to };
  } catch {
    closeEffectRuntimeBitmap(from);
    throw new Error('EFFECT_RUNTIME_FRAME_INPUT_FAILED');
  }
}

async function drawIsolatedLayer(args: {
  drawBackground?: BackgroundPainter;
  scene?: SourceSceneInput;
  frames: EffectRuntimeRenderedFrameMap;
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>;
  createBitmap(source: CanvasImageSource): Promise<ImageBitmap>;
  dimensions: { height: number; width: number };
  imageBank: Record<string, HTMLImageElement>;
  layer?: VideoCompositionVisualLayer;
  layers?: readonly VideoCompositionVisualLayer[];
  camera?: VideoCompositionCameraState;
  spatialRenderer?: () => ReviewSpatialRenderer;
  ownerDocument: Document;
  renderDimensions: { height: number; width: number };
  resourceScope: EffectRuntimeFrameResourceScope;
}): Promise<ImageBitmap> {
  const releaseCanvas = args.resourceScope.allocateCanvas(
    args.renderDimensions.width,
    args.renderDimensions.height
  );
  let lease: ReturnType<typeof acquireVideoCompositionBuffer> = null;
  try {
    lease = acquireVideoCompositionBuffer(
      args.renderDimensions.width,
      args.renderDimensions.height,
      args.ownerDocument
    );
    if (!lease) fail();
    const canvas = lease.canvas;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
    if (!context) fail();
    context.reset?.();
    context.clearRect(0, 0, canvas.width, canvas.height);
    const state = createEffectRuntimeDrawState();
    const deferredBorder =
      args.layer?.kind === 'video' &&
      args.scene?.frame.sceneSpotlights?.some((mask) => mask.afterClipId === args.layer?.clipId);
    drawInputLayers(
      deferredBorder && args.layer?.kind === 'video'
        ? { ...args, layer: { ...args.layer, borders: [] } }
        : args,
      context,
      state
    );
    const bitmap = await args.createBitmap(canvas);
    if (bitmap.width !== canvas.width || bitmap.height !== canvas.height) {
      bitmap.close();
      fail();
    }
    try {
      args.resourceScope.retainBitmap(bitmap, false);
    } catch {
      bitmap.close();
      throw new Error('EFFECT_RUNTIME_FRAME_INPUT_FAILED');
    }
    return bitmap;
  } finally {
    lease?.release();
    releaseCanvas();
  }
}

function drawInputLayers(
  args: Parameters<typeof drawIsolatedLayer>[0],
  context: CanvasRenderingContext2D,
  state = createEffectRuntimeDrawState()
) {
  if (!drawSpatialInputLayers(args, context, state)) {
    const layers = args.layers
      ? resolveEffectRuntimeVisualLayers([...args.layers], args.frames)
      : args.layer
        ? [args.layer]
        : [];
    const parts = args.layers
      ? splitVisualLayersForSourceSpotlights(layers, args.scene?.frame.sceneSpotlights)
      : [{ layers }];
    for (const part of parts) {
      for (const layer of part.layers) {
        context.save();
        const grouped = [...args.frames.values()].some(
          (frame) =>
            (frame.target.kind === 'track' || frame.target.kind === 'video-group') &&
            frame.target.clipIds.includes(layer.clipId)
        );
        if (
          args.layers &&
          args.camera &&
          !grouped &&
          !shouldLockVisualLayerToViewport(layer, args.camera)
        ) {
          context.scale(args.camera.scale, args.camera.scale);
          context.translate(
            (-args.camera.viewportX * args.renderDimensions.width) / args.dimensions.width,
            (-args.camera.viewportY * args.renderDimensions.height) / args.dimensions.height
          );
        }
        if (
          !drawEffectRuntimeVisualLayer({
            context,
            frames: args.frames,
            layer,
            scaleX: args.renderDimensions.width / args.dimensions.width,
            scaleY: args.renderDimensions.height / args.dimensions.height,
            state,
          })
        )
          drawCompositionVisualLayer(
            context,
            layer,
            args.renderDimensions.width / args.dimensions.width,
            args.renderDimensions.height / args.dimensions.height,
            args.imageBank,
            args.clipMediaElements
          );
        context.restore();
      }
      if (part.afterClipId) drawSourceSceneMask(args, context, part.afterClipId);
    }
  }
}

/** Camera-baked track/group inputs retain viewport rasters and project only unbaked scene segments. */
function drawSpatialInputLayers(
  args: Parameters<typeof drawIsolatedLayer>[0],
  context: CanvasRenderingContext2D,
  state: ReturnType<typeof createEffectRuntimeDrawState>
): boolean {
  if (!args.layers || !args.camera?.spatial) return false;
  const sx = args.renderDimensions.width / args.dimensions.width;
  const sy = args.renderDimensions.height / args.dimensions.height;
  const layers = resolveEffectRuntimeVisualLayers([...args.layers], args.frames);
  for (const segment of segmentVisualLayersByViewportLock(layers, args.camera)) {
    for (const part of splitVisualLayersForSourceSpotlights(
      segment.layers,
      args.scene?.frame.sceneSpotlights
    )) {
      if (!segment.isLocked) {
        if (!args.spatialRenderer) throw new Error('EFFECT_RUNTIME_SPATIAL_RENDERER_UNAVAILABLE');
        drawSpatialCompositionGroup({
          camera: args.camera,
          context,
          renderer: args.spatialRenderer(),
          clipMediaElements: args.clipMediaElements,
          imageBank: args.imageBank,
          layers: part.layers,
          frames: args.frames,
          effectState: state,
          logicalSize: args.dimensions,
          output: args.renderDimensions,
          rasterScale: sx,
          destination: { x: 0, y: 0, ...args.renderDimensions },
        });
      } else {
        for (const layer of part.layers) {
          context.save();
          try {
            if (
              !drawEffectRuntimeVisualLayer({
                context,
                layer,
                frames: args.frames,
                scaleX: sx,
                scaleY: sy,
                state,
              })
            )
              drawCompositionVisualLayer(
                context,
                layer,
                sx,
                sy,
                args.imageBank,
                args.clipMediaElements
              );
          } finally {
            context.restore();
          }
        }
      }
      if (part.afterClipId) drawSourceSceneMask(args, context, part.afterClipId);
    }
  }
  return true;
}

/** Flatten groups only after source scene masks have processed their authored lower layers. */
function drawSourceSceneMask(
  args: Parameters<typeof drawIsolatedLayer>[0],
  context: CanvasRenderingContext2D,
  clipId: string
) {
  if (!args.scene?.frame.sceneSpotlights?.some((state) => state.afterClipId === clipId)) return;
  let releaseBackdrop: () => void = () => undefined;
  context.save();
  try {
    context.scale(
      args.renderDimensions.width / args.dimensions.width,
      args.renderDimensions.height / args.dimensions.height
    );
    drawCompositionSceneSpotlights({
      ...args.scene,
      context,
      afterClipId: clipId,
      images: args.imageBank,
      viewport: { x: 0, y: 0, ...args.dimensions },
      composition: { x: 0, y: 0, scale: 1 },
      blurSource: () => {
        if (!args.drawBackground) throw new Error('EFFECT_RUNTIME_SOURCE_SCENE_BACKDROP_MISSING');
        const releaseCanvas = args.resourceScope.allocateCanvas(
          args.renderDimensions.width,
          args.renderDimensions.height
        );
        releaseBackdrop = releaseCanvas;
        const backdrop = acquireVideoCompositionBuffer(
          args.renderDimensions.width,
          args.renderDimensions.height,
          args.ownerDocument
        );
        if (!backdrop) fail();
        releaseBackdrop = () => {
          backdrop.release();
          releaseCanvas();
        };
        const target = backdrop.canvas.getContext('2d') as CanvasRenderingContext2D | null;
        if (!target) fail();
        target.reset?.();
        target.clearRect(0, 0, args.renderDimensions.width, args.renderDimensions.height);
        args.drawBackground(target, args.renderDimensions);
        const frame = args.scene!.frame;
        const sourceIndex = frame.visualLayers.findIndex((layer) => layer.clipId === clipId);
        const members = new Set(args.layers?.map((layer) => layer.clipId));
        const lower = frame.visualLayers
          .slice(0, Math.max(0, sourceIndex))
          .filter((layer) => !members.has(layer.clipId))
          .map((layer) => (layer.kind === 'video' ? { ...layer, actions: [] } : layer));
        if (lower.length) drawInputLayers({ ...args, layers: lower }, target);
        target.drawImage(context.canvas, 0, 0);
        return backdrop.canvas;
      },
    });
  } finally {
    context.restore();
    releaseBackdrop();
  }
}

function findLayer(
  layers: readonly VideoCompositionVisualLayer[],
  clipId: string
): VideoCompositionVisualLayer | null {
  return layers.find((layer) => layer.clipId === clipId) ?? null;
}

function fail(): never {
  throw new Error('EFFECT_RUNTIME_FRAME_INPUT_FAILED');
}

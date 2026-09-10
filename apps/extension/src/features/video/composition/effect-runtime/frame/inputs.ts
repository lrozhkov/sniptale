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

export function createEffectRuntimeInputMaterializer(args: {
  camera?: VideoCompositionCameraState;
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
  return drawIsolatedLayer({
    ...args,
    dimensions: plan.dimensions,
    renderDimensions: plan.renderDimensions,
    layer: {
      ...layer,
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
  frames: EffectRuntimeRenderedFrameMap;
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>;
  createBitmap(source: CanvasImageSource): Promise<ImageBitmap>;
  dimensions: { height: number; width: number };
  imageBank: Record<string, HTMLImageElement>;
  layer?: VideoCompositionVisualLayer;
  layers?: readonly VideoCompositionVisualLayer[];
  camera?: VideoCompositionCameraState;
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
    for (const layer of args.layers ?? (args.layer ? [args.layer] : [])) {
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

function findLayer(
  layers: readonly VideoCompositionVisualLayer[],
  clipId: string
): VideoCompositionVisualLayer | null {
  return layers.find((layer) => layer.clipId === clipId) ?? null;
}

function fail(): never {
  throw new Error('EFFECT_RUNTIME_FRAME_INPUT_FAILED');
}

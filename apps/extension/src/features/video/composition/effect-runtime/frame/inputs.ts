import { drawCompositionVisualLayer } from '../../draw/index';
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
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>;
  createBitmap?: (source: CanvasImageSource) => Promise<ImageBitmap>;
  imageBank: Record<string, HTMLImageElement>;
  ownerDocument?: Document;
  resourceScope?: EffectRuntimeFrameResourceScope;
  visualLayers: readonly VideoCompositionVisualLayer[];
}): EffectRuntimeInputMaterializer {
  const ownerDocument = args.ownerDocument ?? document;
  const createBitmap = args.createBitmap ?? createOwnerBoundBitmapFactory(ownerDocument);
  const resourceScope =
    args.resourceScope ?? createEffectRuntimeCompositionResourceLedger().createFrameScope();
  return {
    materializeTargetSource: (plan) =>
      materializeTargetSource({ ...args, createBitmap, ownerDocument, resourceScope }, plan),
    materializeTransitionInputs: (plan) =>
      materializeTransitionInputs({ ...args, createBitmap, ownerDocument, resourceScope }, plan),
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
  'dimensions' | 'layer' | 'renderDimensions'
> & {
  visualLayers: readonly VideoCompositionVisualLayer[];
};

async function materializeTargetSource(
  args: MaterializerArgs,
  plan: Parameters<EffectRuntimeInputMaterializer['materializeTargetSource']>[0]
): Promise<ImageBitmap> {
  if (plan.target.kind !== 'clip') fail();
  const layer = findLayer(args.visualLayers, plan.target.clipId);
  if (!layer) fail();
  return drawIsolatedLayer({
    ...args,
    dimensions: plan.dimensions,
    renderDimensions: plan.renderDimensions,
    layer: {
      ...layer,
      height: plan.dimensions.height,
      opacity: 1,
      renderState: IDENTITY_TRANSITION_VISUAL_STATE,
      rotation: 0,
      width: plan.dimensions.width,
      x: 0,
      y: 0,
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
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>;
  createBitmap(source: CanvasImageSource): Promise<ImageBitmap>;
  dimensions: { height: number; width: number };
  imageBank: Record<string, HTMLImageElement>;
  layer: VideoCompositionVisualLayer;
  ownerDocument: Document;
  renderDimensions: { height: number; width: number };
  resourceScope: EffectRuntimeFrameResourceScope;
}): Promise<ImageBitmap> {
  const releaseCanvas = args.resourceScope.allocateCanvas(
    args.renderDimensions.width,
    args.renderDimensions.height
  );
  const canvas = args.ownerDocument.createElement('canvas');
  canvas.width = args.renderDimensions.width;
  canvas.height = args.renderDimensions.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) fail();
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawCompositionVisualLayer(
      context,
      args.layer,
      args.renderDimensions.width / args.dimensions.width,
      args.renderDimensions.height / args.dimensions.height,
      args.imageBank,
      args.clipMediaElements
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

import { admittedVisualWindowHeader } from './window-header';
import { drawVideoLayer } from './video';
import { getFittedMediaContentFrame, getFittedMediaWindowFrame } from './fitted-media';
import { roundedWindowRadius } from '../../project/window-geometry';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types.ts';
import type { VideoCompositionVisualLayer } from '../types';
import { drawAnnotationCompositionLayer } from './annotation';
import { drawFittedMediaLayer } from './fitted-media';
import { drawTextCompositionLayer } from './overlays';
import { drawShapeCompositionLayer } from './shape';
import { type VideoCompositionMediaSource } from './media-source';

export function drawCompositionVisualLayer(
  context: CanvasRenderingContext2D,
  layer: VideoCompositionVisualLayer,
  scaleX: number,
  scaleY: number,
  loadedImages: Record<string, HTMLImageElement>,
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>,
  opacityMultiplier = 1
): void {
  const frame = getScaledLayerFrame(layer, scaleX, scaleY);
  const displayScale = (scaleX + scaleY) / 2;
  const renderState = layer.renderState ?? IDENTITY_TRANSITION_VISUAL_STATE;
  const blurAmount = renderState.blurAmount * displayScale;
  const filter = buildLayerFilter(blurAmount);

  context.save();
  context.globalAlpha = layer.opacity * opacityMultiplier;
  if (filter) {
    context.filter = filter;
  }
  applyLayerTransform(context, layer, renderState, frame, scaleX, scaleY);
  try {
    drawVisualLayerContent(context, layer, frame, displayScale, loadedImages, clipMediaElements);
  } finally {
    context.restore();
  }
}

export function drawCompositionVisualLayerBitmap(
  context: CanvasRenderingContext2D,
  layer: VideoCompositionVisualLayer,
  bitmap: ImageBitmap,
  scaleX: number,
  scaleY: number,
  opacityMultiplier = 1,
  bitmapBounds = { x: 0, y: 0, width: 1, height: 1 }
): void {
  if (layer.kind === 'effect' && layer.sourceAttachment) {
    drawSourceAttachedEffectBitmap(
      context,
      layer,
      bitmap,
      scaleX,
      scaleY,
      opacityMultiplier,
      bitmapBounds
    );
    return;
  }
  const frame = getScaledLayerFrame(layer, scaleX, scaleY);
  const displayScale = (scaleX + scaleY) / 2;
  const renderState = layer.renderState ?? IDENTITY_TRANSITION_VISUAL_STATE;
  const blurAmount = renderState.blurAmount * displayScale;
  context.save();
  context.globalAlpha = layer.opacity * opacityMultiplier;
  if (blurAmount > 0) context.filter = `blur(${blurAmount.toFixed(2)}px)`;
  applyLayerTransform(context, layer, renderState, frame, scaleX, scaleY);
  context.drawImage(
    bitmap,
    0,
    0,
    bitmap.width,
    bitmap.height,
    frame.x + bitmapBounds.x * frame.width,
    frame.y + bitmapBounds.y * frame.height,
    frame.width * bitmapBounds.width,
    frame.height * bitmapBounds.height
  );
  context.restore();
}

/** Uses the source's static window mask before its disposable inner content camera. */
function drawSourceAttachedEffectBitmap(
  context: CanvasRenderingContext2D,
  layer: Extract<VideoCompositionVisualLayer, { kind: 'effect' }>,
  bitmap: ImageBitmap,
  scaleX: number,
  scaleY: number,
  opacityMultiplier: number,
  bitmapBounds: { x: number; y: number; width: number; height: number }
): void {
  const { sourceAttachment, ...body } = layer;
  if (!sourceAttachment) return;
  const { owner, mapping, innerTransform } = sourceAttachment;
  const window = getFittedMediaWindowFrame(mapping);
  const content = getFittedMediaContentFrame(mapping);
  const radius = roundedWindowRadius(
    window.width * scaleX,
    window.height * scaleY,
    ((mapping.windowCornerRadius ?? 0) * (scaleX + scaleY)) / 2
  );
  context.save();
  try {
    applyLayerTransform(
      context,
      owner,
      owner.renderState,
      getScaledLayerFrame(owner, scaleX, scaleY),
      scaleX,
      scaleY
    );
    context.beginPath();
    if (radius > 0)
      context.roundRect(
        window.x * scaleX,
        window.y * scaleY,
        window.width * scaleX,
        window.height * scaleY,
        radius
      );
    else
      context.rect(
        window.x * scaleX,
        window.y * scaleY,
        window.width * scaleX,
        window.height * scaleY
      );
    context.clip();
    if (mapping.sourceCrop) {
      const crop = mapping.sourceCrop;
      context.beginPath();
      context.rect(
        (content.x + crop.x * content.width) * scaleX,
        (content.y + crop.y * content.height) * scaleY,
        crop.width * content.width * scaleX,
        crop.height * content.height * scaleY
      );
      context.clip();
    }
    if (innerTransform)
      context.transform(
        innerTransform[0],
        (innerTransform[3] * scaleY) / scaleX,
        (innerTransform[1] * scaleX) / scaleY,
        innerTransform[4],
        innerTransform[2] * scaleX,
        innerTransform[5] * scaleY
      );
    context.translate(content.x * scaleX, content.y * scaleY);
    context.scale(content.width / mapping.sourceWidth, content.height / mapping.sourceHeight);
    drawCompositionVisualLayerBitmap(
      context,
      body,
      bitmap,
      scaleX,
      scaleY,
      opacityMultiplier * owner.opacity,
      bitmapBounds
    );
  } finally {
    context.restore();
  }
}

function buildLayerFilter(blurAmount: number): string {
  const filters = [];
  if (blurAmount > 0) {
    filters.push(`blur(${blurAmount.toFixed(2)}px)`);
  }
  return filters.join(' ');
}

function drawVisualLayerContent(
  context: CanvasRenderingContext2D,
  layer: VideoCompositionVisualLayer,
  frame: ReturnType<typeof getScaledLayerFrame>,
  displayScale: number,
  loadedImages: Record<string, HTMLImageElement>,
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>
) {
  switch (layer.kind) {
    case 'video':
      drawVideoLayer(context, layer, frame, displayScale, clipMediaElements, loadedImages);
      break;
    case 'image':
      drawImageLayer(context, layer, frame, displayScale, loadedImages);
      break;
    case 'text':
      drawTextLayer(context, layer, frame, displayScale);
      break;
    case 'annotation':
      drawAnnotationLayer(context, layer, frame, displayScale);
      break;
    case 'effect':
      break;
    case 'shape':
      drawShapeCompositionLayer(
        context,
        layer.clip,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        loadedImages
      );
      break;
  }
}

function drawTextLayer(
  context: CanvasRenderingContext2D,
  layer: Extract<VideoCompositionVisualLayer, { kind: 'text' }>,
  frame: ReturnType<typeof getScaledLayerFrame>,
  displayScale: number
): void {
  drawTextCompositionLayer(
    context,
    layer.clip,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    displayScale
  );
}

function drawAnnotationLayer(
  context: CanvasRenderingContext2D,
  layer: Extract<VideoCompositionVisualLayer, { kind: 'annotation' }>,
  frame: ReturnType<typeof getScaledLayerFrame>,
  displayScale: number
): void {
  drawAnnotationCompositionLayer(
    context,
    layer.clip,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    displayScale
  );
}

function getScaledLayerFrame(layer: VideoCompositionVisualLayer, scaleX: number, scaleY: number) {
  return {
    height: layer.height * scaleY,
    width: layer.width * scaleX,
    x: layer.x * scaleX,
    y: layer.y * scaleY,
  };
}

function applyLayerTransform(
  context: CanvasRenderingContext2D,
  layer: VideoCompositionVisualLayer,
  renderState: typeof IDENTITY_TRANSITION_VISUAL_STATE,
  frame: ReturnType<typeof getScaledLayerFrame>,
  scaleX: number,
  scaleY: number
) {
  const offsetX = renderState.translateX * scaleX;
  const offsetY = renderState.translateY * scaleY;
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const hasScale = renderState.scaleX !== 1 || renderState.scaleY !== 1;
  const hasRotation = layer.rotation !== 0;
  const hasOffset = offsetX !== 0 || offsetY !== 0;

  if (!hasScale && !hasRotation && !hasOffset) {
    return;
  }

  context.translate(centerX + offsetX, centerY + offsetY);
  if (hasScale) {
    context.scale(renderState.scaleX, renderState.scaleY);
  }
  if (hasRotation) {
    context.rotate((layer.rotation * Math.PI) / 180);
  }
  context.translate(-centerX, -centerY);
}

function drawImageLayer(
  context: CanvasRenderingContext2D,
  layer: Extract<VideoCompositionVisualLayer, { kind: 'image' }>,
  frame: ReturnType<typeof getScaledLayerFrame>,
  displayScale: number,
  loadedImages: Record<string, HTMLImageElement>
) {
  const image = loadedImages[layer.clip.assetId];
  if (!image) {
    return;
  }

  const header = admittedVisualWindowHeader(layer.clip, loadedImages, false);
  drawFittedMediaLayer({
    ...header,
    ...(layer.effectActionsOnly ? { hideWindowHeader: true } : {}),
    context,
    displayScale,
    fitMode: layer.clip.fitMode,
    ...(layer.clip.sourceCrop ? { sourceCrop: layer.clip.sourceCrop } : {}),
    frame,
    ...(layer.clip.windowCornerRadius === undefined
      ? {}
      : { windowCornerRadius: layer.clip.windowCornerRadius }),
    shadowIntensity: layer.effectActionsOnly ? 0 : layer.clip.shadowIntensity,
    shadowMode: layer.clip.shadowMode,
    ...(layer.clip.shadowColor === undefined ? {} : { shadowColor: layer.clip.shadowColor }),
    sourceHeight: image.naturalHeight,
    sourceWidth: image.naturalWidth,
    render: (drawX, drawY, drawWidth, drawHeight, drawContext = context) => {
      drawContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    },
  });
}

import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types.ts';
import type { VideoCompositionVisualLayer } from '../types';
import { drawAnnotationCompositionLayer } from './annotation';
import { drawFittedMediaLayer } from './fitted-media';
import { drawTextCompositionLayer } from './overlays';
import { drawShapeCompositionLayer } from './shape';
import { isVideoCompositionFrameSource, type VideoCompositionMediaSource } from './media-source';

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
  drawVisualLayerContent(context, layer, frame, displayScale, loadedImages, clipMediaElements);
  context.restore();
}

export function drawCompositionVisualLayerBitmap(
  context: CanvasRenderingContext2D,
  layer: VideoCompositionVisualLayer,
  bitmap: ImageBitmap,
  scaleX: number,
  scaleY: number,
  opacityMultiplier = 1
): void {
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
    frame.x,
    frame.y,
    frame.width,
    frame.height
  );
  context.restore();
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
      drawVideoLayer(context, layer, frame, displayScale, clipMediaElements);
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

function drawVideoLayer(
  context: CanvasRenderingContext2D,
  layer: Extract<VideoCompositionVisualLayer, { kind: 'video' }>,
  frame: ReturnType<typeof getScaledLayerFrame>,
  displayScale: number,
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>
) {
  const source = clipMediaElements.get(layer.clipId);
  if (!source) {
    return;
  }

  if (
    source instanceof HTMLVideoElement &&
    source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return;
  }

  if (!(source instanceof HTMLVideoElement) && !isVideoCompositionFrameSource(source)) {
    return;
  }

  drawFittedMediaLayer({
    context,
    displayScale,
    fitMode: layer.clip.fitMode,
    frame,
    shadowIntensity: layer.clip.shadowIntensity,
    shadowMode: layer.clip.shadowMode,
    sourceHeight: source instanceof HTMLVideoElement ? source.videoHeight : source.sourceHeight,
    sourceWidth: source instanceof HTMLVideoElement ? source.videoWidth : source.sourceWidth,
    render: (drawX, drawY, drawWidth, drawHeight) => {
      if (source instanceof HTMLVideoElement) {
        context.drawImage(source, drawX, drawY, drawWidth, drawHeight);
        return;
      }
      source.draw(context, drawX, drawY, drawWidth, drawHeight);
    },
  });
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

  drawFittedMediaLayer({
    context,
    displayScale,
    fitMode: layer.clip.fitMode,
    frame,
    shadowIntensity: layer.clip.shadowIntensity,
    shadowMode: layer.clip.shadowMode,
    sourceHeight: image.naturalHeight,
    sourceWidth: image.naturalWidth,
    render: (drawX, drawY, drawWidth, drawHeight) => {
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    },
  });
}

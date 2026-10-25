import { cameraShadowLocalOffset } from '../../project/camera/shadow-direction';
import { drawCompositionBorders } from './border';
import { roundedWindowRadius } from '../../project/window-geometry';
import { cameraWindowFrame } from '../../project/camera/appearance';
import { traceCameraShape } from './media-shadow';
import type { PointerFeedbackSource } from './pointer-feedback';
import { admittedVisualWindowHeader } from './window-header';
import { drawActionCompositionState } from './effects/actions';
import type { VideoCompositionActionState, VideoCompositionVisualLayer } from '../types';
import {
  drawFittedMediaLayer,
  drawCameraMediaSource,
  getFittedMediaWindowFrame,
  getFittedMediaOriginalWindowFrame,
} from './fitted-media';
import {
  isVideoCompositionFrameSource,
  type VideoCompositionMediaSource,
  type VideoCompositionFrameSource,
} from './media-source';
import { drawSceneSpotlights } from './spotlight';
import { sampleCompositionSpotlightLayer } from './project-spotlight';
import type { RenderCanvasLease } from '../canvas/render-resources';
import type { QuickEditHomography } from '../motion/spatial-geometry';

type VideoFrame = Pick<VideoCompositionVisualLayer, 'x' | 'y' | 'width' | 'height'>;

/** Video windows own source isolation, decorations and sharp feedback in one draw transaction. */
export function drawVideoLayer(
  context: CanvasRenderingContext2D,
  layer: Extract<VideoCompositionVisualLayer, { kind: 'video' }>,
  frame: VideoFrame,
  displayScale: number,
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>,
  loadedImages: Record<string, HTMLImageElement>
) {
  const source = clipMediaElements.get(layer.clipId);
  if (!isReadyVideoSource(source)) return;
  const media = resolveVideoWindowMedia(layer, source, displayScale, loadedImages);
  const paintSource = (
    target: CanvasRenderingContext2D,
    destination: typeof frame,
    x: number,
    y: number,
    width: number,
    height: number
  ) =>
    drawCameraMediaSource(
      target,
      destination,
      layer.trackRole === 'CAMERA' && layer.clip.cameraMirrored === true,
      () => {
        if (source instanceof HTMLVideoElement) target.drawImage(source, x, y, width, height);
        else source.draw(target, x, y, width, height);
      }
    );
  const drawContent = (
    target: CanvasRenderingContext2D,
    destination: VideoFrame,
    visible: VideoFrame,
    paint: () => void
  ) => {
    const transform = layer.sourceContentTransform;
    if (!transform || media.windowHeaderImage) return paint();
    target.save();
    try {
      target.beginPath();
      target.rect(visible.x, visible.y, visible.width, visible.height);
      target.clip();
      target.translate(destination.x, destination.y);
      target.scale(destination.width / frame.width, destination.height / frame.height);
      target.translate(-frame.x, -frame.y);
      target.transform(
        transform[0],
        transform[3],
        transform[1],
        transform[4],
        transform[2] * displayScale,
        transform[5] * displayScale
      );
      target.translate(frame.x, frame.y);
      target.scale(frame.width / destination.width, frame.height / destination.height);
      target.translate(-destination.x, -destination.y);
      paint();
    } finally {
      target.restore();
    }
  };
  const feedbackSource: PointerFeedbackSource = {
    rect: frame,
    draw: (target, x, y, width, height) => {
      const destination = { x, y, width, height };
      drawFittedMediaLayer({
        ...media,
        context: target,
        frame: destination,
        displayScale: (displayScale * width) / Math.max(0.001, frame.width),
        // The action context already includes the source-content camera.
        render: (drawX, drawY, drawWidth, drawHeight, drawContext = target) =>
          paintSource(drawContext, destination, drawX, drawY, drawWidth, drawHeight),
      });
    },
  };
  const deferActions =
    (!layer.effectActionsOnly || layer.deferSourceBorders) &&
    (!!layer.borders?.length || !!layer.spotlights?.length) &&
    !!layer.actions?.length;
  const paintWindow = (target: CanvasRenderingContext2D) =>
    drawFittedMediaLayer({
      ...media,
      ...(layer.sourceContentTransform
        ? { sourceContentTransform: layer.sourceContentTransform }
        : {}),
      ...(layer.effectActionsOnly ? { hideWindowHeader: true } : {}),
      context: target,
      frame,
      render: (drawX, drawY, drawWidth, drawHeight, drawContext = target, visibleContent) =>
        drawContent(
          drawContext,
          frame,
          visibleContent ?? { x: drawX, y: drawY, width: drawWidth, height: drawHeight },
          () => {
            if (!layer.effectActionsOnly)
              paintSource(drawContext, frame, drawX, drawY, drawWidth, drawHeight);
            if (!deferActions)
              drawVideoSourceActions(
                drawContext,
                layer,
                frame,
                { x: drawX, y: drawY, width: drawWidth, height: drawHeight },
                { width: media.sourceWidth, height: media.sourceHeight },
                visibleContent,
                feedbackSource
              );
          }
        ),
    });
  if (!layer.effectActionsOnly && layer.spotlights?.length)
    drawIsolatedVideoWindow(context, layer, media, frame, displayScale, paintWindow);
  else paintWindow(context);
  if (!layer.effectActionsOnly || layer.deferSourceBorders)
    drawVideoWindowBorders(context, layer, media, frame, displayScale);
  if (deferActions)
    drawFittedMediaLayer({
      ...media,
      ...(layer.sourceContentTransform
        ? { sourceContentTransform: layer.sourceContentTransform }
        : {}),
      context,
      frame,
      hideWindowHeader: true,
      shadowIntensity: 0,
      render: (drawX, drawY, drawWidth, drawHeight, drawContext = context, visibleContent) =>
        drawContent(
          drawContext,
          frame,
          visibleContent ?? { x: drawX, y: drawY, width: drawWidth, height: drawHeight },
          () =>
            drawVideoSourceActions(
              drawContext,
              layer,
              frame,
              { x: drawX, y: drawY, width: drawWidth, height: drawHeight },
              { width: media.sourceWidth, height: media.sourceHeight },
              visibleContent,
              feedbackSource
            )
        ),
    });
}

type VideoLayer = Extract<VideoCompositionVisualLayer, { kind: 'video' }>;

function isReadyVideoSource(
  source: VideoCompositionMediaSource | undefined
): source is HTMLVideoElement | VideoCompositionFrameSource {
  if (source instanceof HTMLVideoElement)
    return source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  return isVideoCompositionFrameSource(source);
}

function resolveVideoWindowMedia(
  layer: VideoLayer,
  source: HTMLVideoElement | VideoCompositionFrameSource,
  displayScale: number,
  loadedImages: Record<string, HTMLImageElement>
) {
  const header = admittedVisualWindowHeader(layer.clip, loadedImages, layer.trackRole === 'CAMERA');
  const radians = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(radians),
    sin = Math.sin(radians);
  const sx = layer.renderState?.scaleX ?? 1,
    sy = layer.renderState?.scaleY ?? 1;
  // Compensate only the camera transform. The receiver retains its viewport raster scale.
  const localDirection = layer.cameraShadowVector
    ? cameraShadowLocalOffset(layer.cameraShadowVector, 1, {
        a: sx * cos,
        b: sy * sin,
        c: -sx * sin,
        d: sy * cos,
      })
    : undefined;
  return {
    ...header,
    displayScale,
    fitMode: layer.clip.fitMode,
    ...(layer.clip.sourceCrop ? { sourceCrop: layer.clip.sourceCrop } : {}),
    ...(layer.trackRole !== 'CAMERA' && layer.clip.windowCornerRadius !== undefined
      ? { windowCornerRadius: layer.clip.windowCornerRadius }
      : {}),
    camera: layer.trackRole === 'CAMERA',
    ...(localDirection ? { cameraShadowLocalVector: localDirection } : {}),
    ...(layer.trackRole === 'CAMERA' && layer.clip.cameraAppearance
      ? { cameraAppearance: layer.clip.cameraAppearance }
      : {}),
    shadowIntensity:
      layer.effectActionsOnly || localDirection === null ? 0 : layer.clip.shadowIntensity,
    shadowMode: layer.clip.shadowMode,
    ...(layer.clip.shadowColor === undefined ? {} : { shadowColor: layer.clip.shadowColor }),
    sourceHeight: source instanceof HTMLVideoElement ? source.videoHeight : source.sourceHeight,
    sourceWidth: source instanceof HTMLVideoElement ? source.videoWidth : source.sourceWidth,
  };
}

function drawVideoWindowBorders(
  context: CanvasRenderingContext2D,
  layer: Extract<VideoCompositionVisualLayer, { kind: 'video' }>,
  media: Omit<Parameters<typeof drawFittedMediaLayer>[0], 'context' | 'frame' | 'render'>,
  frame: VideoFrame,
  displayScale: number
) {
  if (!layer.borders?.length) return;
  const window =
    layer.trackRole === 'CAMERA'
      ? cameraWindowFrame(frame, media.cameraAppearance?.shape ?? 'rounded')
      : getFittedMediaWindowFrame({ ...media, frame });
  context.save();
  try {
    if (media.cameraAppearance) {
      traceCameraShape(context, window, media.cameraAppearance);
      context.clip();
    }
    const radius =
      layer.trackRole === 'CAMERA'
        ? 0
        : roundedWindowRadius(
            window.width,
            window.height,
            (layer.clip.windowCornerRadius ?? 0) * displayScale
          );
    if (layer.borders.some((state) => state.coordinateSpace === 'source-window'))
      drawCompositionBorders(
        context,
        layer.borders,
        window,
        displayScale,
        radius,
        getFittedMediaOriginalWindowFrame({ ...media, frame }),
        layer.sourceContentTransform
      );
    else drawCompositionBorders(context, layer.borders, window, displayScale, radius);
  } finally {
    context.restore();
  }
}

function drawVideoSourceActions(
  drawContext: CanvasRenderingContext2D,
  layer: Extract<VideoCompositionVisualLayer, { kind: 'video' }>,
  frame: VideoFrame,
  sourceFrame: VideoFrame,
  sourceSize: { width: number; height: number },
  visibleContent?: VideoFrame,
  feedbackSource?: PointerFeedbackSource
) {
  const { x: drawX, y: drawY, width: drawWidth, height: drawHeight } = sourceFrame;
  drawContext.save();
  drawContext.beginPath();
  const visible = visibleContent ?? sourceFrame;
  const contentBounds = {
    x: Math.max(frame.x, visible.x),
    y: Math.max(frame.y, visible.y),
    width: Math.max(
      0,
      Math.min(frame.x + frame.width, visible.x + visible.width) - Math.max(frame.x, visible.x)
    ),
    height: Math.max(
      0,
      Math.min(frame.y + frame.height, visible.y + visible.height) - Math.max(frame.y, visible.y)
    ),
  };
  drawContext.rect(contentBounds.x, contentBounds.y, contentBounds.width, contentBounds.height);
  drawContext.clip();
  const { width: sourceWidth, height: sourceHeight } = sourceSize;
  const actionScale = (drawWidth / sourceWidth + drawHeight / sourceHeight) / 2;
  const mirrored = layer.trackRole === 'CAMERA' && layer.clip.cameraMirrored === true;
  const sourceX = (x: number) => {
    const projected = drawX + x * drawWidth;
    return mirrored ? 2 * frame.x + frame.width - projected : projected;
  };
  for (const action of layer.actions ?? []) {
    const point = action.point
      ? { x: sourceX(action.point.x), y: drawY + action.point.y * drawHeight }
      : action.renderKind === 'keystroke'
        ? {
            x: contentBounds.x + 12 * Math.max(0.2, actionScale),
            y: contentBounds.y + 24 * Math.max(0.2, actionScale),
          }
        : null;
    drawActionCompositionState(
      drawContext,
      {
        ...action,
        point,
        ...(action.gestureFeedback
          ? {
              gestureFeedback: projectVideoGestureFeedback(
                action.gestureFeedback,
                sourceFrame,
                sourceX,
                mirrored
              ),
            }
          : {}),
      },
      null,
      actionScale,
      contentBounds,
      feedbackSource
    );
  }
  drawContext.restore();
}

function projectVideoGestureFeedback(
  feedback: NonNullable<VideoCompositionActionState['gestureFeedback']>,
  sourceFrame: VideoFrame,
  sourceX: (x: number) => number,
  mirrored: boolean
) {
  const { y: drawY, width: drawWidth, height: drawHeight } = sourceFrame;
  return {
    ...feedback,
    ...(feedback.path
      ? {
          path: feedback.path.map((item) => ({
            x: sourceX(item.x),
            y: drawY + item.y * drawHeight,
          })),
        }
      : {}),
    ...(feedback.area
      ? {
          area: {
            x: sourceX(feedback.area.x + (mirrored ? feedback.area.width : 0)),
            y: drawY + feedback.area.y * drawHeight,
            width: feedback.area.width * drawWidth,
            height: feedback.area.height * drawHeight,
          },
        }
      : {}),
  };
}

/** Destination-sized surfaces bound allocation even when source coordinates extend far outside it. */
function videoSpotlightSurface(
  ownerDocument: Document,
  size: { width: number; height: number }
): RenderCanvasLease {
  const canvas = ownerDocument.createElement('canvas');
  try {
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Spotlight compositor is unavailable.');
    return {
      canvas,
      context,
      release() {
        canvas.width = canvas.height = 0;
      },
    };
  } catch (error) {
    canvas.width = canvas.height = 0;
    throw error;
  }
}

function drawIsolatedVideoWindow(
  context: CanvasRenderingContext2D,
  layer: Extract<VideoCompositionVisualLayer, { kind: 'video' }>,
  media: Omit<Parameters<typeof drawFittedMediaLayer>[0], 'context' | 'frame' | 'render'>,
  frame: VideoFrame,
  displayScale: number,
  paintWindow: (target: CanvasRenderingContext2D) => void
) {
  const ownerDocument = context.canvas.ownerDocument ?? document;
  const isolated = videoSpotlightSurface(ownerDocument, context.canvas);
  try {
    const target = isolated.context;
    const transform = context.getTransform();
    target.setTransform(transform);
    paintWindow(target);
    const window =
      layer.trackRole === 'CAMERA'
        ? cameraWindowFrame(frame, media.cameraAppearance?.shape ?? 'rounded')
        : getFittedMediaWindowFrame({ ...media, frame });
    const radius =
      layer.trackRole === 'CAMERA'
        ? 0
        : roundedWindowRadius(
            window.width,
            window.height,
            (layer.clip.windowCornerRadius ?? 0) * displayScale
          );
    const projection: QuickEditHomography = [
      transform.a,
      transform.c,
      transform.e,
      transform.b,
      transform.d,
      transform.f,
      0,
      0,
      1,
    ];
    const density =
      (Math.hypot(transform.a, transform.b) + Math.hypot(transform.c, transform.d)) / 2;
    const layers = layer.spotlights!.map((state) =>
      sampleCompositionSpotlightLayer({
        state,
        window:
          state.coordinateSpace === 'source-window'
            ? getFittedMediaOriginalWindowFrame({ ...media, frame })
            : window,
        extent: window,
        scale: displayScale * density,
        projection,
        clip: { rect: window, radius },
      })
    );
    target.save();
    try {
      if (media.cameraAppearance) traceCameraShape(target, window, media.cameraAppearance);
      else {
        target.beginPath();
        target.roundRect(window.x, window.y, window.width, window.height, radius);
      }
      target.clip();
      target.setTransform(1, 0, 0, 1, 0, 0);
      drawSceneSpotlights(target, isolated.canvas, null, layers);
    } finally {
      target.restore();
    }
    context.save();
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(isolated.canvas, 0, 0);
    } finally {
      context.restore();
    }
  } finally {
    isolated.release();
  }
}

import { cameraShadowLocalOffset } from '../../project/camera/shadow-direction';
import { drawCompositionBorders } from './border';
import { roundedWindowRadius } from '../../project/window-geometry';
import { cameraWindowFrame } from '../../project/camera/appearance';
import { traceCameraShape } from './media-shadow';
import type { PointerFeedbackSource } from './pointer-feedback';
import { admittedVisualWindowHeader } from './window-header';
import { drawActionCompositionState, sourceClickSamplingDemandId } from './effects/actions';
import type { VideoCompositionActionState, VideoCompositionVisualLayer } from '../types';
import {
  drawFittedMediaLayer,
  drawCameraMediaSource,
  getFittedMediaWindowFrame,
  getFittedMediaContentFrame,
  resolveFittedWindowRaster,
  getFittedMediaOriginalWindowFrame,
} from './fitted-media';
import {
  isVideoCompositionFrameSource,
  type VideoCompositionMediaSource,
  type VideoCompositionFrameSource,
} from './media-source';
import { drawSceneSpotlights } from './spotlight';
import { sampleCompositionSpotlightLayer } from './project-spotlight';
import type { RenderCanvasLease, RenderResources } from '../canvas/render-resources';
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
  let samplingDemand = 'body';
  const drawSampledWindow = (params: Parameters<typeof drawFittedMediaLayer>[0]) =>
    paintPreparedVideoWindow(
      params,
      isVideoCompositionFrameSource(source) &&
        !!source.preparedSampling &&
        samplingDemand !== 'original'
    );
  const withDemand = (id: string, paint: () => void) => {
    const previous = samplingDemand;
    samplingDemand =
      previous.startsWith('sceneLens:') && id.startsWith('clickLens:') ? `${previous}/${id}` : id;
    try {
      paint();
    } finally {
      samplingDemand = previous;
    }
  };
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
        const sampling =
          samplingDemand !== 'original' && isVideoCompositionFrameSource(source)
            ? source.preparedSampling
            : undefined;
        const prepared = sampling?.visitPreparedTiles(samplingDemand, (tile) => {
          const roi = tile.originalPixelROI,
            physical = tile.physicalSourceRect;
          target.drawImage(
            tile.image,
            physical.x,
            physical.y,
            physical.width,
            physical.height,
            x + (roi.x / sampling.sourceSize.width) * width,
            y + (roi.y / sampling.sourceSize.height) * height,
            (roi.width / sampling.sourceSize.width) * width,
            (roi.height / sampling.sourceSize.height) * height
          );
        });
        if (prepared) return;
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
  const drawFeedback = (
    target: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    demand: string
  ) =>
    withDemand(demand, () => {
      const destination = { x, y, width, height };
      drawSampledWindow({
        ...media,
        context: target,
        frame: destination,
        displayScale: (displayScale * width) / Math.max(0.001, frame.width),
        // The action context already includes the source-content camera.
        render: (drawX, drawY, drawWidth, drawHeight, drawContext = target) =>
          paintSource(drawContext, destination, drawX, drawY, drawWidth, drawHeight),
      });
    });
  const feedbackSource: PointerFeedbackSource & { forDemand?(id: string): PointerFeedbackSource } =
    {
      rect: frame,
      draw: (target, x, y, width, height) => drawFeedback(target, x, y, width, height, 'original'),
    };
  if (isVideoCompositionFrameSource(source) && source.preparedSampling) {
    feedbackSource.forDemand = (id) => ({
      ...feedbackSource,
      sharpPaint: (target) => {
        // The pointer owner supplies the lens clip; its normal sharp mapping is selected below.
        const action = (layer.actions ?? []).find(
          (item) => sourceClickSamplingDemandId(item) === id
        );
        const lens = action?.gestureFeedback?.lens;
        const point = action?.point;
        if (!lens || !point) throw new Error('Prepared click sampling demand is unavailable.');
        const transform = target.getTransform?.();
        const density = transform
          ? Math.max(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d))
          : 1;
        const fitted = media.windowHeaderImage
          ? resolveFittedWindowRaster(
              { ...media, frame },
              density * lens.scale,
              media.windowHeaderImage.naturalHeight
            ).source
          : getFittedMediaContentFrame({ ...media, frame });
        const rawX = fitted.x + point.x * fitted.width;
        const center = {
          x:
            layer.trackRole === 'CAMERA' && layer.clip.cameraMirrored
              ? 2 * frame.x + frame.width - rawX
              : rawX,
          y: fitted.y + point.y * fitted.height,
        };
        drawFeedback(
          target,
          center.x + (frame.x - center.x) * lens.scale,
          center.y + (frame.y - center.y) * lens.scale,
          frame.width * lens.scale,
          frame.height * lens.scale,
          id
        );
      },
    });
  }
  const deferActions =
    (!layer.effectActionsOnly || layer.deferSourceBorders) &&
    (!!layer.borders?.length || !!layer.spotlights?.length) &&
    !!layer.actions?.length;
  const paintWindow = (target: CanvasRenderingContext2D) =>
    drawSampledWindow({
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
    drawIsolatedVideoWindow(
      context,
      layer,
      media,
      frame,
      displayScale,
      paintWindow,
      isVideoCompositionFrameSource(source) && source.preparedSampling
        ? (id, paint) => withDemand(id, paint)
        : undefined,
      isVideoCompositionFrameSource(source) ? source.renderResources : undefined
    );
  else paintWindow(context);
  if (!layer.effectActionsOnly || layer.deferSourceBorders)
    drawVideoWindowBorders(context, layer, media, frame, displayScale);
  if (deferActions)
    drawSampledWindow({
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
  size: { width: number; height: number },
  resources?: RenderResources
): RenderCanvasLease {
  if (resources) return resources.canvas('video.source-spotlight', size);
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
  paintWindow: (target: CanvasRenderingContext2D) => void,
  sampleDemand?: (id: string, paint: () => void) => void,
  sourceFrameResources?: RenderResources
) {
  const ownerDocument = context.canvas.ownerDocument ?? document;
  const original = sourceFrameResources;
  const isolated = videoSpotlightSurface(ownerDocument, context.canvas, original);
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
    const layers = layer.spotlights!.map((state) => {
      const sampled = sampleCompositionSpotlightLayer({
        state,
        window:
          state.coordinateSpace === 'source-window'
            ? getFittedMediaOriginalWindowFrame({ ...media, frame })
            : window,
        extent: window,
        scale: displayScale * density,
        projection,
        clip: { rect: window, radius },
      });
      if (sampleDemand && sampled.lens && sampled.lens.scale > 1) {
        const center = {
          x: sampled.opening.x + sampled.opening.width / 2,
          y: sampled.opening.y + sampled.opening.height / 2,
        };
        const projected = {
          x: transform.a * center.x + transform.c * center.y + transform.e,
          y: transform.b * center.x + transform.d * center.y + transform.f,
        };
        const lensScale = sampled.lens.scale;
        return {
          ...sampled,
          sharpPaint: (sharp: CanvasRenderingContext2D) => {
            sharp.save();
            try {
              sharp.translate(projected.x, projected.y);
              sharp.scale(lensScale, lensScale);
              sharp.translate(-projected.x, -projected.y);
              sharp.transform(
                transform.a,
                transform.b,
                transform.c,
                transform.d,
                transform.e,
                transform.f
              );
              sampleDemand(`sceneLens:${state.id}`, () => paintWindow(sharp));
            } finally {
              sharp.restore();
            }
          },
        };
      }
      return sampled;
    });
    target.save();
    try {
      if (media.cameraAppearance) traceCameraShape(target, window, media.cameraAppearance);
      else {
        target.beginPath();
        target.roundRect(window.x, window.y, window.width, window.height, radius);
      }
      target.clip();
      target.setTransform(1, 0, 0, 1, 0, 0);
      drawSceneSpotlights(target, isolated.canvas, null, layers, original);
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

/** Prepared video bypasses the bounded decoration raster; the existing helper still paints its header/shadow. */
function paintPreparedVideoWindow(
  params: Parameters<typeof drawFittedMediaLayer>[0],
  prepared: boolean
): void {
  if (!prepared || !params.windowHeaderImage) {
    drawFittedMediaLayer(params);
    return;
  }
  const context = params.context,
    header = params.windowHeaderImage;
  const transform = context.getTransform();
  const density = Math.max(
    Math.hypot(transform.a, transform.b),
    Math.hypot(transform.c, transform.d)
  );
  const raster = resolveFittedWindowRaster(params, density, header.naturalHeight);
  drawFittedMediaLayer({ ...params, render() {} });
  const window = getFittedMediaWindowFrame(params);
  const radius = roundedWindowRadius(
    window.width,
    window.height,
    (params.windowCornerRadius ?? 0) * params.displayScale
  );
  context.save();
  try {
    context.beginPath();
    context.roundRect(window.x, window.y, window.width, window.height, radius);
    context.clip();
    const inner = params.sourceContentTransform;
    if (inner)
      context.transform(
        inner[0],
        inner[3],
        inner[1],
        inner[4],
        inner[2] * params.displayScale,
        inner[5] * params.displayScale
      );
    context.beginPath();
    context.rect(raster.visible.x, raster.visible.y, raster.visible.width, raster.visible.height);
    context.clip();
    params.render(
      raster.source.x,
      raster.source.y,
      raster.source.width,
      raster.source.height,
      context,
      raster.visible
    );
  } finally {
    context.restore();
  }
}

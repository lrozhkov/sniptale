import { roundedWindowClearance, roundedWindowRadius } from '../../project/window-geometry';
import { uncropMediaSourceRect, type MediaSourceCrop } from '../../project/media-crop';
import { windowHeaderGeometry, type WindowHeader } from '@sniptale/runtime-contracts/window-header';
import { acquireVideoCompositionBuffer } from '../canvas/buffer-pool';
import {
  cameraContentFrame,
  cameraWindowFrame,
  type CameraAppearance,
} from '../../project/camera/appearance';
import { VideoMediaFitMode, type VideoMediaShadowMode } from '../../project/types/index';
import { drawMediaFrameShadow, traceCameraShape } from './media-shadow';

interface MediaFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface SourcePoint {
  x: number;
  y: number;
}

type MediaFrameRenderer = (
  drawX: number,
  drawY: number,
  drawWidth: number,
  drawHeight: number,
  context?: CanvasRenderingContext2D,
  visibleContent?: MediaFrame
) => void;

function shouldDrawFittedMediaDirectly(params: {
  fitMode: VideoMediaFitMode;
  height: number;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
}) {
  return (
    params.sourceWidth <= 0 ||
    params.sourceHeight <= 0 ||
    params.width <= 0 ||
    params.height <= 0 ||
    params.fitMode === VideoMediaFitMode.STRETCH ||
    params.fitMode === VideoMediaFitMode.SOURCE_100 ||
    params.fitMode === VideoMediaFitMode.FIT_LONG_SIDE ||
    params.fitMode === VideoMediaFitMode.FIT_SHORT_SIDE
  );
}

function getFittedMediaFrame(params: {
  fitMode: VideoMediaFitMode;
  height: number;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
  x: number;
  y: number;
}) {
  const scale =
    params.fitMode === VideoMediaFitMode.COVER
      ? Math.max(params.width / params.sourceWidth, params.height / params.sourceHeight)
      : Math.min(params.width / params.sourceWidth, params.height / params.sourceHeight);
  const width = params.sourceWidth * scale;
  const height = params.sourceHeight * scale;
  return {
    height,
    width,
    x: params.x + (params.width - width) / 2,
    y: params.y + (params.height - height) / 2,
  };
}

/** Resolve source pixel bounds before clip rotation and transition scaling. */
export function getFittedMediaContentFrame(params: {
  sourceCrop?: MediaSourceCrop;
  cameraAppearance?: CameraAppearance;
  windowHeader?: WindowHeader;
  fitMode: VideoMediaFitMode;
  frame: MediaFrame;
  sourceHeight: number;
  sourceWidth: number;
}): MediaFrame {
  if (params.sourceCrop) {
    const { sourceCrop, ...rest } = params;
    return uncropMediaSourceRect(
      getFittedMediaContentFrame({
        ...rest,
        sourceWidth: params.sourceWidth * sourceCrop.width,
        sourceHeight: params.sourceHeight * sourceCrop.height,
      }),
      sourceCrop
    );
  }
  if (params.windowHeader) {
    const headerHeight = windowHeaderGeometry(params.windowHeader, {
      width: params.sourceWidth,
      height: params.sourceHeight,
    }).height;
    const plane = getFittedMediaContentFrame({
      fitMode: params.fitMode,
      frame: params.frame,
      sourceWidth: params.sourceWidth,
      sourceHeight: params.sourceHeight + headerHeight,
    });
    const inset = (plane.height * headerHeight) / (params.sourceHeight + headerHeight);
    return { ...plane, y: plane.y + inset, height: plane.height - inset };
  }
  if (params.cameraAppearance) {
    const frame = cameraWindowFrame(params.frame, params.cameraAppearance.shape);
    const content = cameraContentFrame(
      frame.width,
      frame.height,
      params.sourceWidth,
      params.sourceHeight,
      params.cameraAppearance,
      params.fitMode === VideoMediaFitMode.STRETCH
    );
    return {
      x: frame.x + content.x,
      y: frame.y + content.y,
      width: content.width,
      height: content.height,
    };
  }
  if (
    shouldDrawFittedMediaDirectly({
      fitMode: params.fitMode,
      height: params.frame.height,
      sourceHeight: params.sourceHeight,
      sourceWidth: params.sourceWidth,
      width: params.frame.width,
    })
  ) {
    return params.frame;
  }

  return getFittedMediaFrame({
    fitMode: params.fitMode,
    height: params.frame.height,
    sourceHeight: params.sourceHeight,
    sourceWidth: params.sourceWidth,
    width: params.frame.width,
    x: params.frame.x,
    y: params.frame.y,
  });
}

/** Visible decorated bounds; cropped source pixels and headers are fitted as one plane. */
export function getFittedMediaWindowFrame(params: {
  sourceCrop?: MediaSourceCrop;
  windowHeader?: WindowHeader;
  fitMode: VideoMediaFitMode;
  frame: MediaFrame;
  sourceWidth: number;
  sourceHeight: number;
}): MediaFrame {
  if (params.fitMode === VideoMediaFitMode.COVER) return params.frame;
  const width = params.sourceWidth * (params.sourceCrop?.width ?? 1);
  const height = params.sourceHeight * (params.sourceCrop?.height ?? 1);
  const header = params.windowHeader
    ? windowHeaderGeometry(params.windowHeader, { width, height }).height
    : 0;
  return getFittedMediaContentFrame({
    fitMode: params.fitMode,
    frame: params.frame,
    sourceWidth: width,
    sourceHeight: height + header,
  });
}

export function mapSourcePointToFittedMediaFrame(params: FittedMediaPointMapping): SourcePoint {
  const frame = getFittedMediaContentFrame(params);
  const sourceWidth = Math.max(1, params.sourceWidth);
  const sourceHeight = Math.max(1, params.sourceHeight);

  return {
    x: frame.x + (params.point.x / sourceWidth) * frame.width,
    y: frame.y + (params.point.y / sourceHeight) * frame.height,
  };
}

export function mapFittedMediaFramePointToSource(params: FittedMediaPointMapping): SourcePoint {
  const frame = getFittedMediaContentFrame(params);
  const sourceWidth = Math.max(1, params.sourceWidth);
  const sourceHeight = Math.max(1, params.sourceHeight);

  return {
    x: ((params.point.x - frame.x) / Math.max(1, frame.width)) * sourceWidth,
    y: ((params.point.y - frame.y) / Math.max(1, frame.height)) * sourceHeight,
  };
}

export function drawFittedMediaFrame(
  context: CanvasRenderingContext2D,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
  fitMode: VideoMediaFitMode,
  renderer: MediaFrameRenderer
): void {
  if (shouldDrawFittedMediaDirectly({ fitMode, height, sourceHeight, sourceWidth, width })) {
    renderer(x, y, width, height);
    return;
  }

  const frame = getFittedMediaFrame({ fitMode, height, sourceHeight, sourceWidth, width, x, y });

  if (fitMode === VideoMediaFitMode.COVER) {
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    renderer(frame.x, frame.y, frame.width, frame.height);
    context.restore();
    return;
  }

  renderer(frame.x, frame.y, frame.width, frame.height);
}

export function drawFittedMediaLayer(params: {
  windowCornerRadius?: number;
  sourceCrop?: MediaSourceCrop;
  cameraAppearance?: CameraAppearance;
  windowHeaderImage?: HTMLImageElement;
  windowHeader?: WindowHeader;
  hideWindowHeader?: boolean;
  camera?: boolean;
  context: CanvasRenderingContext2D;
  displayScale: number;
  fitMode: VideoMediaFitMode;
  frame: MediaFrame;
  render: MediaFrameRenderer;
  shadowColor?: string;
  shadowIntensity: number | undefined;
  shadowMode: VideoMediaShadowMode | undefined;
  sourceHeight: number;
  sourceWidth: number;
}): void {
  if (params.sourceCrop) {
    const { sourceCrop, ...rest } = params;
    drawFittedMediaLayer({
      ...rest,
      sourceWidth: params.sourceWidth * sourceCrop.width,
      sourceHeight: params.sourceHeight * sourceCrop.height,
      render: (x, y, width, height, context = params.context) => {
        const visible = { x, y, width, height };
        const source = uncropMediaSourceRect(visible, sourceCrop);
        context.save();
        try {
          context.beginPath();
          context.rect(x, y, width, height);
          context.clip();
          params.render(source.x, source.y, source.width, source.height, context, visible);
        } finally {
          context.restore();
        }
      },
    });
    return;
  }
  if (params.cameraAppearance?.shape === 'circle')
    params = { ...params, frame: cameraWindowFrame(params.frame, 'circle') };
  const drawFitted = (render: MediaFrameRenderer) => {
    drawFittedMediaFrame(
      params.context,
      params.sourceWidth,
      params.sourceHeight,
      params.frame.x,
      params.frame.y,
      params.frame.width,
      params.frame.height,
      params.fitMode,
      render
    );
  };

  const roundedFrame = getFittedMediaWindowFrame(params);
  const radius = params.camera
    ? 0
    : roundedWindowRadius(
        roundedFrame.width,
        roundedFrame.height,
        (params.windowCornerRadius ?? 0) * params.displayScale
      );
  drawMediaFrameShadow(
    params.context,
    params.shadowIntensity,
    params.shadowMode,
    radius > 0
      ? roundedFrame
      : params.windowHeader &&
          params.windowHeaderImage &&
          params.fitMode !== VideoMediaFitMode.COVER
        ? getFittedMediaContentFrame({
            fitMode: params.fitMode,
            frame: params.frame,
            sourceWidth: params.sourceWidth,
            sourceHeight:
              params.sourceHeight +
              windowHeaderGeometry(params.windowHeader, {
                width: params.sourceWidth,
                height: params.sourceHeight,
              }).height,
          })
        : params.frame,
    params.displayScale,
    params.cameraAppearance,
    params.camera,
    params.shadowColor,
    radius
  );
  if (radius > 0) {
    params.context.save();
    params.context.beginPath();
    params.context.roundRect(
      roundedFrame.x,
      roundedFrame.y,
      roundedFrame.width,
      roundedFrame.height,
      radius
    );
    params.context.clip();
  }
  try {
    if (params.windowHeaderImage) {
      drawWindowMediaPlane(params);
    } else if (params.cameraAppearance) {
      const content = getFittedMediaContentFrame(params);
      params.context.save();
      traceCameraShape(params.context, params.frame, params.cameraAppearance);
      params.context.clip();
      params.render(content.x, content.y, content.width, content.height);
      params.context.restore();
    } else drawFitted(params.render);
  } finally {
    if (radius > 0) params.context.restore();
  }
}

/** Rasterize adjoining edges before the clip transform, so subpixel scaling cannot open a seam. */
function drawWindowMediaPlane(params: Parameters<typeof drawFittedMediaLayer>[0]): void {
  const header = params.windowHeaderImage;
  if (!header) return;
  const rasterScale = Math.min(1, 4096 / Math.max(params.frame.width, params.frame.height));
  const width = Math.max(1, Math.ceil(params.frame.width * rasterScale));
  const height = Math.max(1, Math.ceil(params.frame.height * rasterScale));
  const lease = acquireVideoCompositionBuffer(width, height, params.context.canvas.ownerDocument);
  const context = lease?.canvas.getContext('2d');
  if (!lease || !context || !('setTransform' in context)) {
    lease?.release();
    throw new Error('Window header composition surface is unavailable.');
  }
  const plane = context as CanvasRenderingContext2D;
  try {
    plane.reset?.();
    plane.setTransform(1, 0, 0, 1, 0, 0);
    plane.clearRect(0, 0, width, height);
    const sourceHeaderHeight = params.windowHeader
      ? windowHeaderGeometry(params.windowHeader, {
          width: params.sourceWidth,
          height: params.sourceHeight,
        }).height
      : header.naturalHeight;
    drawFittedMediaFrame(
      plane,
      params.sourceWidth,
      params.sourceHeight + sourceHeaderHeight,
      0,
      0,
      width,
      height,
      params.fitMode,
      (x, y, w, h) => {
        const join = Math.round(
          y + (h * sourceHeaderHeight) / (params.sourceHeight + sourceHeaderHeight)
        );
        if (!params.hideWindowHeader) plane.drawImage(header, x, y, w, join - y);
        plane.save();
        plane.beginPath();
        plane.rect(x, join, w, y + h - join);
        plane.clip();
        // Keep callback coordinates in the composition frame for source-anchored actions.
        plane.translate(-params.frame.x, -params.frame.y);
        params.render(params.frame.x + x, params.frame.y + join, w, y + h - join, plane);
        plane.restore();
      }
    );
    params.context.drawImage(
      lease.canvas,
      params.frame.x,
      params.frame.y,
      params.frame.width,
      params.frame.height
    );
  } finally {
    lease.release();
  }
}

/** Source coordinates and the exact media-layer transform, before viewport/camera mapping. */
export interface VisualLayerSourcePointMapping {
  windowCornerRadius?: number;
  sourceCrop?: MediaSourceCrop;
  cameraAppearance?: CameraAppearance;
  mirrored?: boolean;
  windowHeader?: WindowHeader;
  point: { x: number; y: number };
  frame: MediaFrame & { rotation: number };
  fitMode: VideoMediaFitMode;
  sourceWidth: number;
  sourceHeight: number;
  renderState: { translateX: number; translateY: number; scaleX: number; scaleY: number };
}

function isValidPointMapping(params: VisualLayerSourcePointMapping): boolean {
  return (
    [
      ...Object.values(params.point),
      params.frame.x,
      params.frame.y,
      params.frame.width,
      params.frame.height,
      params.frame.rotation,
      ...Object.values(params.renderState),
      params.sourceWidth,
      params.sourceHeight,
    ].every(Number.isFinite) &&
    params.frame.width > 0 &&
    params.frame.height > 0 &&
    params.sourceWidth > 0 &&
    params.sourceHeight > 0 &&
    params.renderState.scaleX !== 0 &&
    params.renderState.scaleY !== 0
  );
}

function isInsideFrame(point: SourcePoint, frame: MediaFrame): boolean {
  const epsilon = 1e-9;
  return (
    point.x >= frame.x - epsilon &&
    point.x <= frame.x + frame.width + epsilon &&
    point.y >= frame.y - epsilon &&
    point.y <= frame.y + frame.height + epsilon
  );
}

function isInsideVisualFrame(point: SourcePoint, params: VisualLayerSourcePointMapping): boolean {
  const frame = cameraWindowFrame(params.frame, params.cameraAppearance?.shape ?? 'rounded');
  if (!isInsideFrame(point, frame)) return false;
  if (!params.cameraAppearance && (params.windowCornerRadius ?? 0) > 0) {
    const window = getFittedMediaWindowFrame(params);
    return (
      roundedWindowClearance(
        [point.x - window.x, point.x - window.x],
        [point.y - window.y, point.y - window.y],
        window.width,
        window.height,
        params.windowCornerRadius ?? 0
      ).low >= -1e-9
    );
  }
  if (params.cameraAppearance?.shape !== 'circle') return true;
  const x = (point.x - frame.x - frame.width / 2) / (frame.width / 2);
  const y = (point.y - frame.y - frame.height / 2) / (frame.height / 2);
  return x * x + y * y <= 1 + 1e-9;
}

/** Map a visible source point through fit, rotation and the transition's affine transform. */
export function mapSourceNormalizedPointToVisualLayer(
  params: VisualLayerSourcePointMapping
): SourcePoint | null {
  if (
    !isValidPointMapping(params) ||
    !isInsideFrame(params.point, params.sourceCrop ?? { x: 0, y: 0, width: 1, height: 1 })
  )
    return null;
  const content = getFittedMediaContentFrame(params);
  const sourceX = content.x + params.point.x * content.width;
  const point = {
    x: params.mirrored ? 2 * params.frame.x + params.frame.width - sourceX : sourceX,
    y: content.y + params.point.y * content.height,
  };
  if (!isInsideVisualFrame(point, params)) return null;
  const { center, angle } = visualLayerRotation(params.frame);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x:
      center.x +
      params.renderState.translateX +
      params.renderState.scaleX * (x * Math.cos(angle) - y * Math.sin(angle)),
    y:
      center.y +
      params.renderState.translateY +
      params.renderState.scaleY * (x * Math.sin(angle) + y * Math.cos(angle)),
  };
}

/** Inverse mapping rejects cropped content and letterboxing instead of moving a different point. */
export function mapVisualLayerPointToSourceNormalized(
  params: VisualLayerSourcePointMapping
): SourcePoint | null {
  if (!isValidPointMapping(params)) return null;
  const { center, angle } = visualLayerRotation(params.frame);
  const x = (params.point.x - center.x - params.renderState.translateX) / params.renderState.scaleX;
  const y = (params.point.y - center.y - params.renderState.translateY) / params.renderState.scaleY;
  const unrotatedX = center.x + x * Math.cos(angle) + y * Math.sin(angle);
  const point = {
    x: params.mirrored ? 2 * params.frame.x + params.frame.width - unrotatedX : unrotatedX,
    y: center.y - x * Math.sin(angle) + y * Math.cos(angle),
  };
  const content = getFittedMediaContentFrame(params);
  if (!isInsideVisualFrame(point, params) || !isInsideFrame(point, content)) return null;
  const native = {
    x: (point.x - content.x) / content.width,
    y: (point.y - content.y) / content.height,
  };
  const crop = params.sourceCrop ?? { x: 0, y: 0, width: 1, height: 1 };
  if (!isInsideFrame(native, crop)) return null;
  return {
    x: Math.min(crop.x + crop.width, Math.max(crop.x, native.x)),
    y: Math.min(crop.y + crop.height, Math.max(crop.y, native.y)),
  };
}

function visualLayerRotation(frame: MediaFrame & { rotation: number }) {
  return {
    center: { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 },
    angle: (frame.rotation * Math.PI) / 180,
  };
}

interface FittedMediaPointMapping {
  sourceCrop?: MediaSourceCrop;
  fitMode: VideoMediaFitMode;
  frame: MediaFrame;
  point: SourcePoint;
  sourceHeight: number;
  sourceWidth: number;
}

/** Reflect only camera pixels after their crop; callers retain overlays and decoration. */
export function drawCameraMediaSource(
  context: CanvasRenderingContext2D,
  frame: MediaFrame,
  mirrored: boolean,
  render: () => void
): void {
  if (!mirrored) {
    render();
    return;
  }
  context.save();
  try {
    context.translate(2 * frame.x + frame.width, 0);
    context.scale(-1, 1);
    render();
  } finally {
    context.restore();
  }
}

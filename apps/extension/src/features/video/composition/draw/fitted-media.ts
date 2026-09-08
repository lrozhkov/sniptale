import { cameraContentFrame, type CameraAppearance } from '../../project/camera/appearance';
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
  drawHeight: number
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

export function getFittedMediaContentFrame(params: {
  fitMode: VideoMediaFitMode;
  frame: MediaFrame;
  sourceHeight: number;
  sourceWidth: number;
}): MediaFrame {
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

export function mapSourcePointToFittedMediaFrame(params: {
  fitMode: VideoMediaFitMode;
  frame: MediaFrame;
  point: SourcePoint;
  sourceHeight: number;
  sourceWidth: number;
}): SourcePoint {
  const frame = getFittedMediaContentFrame(params);
  const sourceWidth = Math.max(1, params.sourceWidth);
  const sourceHeight = Math.max(1, params.sourceHeight);

  return {
    x: frame.x + (params.point.x / sourceWidth) * frame.width,
    y: frame.y + (params.point.y / sourceHeight) * frame.height,
  };
}

export function mapFittedMediaFramePointToSource(params: {
  fitMode: VideoMediaFitMode;
  frame: MediaFrame;
  point: SourcePoint;
  sourceHeight: number;
  sourceWidth: number;
}): SourcePoint {
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
  cameraAppearance?: CameraAppearance;
  camera?: boolean;
  context: CanvasRenderingContext2D;
  displayScale: number;
  fitMode: VideoMediaFitMode;
  frame: MediaFrame;
  render: MediaFrameRenderer;
  shadowIntensity: number | undefined;
  shadowMode: VideoMediaShadowMode | undefined;
  sourceHeight: number;
  sourceWidth: number;
}): void {
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

  drawMediaFrameShadow(
    params.context,
    params.shadowIntensity,
    params.shadowMode,
    params.frame,
    params.displayScale,
    params.cameraAppearance,
    params.camera
  );
  if (params.cameraAppearance) {
    const content = cameraContentFrame(
      params.frame.width,
      params.frame.height,
      params.sourceWidth,
      params.sourceHeight,
      params.cameraAppearance,
      params.fitMode === VideoMediaFitMode.STRETCH
    );
    params.context.save();
    traceCameraShape(params.context, params.frame, params.cameraAppearance);
    params.context.clip();
    params.render(
      params.frame.x + content.x,
      params.frame.y + content.y,
      content.width,
      content.height
    );
    params.context.restore();
  } else drawFitted(params.render);
}

/** Source coordinates and the exact media-layer transform, before viewport/camera mapping. */
export interface VisualLayerSourcePointMapping {
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

/** Map a visible source point through fit, rotation and the transition's affine transform. */
export function mapSourceNormalizedPointToVisualLayer(
  params: VisualLayerSourcePointMapping
): SourcePoint | null {
  if (
    !isValidPointMapping(params) ||
    !isInsideFrame(params.point, { x: 0, y: 0, width: 1, height: 1 })
  )
    return null;
  const content = getFittedMediaContentFrame(params);
  const point = {
    x: content.x + params.point.x * content.width,
    y: content.y + params.point.y * content.height,
  };
  if (!isInsideFrame(point, params.frame)) return null;
  const center = {
    x: params.frame.x + params.frame.width / 2,
    y: params.frame.y + params.frame.height / 2,
  };
  const angle = (params.frame.rotation * Math.PI) / 180;
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
  const center = {
    x: params.frame.x + params.frame.width / 2,
    y: params.frame.y + params.frame.height / 2,
  };
  const angle = (params.frame.rotation * Math.PI) / 180;
  const x = (params.point.x - center.x - params.renderState.translateX) / params.renderState.scaleX;
  const y = (params.point.y - center.y - params.renderState.translateY) / params.renderState.scaleY;
  const point = {
    x: center.x + x * Math.cos(angle) + y * Math.sin(angle),
    y: center.y - x * Math.sin(angle) + y * Math.cos(angle),
  };
  const content = getFittedMediaContentFrame(params);
  if (!isInsideFrame(point, params.frame) || !isInsideFrame(point, content)) return null;
  return {
    x: Math.min(1, Math.max(0, (point.x - content.x) / content.width)),
    y: Math.min(1, Math.max(0, (point.y - content.y) / content.height)),
  };
}

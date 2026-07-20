import { VideoMediaFitMode, type VideoMediaShadowMode } from '../../project/types/index';
import { drawMediaFrameShadow } from './media-shadow';

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
    params.displayScale
  );
  drawFitted(params.render);
}

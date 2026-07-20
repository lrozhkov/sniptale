import type {
  ScenarioElementFrame,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioRect,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioFramePadding } from '@sniptale/runtime-contracts/scenario/types/geometry';
import { TARGET_MIN_SIZE } from './constants';

const ZERO_PADDING: ScenarioFramePadding = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
};

export function mapViewportPointToImageFrame(
  point: ScenarioPoint | null,
  page: ScenarioPageDescriptor,
  imageFrame: ScenarioElementFrame
): ScenarioPoint | null {
  if (!point || page.viewport.width <= 0 || page.viewport.height <= 0) {
    return null;
  }

  return {
    x:
      imageFrame.x +
      getViewportRatio(point.x, page.viewport.x, page.viewport.width) * imageFrame.width,
    y:
      imageFrame.y +
      getViewportRatio(point.y, page.viewport.y, page.viewport.height) * imageFrame.height,
  };
}

export function mapViewportRectToImageFrame(
  rect: ScenarioRect | null,
  page: ScenarioPageDescriptor,
  imageFrame: ScenarioElementFrame,
  padding: ScenarioFramePadding | null = null
): ScenarioElementFrame | null {
  if (!rect || page.viewport.width <= 0 || page.viewport.height <= 0) {
    return null;
  }

  const viewportRect = clampRectToViewport(expandRect(rect, padding), page.viewport);
  if (!viewportRect) {
    return null;
  }

  return constrainFrameToImageFrame(mapRect(viewportRect, page, imageFrame), imageFrame);
}

export function createPointFrame(
  point: ScenarioPoint | null,
  size: number
): ScenarioElementFrame | null {
  return point ? { height: size, width: size, x: point.x - size / 2, y: point.y - size / 2 } : null;
}

export function getFrameCenter(frame: ScenarioElementFrame | null): ScenarioPoint | null {
  return frame ? { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 } : null;
}

function getViewportRatio(value: number, origin: number, size: number): number {
  return Math.min(1, Math.max(0, (value - origin) / size));
}

function expandRect(rect: ScenarioRect, padding: ScenarioFramePadding | null): ScenarioRect {
  const nextPadding = padding ?? ZERO_PADDING;

  return {
    height: rect.height + nextPadding.top + nextPadding.bottom,
    width: rect.width + nextPadding.left + nextPadding.right,
    x: rect.x - nextPadding.left,
    y: rect.y - nextPadding.top,
  };
}

function clampRectToViewport(rect: ScenarioRect, viewport: ScenarioRect): ScenarioRect | null {
  const x = Math.max(viewport.x, rect.x);
  const y = Math.max(viewport.y, rect.y);
  const right = Math.min(viewport.x + viewport.width, rect.x + rect.width);
  const bottom = Math.min(viewport.y + viewport.height, rect.y + rect.height);

  return right > x && bottom > y ? { height: bottom - y, width: right - x, x, y } : null;
}

function mapRect(
  rect: ScenarioRect,
  page: ScenarioPageDescriptor,
  imageFrame: ScenarioElementFrame
): ScenarioElementFrame {
  const xScale = imageFrame.width / page.viewport.width;
  const yScale = imageFrame.height / page.viewport.height;

  return {
    height: rect.height * yScale,
    width: rect.width * xScale,
    x: imageFrame.x + (rect.x - page.viewport.x) * xScale,
    y: imageFrame.y + (rect.y - page.viewport.y) * yScale,
  };
}

function constrainFrameToImageFrame(
  frame: ScenarioElementFrame,
  imageFrame: ScenarioElementFrame
): ScenarioElementFrame {
  const width = Math.max(TARGET_MIN_SIZE, frame.width);
  const height = Math.max(TARGET_MIN_SIZE, frame.height);
  const center = getFrameCenter(frame)!;

  return {
    height,
    width,
    x: Math.min(
      imageFrame.x + imageFrame.width - width,
      Math.max(imageFrame.x, center.x - width / 2)
    ),
    y: Math.min(
      imageFrame.y + imageFrame.height - height,
      Math.max(imageFrame.y, center.y - height / 2)
    ),
  };
}

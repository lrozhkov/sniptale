import type { FrameData } from '../../../features/highlighter/contracts';
import type { AutoBlurTextRect } from './types';

const DUPLICATE_OVERLAP_RATIO = 0.72;
const MIN_TEXT_RECT_SIZE = 2;

function getRectArea(rect: AutoBlurTextRect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function getIntersectionArea(a: AutoBlurTextRect, b: AutoBlurTextRect): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

export function normalizeAutoBlurRect(
  rect: Pick<DOMRect, 'height' | 'width' | 'x' | 'y'>
): AutoBlurTextRect | null {
  if (rect.width < MIN_TEXT_RECT_SIZE || rect.height < MIN_TEXT_RECT_SIZE) {
    return null;
  }

  const x = Math.floor(rect.x);
  const y = Math.floor(rect.y);

  return {
    x,
    y,
    width: Math.ceil(rect.x + rect.width) - x,
    height: Math.ceil(rect.y + rect.height) - y,
  };
}

export function getAutoBlurRectUnion(rects: AutoBlurTextRect[]): AutoBlurTextRect | null {
  if (rects.length === 0) {
    return null;
  }

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  rects.forEach((rect) => {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  });

  return normalizeAutoBlurRect({
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  });
}

export function isFrameOverlappingAutoBlurRect(frame: FrameData, rect: AutoBlurTextRect): boolean {
  if (frame.effectMode !== 'blur') {
    return false;
  }

  const frameRect = {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };
  const intersectionArea = getIntersectionArea(frameRect, rect);
  const smallerArea = Math.min(getRectArea(frameRect), getRectArea(rect));

  return smallerArea > 0 && intersectionArea / smallerArea >= DUPLICATE_OVERLAP_RATIO;
}

export function hasBlurFrameForRect(frames: FrameData[], rect: AutoBlurTextRect): boolean {
  return frames.some((frame) => isFrameOverlappingAutoBlurRect(frame, rect));
}

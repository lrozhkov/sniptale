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

  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
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

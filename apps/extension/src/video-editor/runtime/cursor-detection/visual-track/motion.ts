import type { VideoCursorDetectionCandidate, VideoCursorDetectionFrame } from './types';
import { addPixelToComponentBounds, type PixelComponentBounds } from './component-bounds';

type MotionComponent = PixelComponentBounds;

const DEFAULT_DIFF_THRESHOLD = 14;
const MAX_MOTION_CANDIDATES = 16;
const MAX_MOTION_COMPONENT_AREA = 520;
const MAX_MOTION_COMPONENT_SIZE = 52;
const MOTION_NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function detectCursorMotionCandidates(
  previousFrame: VideoCursorDetectionFrame,
  frame: VideoCursorDetectionFrame
): VideoCursorDetectionCandidate[] {
  if (previousFrame.width !== frame.width || previousFrame.height !== frame.height) {
    return [];
  }

  const activePixels = createActiveMotionMask(previousFrame, frame);
  const visited = new Uint8Array(frame.width * frame.height);
  const candidates: VideoCursorDetectionCandidate[] = [];

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const index = y * frame.width + x;
      if (!activePixels[index] || visited[index]) {
        continue;
      }

      const component = collectMotionComponent(activePixels, visited, frame, x, y);
      const candidate = component ? scoreMotionComponent(component, frame) : null;
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  const sortedCandidates = candidates.toSorted(
    (first, second) => second.motionScore - first.motionScore
  );
  return sortedCandidates.slice(0, MAX_MOTION_CANDIDATES);
}

function createActiveMotionMask(
  previousFrame: VideoCursorDetectionFrame,
  frame: VideoCursorDetectionFrame
): Uint8Array {
  const activePixels = new Uint8Array(frame.width * frame.height);
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const index = y * frame.width + x;
      const pixelIndex = index * 4;
      if (
        Math.abs(getLuma(previousFrame.data, pixelIndex) - getLuma(frame.data, pixelIndex)) >
        DEFAULT_DIFF_THRESHOLD
      ) {
        activePixels[index] = 1;
      }
    }
  }
  return activePixels;
}

function collectMotionComponent(
  activePixels: Uint8Array,
  visited: Uint8Array,
  frame: VideoCursorDetectionFrame,
  startX: number,
  startY: number
): MotionComponent | null {
  const startIndex = startY * frame.width + startX;
  const stack: number[] = [startIndex];
  const component = { area: 0, maxX: startX, maxY: startY, minX: startX, minY: startY };
  let rejected = false;
  visited[startIndex] = 1;

  while (stack.length > 0) {
    const index = stack.pop()!;
    if (!activePixels[index]) {
      continue;
    }

    const x = index % frame.width;
    const y = Math.floor(index / frame.width);
    if (!rejected) {
      addMotionPixel(component, x, y);
      rejected = isMotionComponentOverBudget(component);
    }
    pushMotionNeighbors(stack, activePixels, frame, visited, x, y);
  }

  return rejected ? null : component;
}

function addMotionPixel(component: MotionComponent, x: number, y: number): void {
  addPixelToComponentBounds(component, x, y);
}

function isMotionComponentOverBudget(component: MotionComponent): boolean {
  return (
    component.area > MAX_MOTION_COMPONENT_AREA ||
    component.maxX - component.minX + 1 > MAX_MOTION_COMPONENT_SIZE ||
    component.maxY - component.minY + 1 > MAX_MOTION_COMPONENT_SIZE
  );
}

function pushMotionNeighbors(
  stack: number[],
  activePixels: Uint8Array,
  frame: VideoCursorDetectionFrame,
  visited: Uint8Array,
  x: number,
  y: number
): void {
  for (const [offsetX, offsetY] of MOTION_NEIGHBORS) {
    const nextX = x + offsetX;
    const nextY = y + offsetY;
    if (nextX < 0 || nextY < 0 || nextX >= frame.width || nextY >= frame.height) {
      continue;
    }
    const nextIndex = nextY * frame.width + nextX;
    if (!visited[nextIndex] && activePixels[nextIndex]) {
      visited[nextIndex] = 1;
      stack.push(nextIndex);
    }
  }
}

function scoreMotionComponent(
  component: MotionComponent,
  frame: VideoCursorDetectionFrame
): VideoCursorDetectionCandidate | null {
  const width = component.maxX - component.minX + 1;
  const height = component.maxY - component.minY + 1;
  if (
    component.area < 3 ||
    component.area > MAX_MOTION_COMPONENT_AREA ||
    width > MAX_MOTION_COMPONENT_SIZE ||
    height > MAX_MOTION_COMPONENT_SIZE
  ) {
    return null;
  }

  const areaScore = clamp01(component.area / 16);
  const compactScore = clamp01(22 / Math.max(width * height, 1));
  const motionScore = clamp01(areaScore * 0.58 + compactScore * 0.42);
  const centerX = component.minX + width / 2;
  const centerY = component.minY + height / 2;
  return {
    area: component.area,
    bounds: { height, width, x: component.minX, y: component.minY },
    centerX,
    centerY,
    confidence: motionScore,
    contrastScore: 0,
    height,
    motionScore,
    shapeScore: 0,
    source: 'motion',
    staticPenalty: 1,
    time: frame.time,
    width,
    x: Math.round(centerX),
    y: Math.round(centerY),
  };
}

function getLuma(data: Uint8ClampedArray, index: number): number {
  return data[index]! * 0.2126 + data[index + 1]! * 0.7152 + data[index + 2]! * 0.0722;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

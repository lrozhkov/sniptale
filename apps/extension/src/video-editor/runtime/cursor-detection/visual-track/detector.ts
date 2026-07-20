import type {
  CursorCandidateDetectionOptions,
  VideoCursorDetectionCandidate,
  VideoCursorDetectionFrame,
} from './types';
import { resolveDetectionRegion } from './detector-guards';
import {
  hasOppositeNeighbor,
  isBrightPixel,
  isCandidatePixel,
  isComponentPixel,
  type CursorLumaMode,
} from './detector-predicates';
import { resolveComponentScores } from './detector-scoring';
import { isInFrame, NEIGHBOR_OFFSETS } from './pixels';
import { addPixelToComponentBounds, type PixelComponentBounds } from './component-bounds';

interface CursorDetectionParams {
  maxCandidates: number;
  maxComponentArea: number;
  maxCursorSize: number;
  maxDarkLuma: number;
  minBrightLuma: number;
  minComponentArea: number;
  minConfidence: number;
}

interface CursorComponent extends PixelComponentBounds {
  darkEdgePixels: number;
  lumaMode: CursorLumaMode;
  rejected: boolean;
  tipX: number;
  tipY: number;
}

const DEFAULT_DETECTION_PARAMS: CursorDetectionParams = {
  maxCandidates: 12,
  maxComponentArea: 2_400,
  maxCursorSize: 96,
  maxDarkLuma: 96,
  minBrightLuma: 210,
  minComponentArea: 8,
  minConfidence: 0.3,
};

export function detectCursorCandidate(
  frame: VideoCursorDetectionFrame,
  options: CursorCandidateDetectionOptions = {}
): VideoCursorDetectionCandidate | null {
  return detectCursorCandidates(frame, options)[0] ?? null;
}

export function detectCursorCandidates(
  frame: VideoCursorDetectionFrame,
  options: CursorCandidateDetectionOptions = {}
): VideoCursorDetectionCandidate[] {
  const params = resolveDetectionParams(options);
  const visited = new Uint8Array(frame.width * frame.height);
  const candidates: VideoCursorDetectionCandidate[] = [];
  const region = resolveDetectionRegion(frame, options.roi);

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const index = y * frame.width + x;
      if (visited[index] || !isCandidatePixel(frame, x, y, params)) {
        continue;
      }

      const component = collectCursorComponent(frame, x, y, visited, params);
      const candidate = scoreCursorComponent(frame, component, params);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  const sortedCandidates = candidates.toSorted(
    (first, second) => second.confidence - first.confidence
  );
  return sortedCandidates.slice(0, params.maxCandidates);
}

function resolveDetectionParams(options: CursorCandidateDetectionOptions): CursorDetectionParams {
  return { ...DEFAULT_DETECTION_PARAMS, ...options };
}

function collectCursorComponent(
  frame: VideoCursorDetectionFrame,
  startX: number,
  startY: number,
  visited: Uint8Array,
  params: CursorDetectionParams
): CursorComponent {
  const startIndex = startY * frame.width + startX;
  const stack = [startIndex];
  const component = createCursorComponent(frame, startX, startY, params);
  visited[startIndex] = 1;

  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % frame.width;
    const y = Math.floor(index / frame.width);
    if (!isComponentPixel(frame, x, y, params, component.lumaMode)) {
      continue;
    }

    if (!component.rejected) {
      addPixelToComponent(component, frame, x, y, params);
      component.rejected = isCursorComponentOverBudget(component, params);
    }
    pushComponentNeighbors(stack, frame, x, y, visited, params, component.lumaMode);
  }

  return component;
}

function createCursorComponent(
  frame: VideoCursorDetectionFrame,
  x: number,
  y: number,
  params: CursorDetectionParams
): CursorComponent {
  return {
    area: 0,
    darkEdgePixels: 0,
    lumaMode: isBrightPixel(frame, x, y, params) ? 'bright' : 'dark',
    maxX: x,
    maxY: y,
    minX: x,
    minY: y,
    rejected: false,
    tipX: x,
    tipY: y,
  };
}

function addPixelToComponent(
  component: CursorComponent,
  frame: VideoCursorDetectionFrame,
  x: number,
  y: number,
  params: CursorDetectionParams
): void {
  addPixelToComponentBounds(component, x, y);
  if (x + y < component.tipX + component.tipY) {
    component.tipX = x;
    component.tipY = y;
  }
  if (hasOppositeNeighbor(frame, x, y, params, component.lumaMode)) {
    component.darkEdgePixels += 1;
  }
}

function pushComponentNeighbors(
  stack: number[],
  frame: VideoCursorDetectionFrame,
  x: number,
  y: number,
  visited: Uint8Array,
  params: CursorDetectionParams,
  mode: CursorComponent['lumaMode']
): void {
  for (const [offsetX, offsetY] of NEIGHBOR_OFFSETS) {
    const nextX = x + offsetX;
    const nextY = y + offsetY;
    if (!isInFrame(frame, nextX, nextY)) {
      continue;
    }

    const index = nextY * frame.width + nextX;
    if (!visited[index] && isComponentPixel(frame, nextX, nextY, params, mode)) {
      visited[index] = 1;
      stack.push(index);
    }
  }
}

function scoreCursorComponent(
  frame: VideoCursorDetectionFrame,
  component: CursorComponent,
  params: CursorDetectionParams
): VideoCursorDetectionCandidate | null {
  const width = component.maxX - component.minX + 1;
  const height = component.maxY - component.minY + 1;
  if (component.rejected || !isCandidateSize(component, width, height, params)) {
    return null;
  }

  const scores = resolveComponentScores(frame, component, width, height, params);
  const confidence = scores.confidence;
  if (confidence < params.minConfidence) {
    return null;
  }

  return {
    area: component.area,
    bounds: { height, width, x: component.minX, y: component.minY },
    centerX: component.minX + width / 2,
    centerY: component.minY + height / 2,
    confidence,
    contrastScore: scores.contrastScore,
    height,
    motionScore: 0,
    shapeScore: scores.shapeScore,
    source: 'contrast',
    staticPenalty: scores.staticPenalty,
    time: frame.time,
    width,
    x: component.tipX,
    y: component.tipY,
  };
}

function isCandidateSize(
  component: CursorComponent,
  width: number,
  height: number,
  params: CursorDetectionParams
): boolean {
  return (
    component.area >= params.minComponentArea &&
    component.area <= params.maxComponentArea &&
    width <= params.maxCursorSize &&
    height <= params.maxCursorSize
  );
}

function isCursorComponentOverBudget(
  component: CursorComponent,
  params: CursorDetectionParams
): boolean {
  return (
    component.area > params.maxComponentArea ||
    component.maxX - component.minX + 1 > params.maxCursorSize ||
    component.maxY - component.minY + 1 > params.maxCursorSize
  );
}

import type {
  ScenarioElementFrame,
  ScenarioPoint,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { CAPTURE_CANVAS_HEIGHT, CAPTURE_CANVAS_WIDTH } from './constants';
import type { CaptureLayout } from './types';

interface CalloutPlacement {
  connectorStart: ScenarioPoint | null;
  frame: ScenarioElementFrame;
}

const CORNER_CALLOUT = { height: 118, width: 360 };
const SIDE_CALLOUT = { height: 152, width: 356 };
const CANVAS_GUTTER = 42;

export function chooseCalloutPlacement(args: {
  avoidFrames: ScenarioElementFrame[];
  focusPoint: ScenarioPoint | null;
  layout: CaptureLayout;
}): CalloutPlacement | null {
  if (args.layout.calloutAnchor === 'none') {
    return null;
  }

  const candidates = getCalloutCandidates(args.layout);
  const safeCandidates = candidates.filter((candidate) =>
    args.avoidFrames.every((avoidFrame) => !framesOverlap(candidate, avoidFrame))
  );
  const frame = pickBestCandidate(safeCandidates, args.focusPoint);
  if (!frame) {
    return null;
  }

  return {
    connectorStart: args.focusPoint ? getNearestFrameEdgePoint(frame, args.focusPoint) : null,
    frame,
  };
}

export function framesOverlap(a: ScenarioElementFrame, b: ScenarioElementFrame): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function getCalloutCandidates(layout: CaptureLayout): ScenarioElementFrame[] {
  return layout.calloutAnchor === 'side' ? getSideCandidates() : getCornerCandidates(layout);
}

function getSideCandidates(): ScenarioElementFrame[] {
  const x = CAPTURE_CANVAS_WIDTH - CANVAS_GUTTER - SIDE_CALLOUT.width;

  return [
    { ...SIDE_CALLOUT, x, y: 184 },
    { ...SIDE_CALLOUT, x, y: 382 },
    { ...SIDE_CALLOUT, x, y: 580 },
  ];
}

function getCornerCandidates(layout: CaptureLayout): ScenarioElementFrame[] {
  const inset = 26;
  const frame = layout.imageFrame;
  const right = frame.x + frame.width - CORNER_CALLOUT.width - inset;
  const bottom = frame.y + frame.height - CORNER_CALLOUT.height - inset;

  return [
    { ...CORNER_CALLOUT, x: right, y: frame.y + inset },
    { ...CORNER_CALLOUT, x: right, y: bottom },
    { ...CORNER_CALLOUT, x: frame.x + inset, y: frame.y + inset },
    { ...CORNER_CALLOUT, x: frame.x + inset, y: bottom },
  ].filter(isInsideCanvas);
}

function pickBestCandidate(
  candidates: ScenarioElementFrame[],
  focusPoint: ScenarioPoint | null
): ScenarioElementFrame | null {
  if (!focusPoint) {
    return candidates[0] ?? null;
  }

  return candidates.reduce<ScenarioElementFrame | null>((best, candidate) => {
    return !best ||
      getDistanceToFrameCenter(candidate, focusPoint) > getDistanceToFrameCenter(best, focusPoint)
      ? candidate
      : best;
  }, null);
}

function getDistanceToFrameCenter(frame: ScenarioElementFrame, point: ScenarioPoint): number {
  const dx = frame.x + frame.width / 2 - point.x;
  const dy = frame.y + frame.height / 2 - point.y;
  return Math.hypot(dx, dy);
}

function getNearestFrameEdgePoint(
  frame: ScenarioElementFrame,
  point: ScenarioPoint
): ScenarioPoint {
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const horizontalBias = Math.abs(point.x - centerX) > Math.abs(point.y - centerY);

  return horizontalBias
    ? { x: point.x < centerX ? frame.x : frame.x + frame.width, y: centerY }
    : { x: centerX, y: point.y < centerY ? frame.y : frame.y + frame.height };
}

function isInsideCanvas(frame: ScenarioElementFrame): boolean {
  return (
    frame.x >= 0 &&
    frame.y >= 0 &&
    frame.x + frame.width <= CAPTURE_CANVAS_WIDTH &&
    frame.y + frame.height <= CAPTURE_CANVAS_HEIGHT
  );
}

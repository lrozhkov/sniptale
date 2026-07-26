import type { FrameData } from '../../../../features/highlighter/contracts';

const FRAME_BORDER_HIT_THRESHOLD = 10;
const SELECTED_DEAD_ZONE = 2;
const HOVER_HYSTERESIS = 3;
const DISTANCE_EPSILON = 0.01;

export type FrameHitTarget = {
  frameId: string;
  kind: 'border' | 'resize-handle' | 'trigger';
};

type FrameBorderRect = Pick<FrameData, 'x' | 'y' | 'width' | 'height'>;

type FrameHitCandidate = {
  distance: number;
  frame: FrameData;
  index: number;
  visualLayer: number;
};

export function getDistanceToFrameBorder(frame: FrameBorderRect, x: number, y: number): number {
  const left = frame.x;
  const top = frame.y;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const insideX = x >= left && x <= right;
  const insideY = y >= top && y <= bottom;

  if (insideX && insideY) {
    return Math.min(x - left, right - x, y - top, bottom - y);
  }

  const nearestX = Math.max(left, Math.min(x, right));
  const nearestY = Math.max(top, Math.min(y, bottom));
  return Math.hypot(x - nearestX, y - nearestY);
}

export function isPointWithinFrameBorderHit(frame: FrameBorderRect, x: number, y: number) {
  return getDistanceToFrameBorder(frame, x, y) <= FRAME_BORDER_HIT_THRESHOLD;
}

function getVisualLayer(frame: FrameData): number {
  // The frame renderer places smaller annotations above larger ones. Equal-size
  // frames share that visual rank and are resolved by insertion order below.
  return -(frame.width * frame.height);
}

function isPointInFrameInterior(frame: FrameData, x: number, y: number) {
  return (
    x >= frame.x &&
    x <= frame.x + frame.width &&
    y >= frame.y &&
    y <= frame.y + frame.height &&
    getDistanceToFrameBorder(frame, x, y) > FRAME_BORDER_HIT_THRESHOLD
  );
}

function collectCandidates(frames: FrameData[], x: number, y: number): FrameHitCandidate[] {
  return frames.flatMap((frame, index) => {
    const distance = getDistanceToFrameBorder(frame, x, y);
    return distance <= FRAME_BORDER_HIT_THRESHOLD
      ? [{ distance, frame, index, visualLayer: getVisualLayer(frame) }]
      : [];
  });
}

function getCandidate(candidates: FrameHitCandidate[], frameId: string | null) {
  return frameId ? candidates.find((candidate) => candidate.frame.id === frameId) : undefined;
}

function compareCandidates(a: FrameHitCandidate, b: FrameHitCandidate) {
  if (Math.abs(a.distance - b.distance) > DISTANCE_EPSILON) {
    return a.distance - b.distance;
  }
  if (a.visualLayer !== b.visualLayer) {
    return b.visualLayer - a.visualLayer;
  }
  return b.index - a.index;
}

export function resolveFrameHitTarget(params: {
  directControl: FrameHitTarget | null;
  frames: FrameData[];
  hoveredFrameId: string | null;
  selectedFrameId: string | null;
  x: number;
  y: number;
}): FrameHitTarget | null {
  if (
    params.directControl &&
    params.frames.some((frame) => frame.id === params.directControl?.frameId)
  ) {
    return params.directControl;
  }

  const candidates = collectCandidates(params.frames, params.x, params.y).sort(compareCandidates);
  const nearest = candidates[0];
  if (!nearest) return null;

  const selected = getCandidate(candidates, params.selectedFrameId);
  if (selected && selected.distance <= nearest.distance + SELECTED_DEAD_ZONE) {
    return { frameId: selected.frame.id, kind: 'border' };
  }

  const hovered = getCandidate(candidates, params.hoveredFrameId);
  if (hovered && hovered.distance <= nearest.distance + HOVER_HYSTERESIS) {
    return { frameId: hovered.frame.id, kind: 'border' };
  }

  return { frameId: nearest.frame.id, kind: 'border' };
}

export function resolveFrameInteriorHitTarget(params: {
  frames: FrameData[];
  x: number;
  y: number;
}): string | null {
  const winner = params.frames
    .flatMap((frame, index) =>
      isPointInFrameInterior(frame, params.x, params.y)
        ? [{ frame, index, visualLayer: getVisualLayer(frame) }]
        : []
    )
    .sort((a, b) => b.visualLayer - a.visualLayer || b.index - a.index)[0];

  return winner?.frame.id ?? null;
}

export function resolveFrameControlHit(event: Event): FrameHitTarget | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  for (const target of path) {
    if (!(target instanceof HTMLElement)) continue;
    const frameId = target.dataset['frameId'];
    const control = target.dataset['frameControl'];
    if (!frameId) continue;
    if (control === 'trigger' || control === 'resize-handle') {
      return { frameId, kind: control };
    }
  }
  return null;
}

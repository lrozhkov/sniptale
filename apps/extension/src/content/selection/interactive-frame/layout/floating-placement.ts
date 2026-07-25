import { queryAllContentUiElements } from '../../../platform/dom-host';

export type FloatingRect = { x: number; y: number; width: number; height: number };
export type FrameFloatingSide = 'top' | 'bottom' | 'right' | 'left';

type Candidate = {
  index: number;
  rect: FloatingRect;
  side: FrameFloatingSide;
};

type ScoreContext = {
  anchorPoint: { x: number; y: number } | undefined;
  avoidanceRect: FloatingRect;
  preferredSide: FrameFloatingSide | undefined;
  sides: FrameFloatingSide[];
  softRects: FloatingRect[];
  strictRects: FloatingRect[];
  viewport: FloatingRect;
};

const VIEWPORT_MARGIN = 8;
const FRAME_GAP = 10;
const BORDER_EXCLUSION_WIDTH = 10;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function normalizeSize(size: { width: number; height: number }, viewport: FloatingRect) {
  return {
    width: Math.min(size.width, Math.max(0, viewport.width - VIEWPORT_MARGIN * 2)),
    height: Math.min(size.height, Math.max(0, viewport.height - VIEWPORT_MARGIN * 2)),
  };
}

function clampRect(rect: FloatingRect, viewport: FloatingRect): FloatingRect {
  return {
    ...rect,
    x: clamp(
      rect.x,
      viewport.x + VIEWPORT_MARGIN,
      viewport.x + viewport.width - rect.width - VIEWPORT_MARGIN
    ),
    y: clamp(
      rect.y,
      viewport.y + VIEWPORT_MARGIN,
      viewport.y + viewport.height - rect.height - VIEWPORT_MARGIN
    ),
  };
}

function createRectForSide(
  anchor: FloatingRect,
  size: { width: number; height: number },
  side: FrameFloatingSide,
  alignment: number,
  gap: number
): FloatingRect {
  if (side === 'top' || side === 'bottom') {
    return {
      x: anchor.x + (anchor.width - size.width) * alignment,
      y: side === 'top' ? anchor.y - size.height - gap : anchor.y + anchor.height + gap,
      ...size,
    };
  }
  return {
    x: side === 'left' ? anchor.x - size.width - gap : anchor.x + anchor.width + gap,
    y: anchor.y + (anchor.height - size.height) * alignment,
    ...size,
  };
}

function createRectForPoint(
  anchor: FloatingRect,
  size: { width: number; height: number },
  side: FrameFloatingSide,
  point: { x: number; y: number },
  gap: number
): FloatingRect {
  const rect = createRectForSide(anchor, size, side, 0.5, gap);
  return side === 'top' || side === 'bottom'
    ? { ...rect, x: point.x - size.width / 2 }
    : { ...rect, y: point.y - size.height / 2 };
}

function rangesOverlap(startA: number, sizeA: number, startB: number, sizeB: number) {
  return Math.min(startA + sizeA, startB + sizeB) > Math.max(startA, startB);
}

function createEscapeRect(
  anchor: FloatingRect,
  obstacle: FloatingRect,
  size: { width: number; height: number },
  side: FrameFloatingSide,
  alignment: number
): FloatingRect | null {
  if (side === 'top' || side === 'bottom') {
    if (!rangesOverlap(anchor.x, anchor.width, obstacle.x, obstacle.width)) return null;
    if (side === 'top' && obstacle.y >= anchor.y) return null;
    if (side === 'bottom' && obstacle.y <= anchor.y + anchor.height) return null;
    return {
      x: anchor.x + (anchor.width - size.width) * alignment,
      y:
        side === 'top'
          ? obstacle.y - size.height - FRAME_GAP
          : obstacle.y + obstacle.height + FRAME_GAP,
      ...size,
    };
  }
  if (!rangesOverlap(anchor.y, anchor.height, obstacle.y, obstacle.height)) return null;
  if (side === 'left' && obstacle.x >= anchor.x) return null;
  if (side === 'right' && obstacle.x <= anchor.x + anchor.width) return null;
  return {
    x:
      side === 'left'
        ? obstacle.x - size.width - FRAME_GAP
        : obstacle.x + obstacle.width + FRAME_GAP,
    y: anchor.y + (anchor.height - size.height) * alignment,
    ...size,
  };
}

function intersectionArea(a: FloatingRect, b: FloatingRect) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function totalOverlap(rects: FloatingRect[], exclusions: FloatingRect[]) {
  return rects.reduce(
    (total, rect) =>
      total +
      exclusions.reduce((subtotal, exclusion) => subtotal + intersectionArea(rect, exclusion), 0),
    0
  );
}

function distanceBetween(a: FloatingRect, b: FloatingRect) {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(dx, dy);
}

function scoreCandidate(candidate: Candidate, context: ScoreContext) {
  const rects = [candidate.rect];
  const avoidanceOverlap = totalOverlap(rects, [context.avoidanceRect]);
  const strictOverlap = totalOverlap(rects, context.strictRects);
  const viewportOverflow = rects.reduce(
    (total, rect) => total + rect.width * rect.height - intersectionArea(rect, context.viewport),
    0
  );
  const pointDistance = context.anchorPoint
    ? Math.hypot(
        candidate.rect.x + candidate.rect.width / 2 - context.anchorPoint.x,
        candidate.rect.y + candidate.rect.height / 2 - context.anchorPoint.y
      )
    : 0;
  return [
    avoidanceOverlap > 0 ? 1 : 0,
    strictOverlap > 0 ? 1 : 0,
    viewportOverflow > 0 ? 1 : 0,
    context.preferredSide ? context.sides.indexOf(candidate.side) : 0,
    pointDistance,
    distanceBetween(candidate.rect, context.avoidanceRect),
    totalOverlap(rects, context.softRects),
    avoidanceOverlap,
    strictOverlap,
    viewportOverflow,
    candidate.index,
  ];
}

function compareScores(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function calculateFrameFloatingPlacement(params: {
  anchorPoint?: { x: number; y: number };
  anchorRect: FloatingRect;
  avoidanceRect: FloatingRect;
  preferredSide?: FrameFloatingSide;
  size: { width: number; height: number };
  softRects?: FloatingRect[];
  strictRects?: FloatingRect[];
  viewport?: { width: number; height: number };
}) {
  const viewport: FloatingRect = {
    x: 0,
    y: 0,
    width: params.viewport?.width ?? window.innerWidth,
    height: params.viewport?.height ?? window.innerHeight,
  };
  const size = normalizeSize(params.size, viewport);
  const defaultSides: FrameFloatingSide[] = ['top', 'bottom', 'right', 'left'];
  const sides = params.preferredSide
    ? [params.preferredSide, ...defaultSides.filter((side) => side !== params.preferredSide)]
    : defaultSides;
  const strictRects = params.strictRects ?? [];
  const softRects = params.softRects ?? [];
  let index = 0;
  const candidates: Candidate[] = [];
  const addCandidate = (rect: FloatingRect, side: FrameFloatingSide) => {
    const clampedRect = clampRect(rect, viewport);
    candidates.push({
      index,
      rect: clampedRect,
      side,
    });
    index += 1;
  };
  sides.forEach((side) => {
    if (params.anchorPoint) {
      addCandidate(
        createRectForPoint(params.anchorRect, size, side, params.anchorPoint, FRAME_GAP),
        side
      );
    }
    [0, 0.5, 1].forEach((alignment) => {
      addCandidate(createRectForSide(params.anchorRect, size, side, alignment, FRAME_GAP), side);
    });
    strictRects.forEach((obstacle) => {
      [0, 0.5, 1].forEach((alignment) => {
        const escapeRect = createEscapeRect(params.anchorRect, obstacle, size, side, alignment);
        if (escapeRect) addCandidate(escapeRect, side);
      });
    });
  });
  const scoreContext: ScoreContext = {
    anchorPoint: params.anchorPoint,
    avoidanceRect: params.avoidanceRect,
    preferredSide: params.preferredSide,
    sides,
    softRects,
    strictRects,
    viewport,
  };
  candidates.sort((a, b) =>
    compareScores(scoreCandidate(a, scoreContext), scoreCandidate(b, scoreContext))
  );
  const winner = candidates[0]!;
  return {
    ...winner,
    distanceToAnchor: distanceBetween(winner.rect, params.avoidanceRect),
  };
}

function toRect(rect: DOMRect): FloatingRect {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function getBorderBands(rect: FloatingRect): FloatingRect[] {
  const half = BORDER_EXCLUSION_WIDTH / 2;
  return [
    {
      x: rect.x - half,
      y: rect.y - half,
      width: rect.width + BORDER_EXCLUSION_WIDTH,
      height: BORDER_EXCLUSION_WIDTH,
    },
    {
      x: rect.x - half,
      y: rect.y + rect.height - half,
      width: rect.width + BORDER_EXCLUSION_WIDTH,
      height: BORDER_EXCLUSION_WIDTH,
    },
    {
      x: rect.x - half,
      y: rect.y + half,
      width: BORDER_EXCLUSION_WIDTH,
      height: Math.max(0, rect.height - BORDER_EXCLUSION_WIDTH),
    },
    {
      x: rect.x + rect.width - half,
      y: rect.y + half,
      width: BORDER_EXCLUSION_WIDTH,
      height: Math.max(0, rect.height - BORDER_EXCLUSION_WIDTH),
    },
  ];
}

export function collectFrameFloatingExclusions(selectedFrameId: string) {
  const strictRects: FloatingRect[] = [];
  const softRects: FloatingRect[] = [];
  queryAllContentUiElements('.sniptale-frame-container').forEach((element) => {
    if (!(element instanceof HTMLElement) || element.dataset['frameId'] === selectedFrameId) return;
    const rect = toRect(element.getBoundingClientRect());
    softRects.push(rect);
    strictRects.push(...getBorderBands(rect));
  });
  queryAllContentUiElements(
    '.sniptale-resize-handle, .sniptale-frame-toolbar-trigger, .sniptale-toolbar-portal-wrapper'
  ).forEach((element) => {
    if (!(element instanceof HTMLElement) || element.dataset['frameId'] === selectedFrameId) return;
    strictRects.push(toRect(element.getBoundingClientRect()));
  });
  return { softRects, strictRects };
}

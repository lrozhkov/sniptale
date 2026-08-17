import { expect, it } from 'vitest';
import { getDynamicTailState } from './dynamic-tail';

const cases = [
  ['top', { x: 120, y: 20, width: 120, height: 48 }, { x: 30, y: 0 }],
  ['right', { x: 300, y: 136, width: 120, height: 48 }, { x: 0, y: 30 }],
  ['bottom', { x: 120, y: 280, width: 120, height: 48 }, { x: 30, y: 0 }],
  ['left', { x: -20, y: 136, width: 120, height: 48 }, { x: 0, y: 30 }],
] as const;

it.each(cases)(
  'leans the automatic %s tail toward the moved bubble instead of crossing its direction',
  (side, bubbleRect, movement) => {
    const frameRect = { x: 100, y: 100, width: 160, height: 120 };
    const anchorPoint = { x: 180, y: 160 };
    const initial = getDynamicTailState({
      anchorPoint,
      bubbleRect,
      frameRect,
      preferredSide: side,
      tailSize: 8,
    });
    const moved = getDynamicTailState({
      anchorPoint,
      bubbleOffset: movement,
      bubbleRect: {
        ...bubbleRect,
        x: bubbleRect.x + movement.x,
        y: bubbleRect.y + movement.y,
      },
      frameRect,
      previousSide: initial.side,
      tailSize: 8,
    });
    const horizontal = side === 'top' || side === 'bottom';
    const bubbleDelta = horizontal
      ? moved.attachment.bubbleEdgePoint.x - initial.attachment.bubbleEdgePoint.x
      : moved.attachment.bubbleEdgePoint.y - initial.attachment.bubbleEdgePoint.y;
    const frameDelta = horizontal
      ? moved.attachment.framePoint.x - initial.attachment.framePoint.x
      : moved.attachment.framePoint.y - initial.attachment.framePoint.y;
    const movementDelta = horizontal ? movement.x : movement.y;

    expect(bubbleDelta).toBeGreaterThan(frameDelta);
    expect(frameDelta).toBeGreaterThanOrEqual(movementDelta * 0.6);
  }
);

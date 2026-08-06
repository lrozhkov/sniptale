import { expect, it } from 'vitest';
import { getDynamicTailState } from './dynamic-tail';

const cases = [
  ['top', { x: 120, y: 20, width: 72, height: 40 }],
  ['right', { x: 300, y: 90, width: 72, height: 40 }],
  ['bottom', { x: 120, y: 260, width: 72, height: 40 }],
  ['left', { x: 8, y: 90, width: 72, height: 40 }],
] as const;

it.each(cases)(
  'keeps a visible wedge base when a compact rounded bubble attaches inside a %s corner',
  (side, bubbleRect) => {
    const state = getDynamicTailState({
      borderRadius: 20,
      borderWidth: 2,
      bubbleRect,
      frameRect: { x: 100, y: 100, width: 120, height: 80 },
      preferredSide: side,
      tailBasePosition: 0.15,
      tailBaseWidth: 0.3,
      tailSize: 10,
    });

    expect(state.side).toBe(side);
    expect(
      Math.hypot(
        state.attachment.baseEdgeB.x - state.attachment.baseEdgeA.x,
        state.attachment.baseEdgeB.y - state.attachment.baseEdgeA.y
      )
    ).toBeGreaterThan(6);
    const bubbleSide = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }[side];
    const leavesStraightEdge =
      bubbleSide === 'top'
        ? Math.max(state.attachment.baseEdgeA.y, state.attachment.baseEdgeB.y) > bubbleRect.y
        : bubbleSide === 'bottom'
          ? Math.min(state.attachment.baseEdgeA.y, state.attachment.baseEdgeB.y) <
            bubbleRect.y + bubbleRect.height
          : bubbleSide === 'left'
            ? Math.max(state.attachment.baseEdgeA.x, state.attachment.baseEdgeB.x) > bubbleRect.x
            : Math.min(state.attachment.baseEdgeA.x, state.attachment.baseEdgeB.x) <
              bubbleRect.x + bubbleRect.width;
    expect(leavesStraightEdge).toBe(true);
    expect(state.outlinePath.startsWith('M ')).toBe(true);
    expect(state.outlinePath.match(/ M /g)).toBeNull();
    expect(state.outlinePath).not.toContain('NaN');
    expect(state.outlinePath.endsWith('Z')).toBe(true);
  }
);

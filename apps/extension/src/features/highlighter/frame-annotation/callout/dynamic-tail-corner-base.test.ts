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

function expectExteriorLegs(
  state: ReturnType<typeof getDynamicTailState>,
  bubbleRect: { x: number; y: number; width: number; height: number },
  radius: number
) {
  for (const [edge, tip] of [
    [state.attachment.baseEdgeA, state.attachment.tipA],
    [state.attachment.baseEdgeB, state.attachment.tipB],
  ] as const) {
    const center = {
      x: Math.max(
        bubbleRect.x + radius,
        Math.min(bubbleRect.x + bubbleRect.width - radius, edge.x)
      ),
      y: Math.max(
        bubbleRect.y + radius,
        Math.min(bubbleRect.y + bubbleRect.height - radius, edge.y)
      ),
    };
    const normal = { x: edge.x - center.x, y: edge.y - center.y };
    const normalLength = Math.hypot(normal.x, normal.y);
    const outwardDistance =
      ((tip.x - edge.x) * normal.x + (tip.y - edge.y) * normal.y) / normalLength;
    // One millionth of a CSS pixel admits only numerical error at a tangent.
    expect(outwardDistance).toBeGreaterThanOrEqual(-0.000001);
  }
}

it.each([
  ['left', { x: -30, y: 110, width: 120, height: 48 }],
  ['right', { x: 270, y: 110, width: 120, height: 48 }],
  ['top', { x: 110, y: -30, width: 48, height: 120 }],
  ['bottom', { x: 110, y: 270, width: 48, height: 120 }],
] as const)('keeps both automatic %s wedge legs outside the rounded bubble', (side, bubbleRect) => {
  const state = getDynamicTailState({
    borderRadius: 20,
    bubbleRect,
    frameRect:
      side === 'left' || side === 'right'
        ? { x: 100, y: 100, width: 160, height: 120 }
        : { x: 100, y: 100, width: 120, height: 160 },
    preferredSide: side,
    tailSize: 8,
  });
  expectExteriorLegs(state, bubbleRect, 20);
});

it('keeps a nearly touching automatic wedge outside the bubble', () => {
  const bubbleRect = { x: -28.01, y: 110, width: 120, height: 48 };
  const state = getDynamicTailState({
    borderRadius: 20,
    bubbleRect,
    frameRect: { x: 100, y: 100, width: 160, height: 120 },
    tailSize: 8,
  });
  expectExteriorLegs(state, bubbleRect, 20);
});

it('keeps both automatic legs outside while the bubble moves past a rounded corner', () => {
  for (const y of [110, 120, 130, 140, 150, 160, 170]) {
    const bubbleRect = { x: -30, y, width: 120, height: 48 };
    const state = getDynamicTailState({
      borderRadius: 20,
      bubbleOffset: { x: 0, y: y - 110 },
      bubbleRect,
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      previousSide: 'left',
      tailSize: 8,
    });
    expect(state.side).toBe('left');
    expectExteriorLegs(state, bubbleRect, 20);
    expect(state.attachment.tipPoint.x).toBe(92);
  }
});

it.each([
  [{ tailBasePosition: 0.3 }, { x: 83.66894289987343, y: 115.4 }, { x: 90, y: 133.4 }, 143.36],
  [
    { tailBaseWidth: 0.2 },
    { x: 89.93589727100338, y: 139.6 },
    { x: 86.56985214176636, y: 149.20000000000002 },
    143.36,
  ],
  [
    { tailBasePosition: 0.3, tailBaseWidth: 0.2, tailFramePosition: 0.7 },
    { x: 87.0833252032501, y: 119.60000000000001 },
    { x: 89.98399359487487, y: 129.20000000000002 },
    184,
  ],
] as const)(
  'preserves authored rounded-corner attachments %j',
  (settings, baseA, baseB, frameY) => {
    const state = getDynamicTailState({
      borderRadius: 20,
      bubbleRect: { x: -30, y: 110, width: 120, height: 48 },
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      tailSize: 8,
      ...settings,
    });
    expect(state.attachment.baseEdgeA).toEqual(baseA);
    expect(state.attachment.baseEdgeB).toEqual(baseB);
    expect(state.attachment.framePoint).toEqual({ x: 100, y: frameY });
  }
);

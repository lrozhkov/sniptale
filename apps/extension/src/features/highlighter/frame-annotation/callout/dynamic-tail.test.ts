import { describe, expect, it } from 'vitest';
import { getDynamicTailState } from './dynamic-tail';

describe('getDynamicTailState', () => {
  it('slides the frame endpoint along the nearest side as the bubble moves', () => {
    const frameRect = { x: 100, y: 100, width: 160, height: 120 };
    const upper = getDynamicTailState({
      frameRect,
      bubbleRect: { x: 330, y: 80, width: 140, height: 60 },
      tailSize: 8,
    });
    const lower = getDynamicTailState({
      frameRect,
      bubbleRect: { x: 330, y: 190, width: 140, height: 60 },
      tailSize: 8,
      previousSide: upper.side,
    });

    expect(upper.side).toBe('right');
    expect(lower.side).toBe('right');
    expect(lower.path).not.toBe(upper.path);
  });

  it('keeps the previous side inside the corner hysteresis zone', () => {
    const state = getDynamicTailState({
      frameRect: { x: 100, y: 100, width: 100, height: 100 },
      bubbleRect: { x: 220, y: 215, width: 60, height: 60 },
      previousSide: 'right',
      tailSize: 8,
    });

    expect(state.side).toBe('right');
  });

  it('builds one outer contour around a bordered bubble and its tail', () => {
    const state = getDynamicTailState({
      borderRadius: 12,
      borderWidth: 6,
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect: { x: 120, y: 20, width: 160, height: 48 },
      preferredSide: 'top',
      tailSize: 8,
    });

    expect(state.outlinePath.match(/ M /g)).toBeNull();
    expect(state.outlinePath.startsWith('M ')).toBe(true);
    expect(
      (state.outlinePath.match(/ Q /g)?.length ?? 0) +
        (state.outlinePath.match(/ A /g)?.length ?? 0)
    ).toBe(5);
    expect(state.outlinePath.endsWith('Z')).toBe(true);
    expect(state.geometry.contentRect).toEqual({
      x: -state.geometry.bounds.x,
      y: -state.geometry.bounds.y,
      width: 160,
      height: 48,
    });
    expect(state.geometry.bounds.width).toBeGreaterThanOrEqual(160);
    expect(state.geometry.bounds.height).toBeGreaterThan(48);
  });

  it.each([
    ['top', { x: 140, y: 20, width: 120, height: 48 }],
    ['right', { x: 300, y: 120, width: 120, height: 48 }],
    ['bottom', { x: 140, y: 280, width: 120, height: 48 }],
    ['left', { x: -40, y: 120, width: 120, height: 48 }],
  ] as const)('keeps a single rounded outer contour on the %s side', (side, bubbleRect) => {
    const state = getDynamicTailState({
      borderRadius: 10,
      borderWidth: 4,
      bubbleRect,
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      preferredSide: side,
      tailSize: 8,
    });

    expect(state.side).toBe(side);
    expect(state.outlinePath.startsWith('M ')).toBe(true);
    expect(state.outlinePath.match(/ M /g)).toBeNull();
    expect(
      (state.outlinePath.match(/ Q /g)?.length ?? 0) +
        (state.outlinePath.match(/ A /g)?.length ?? 0)
    ).toBe(5);
    expect(state.outlinePath.endsWith('Z')).toBe(true);
    expect(state.outlinePath).not.toContain('NaN');
  });

  it('overlaps the bubble edge and keeps a visible-width frame endpoint at an angle', () => {
    const bubbleRect = { x: 330, y: 78, width: 150, height: 72 };
    const state = getDynamicTailState({
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect,
      tailSize: 10,
    });
    expect(state.side).toBe('right');
    expect(state.attachment.bubblePoint.x).toBeGreaterThan(bubbleRect.x);
    expect(
      Math.hypot(
        state.attachment.tipA.x - state.attachment.tipB.x,
        state.attachment.tipA.y - state.attachment.tipB.y
      )
    ).toBeGreaterThan(0.5);
  });

  it.each([
    ['top', { x: 240, y: 20, width: 120, height: 60 }],
    ['bottom', { x: 0, y: 290, width: 120, height: 60 }],
  ] as const)(
    'angles the leader for an offset bubble on the %s side',
    (expectedSide, bubbleRect) => {
      const state = getDynamicTailState({
        frameRect: { x: 100, y: 100, width: 160, height: 120 },
        bubbleRect,
        tailSize: 8,
      });

      expect(state.side).toBe(expectedSide);
      expect(state.attachment.bubblePoint.x).not.toBe(state.attachment.framePoint.x);
    }
  );

  it('changes a straight connector angle gradually as the bubble moves sideways', () => {
    const frameRect = { x: 100, y: 100, width: 160, height: 120 };
    const centered = getDynamicTailState({
      anchorPoint: { x: 180, y: 100 },
      frameRect,
      bubbleRect: { x: 120, y: 20, width: 120, height: 48 },
      preferredSide: 'top',
      tailSize: 8,
    });
    const shifted = getDynamicTailState({
      anchorPoint: { x: 180, y: 100 },
      frameRect,
      bubbleRect: { x: 140, y: 20, width: 120, height: 48 },
      previousSide: centered.side,
      tailSize: 8,
    });

    expect(shifted.attachment.framePoint.x).toBeGreaterThan(centered.attachment.framePoint.x);
    expect(
      shifted.attachment.framePoint.x - centered.attachment.framePoint.x
    ).toBeGreaterThanOrEqual(16);
    expect(shifted.attachment.framePoint.x - centered.attachment.framePoint.x).toBeLessThan(20);
    expect(shifted.path.startsWith('M ')).toBe(true);
  });

  it('tapers continuously instead of keeping one width along the connector', () => {
    const near = getDynamicTailState({
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect: { x: 280, y: 120, width: 120, height: 60 },
      anchorPoint: { x: 260, y: 160 },
      tailSize: 8,
    });
    const far = getDynamicTailState({
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect: { x: 520, y: 20, width: 120, height: 60 },
      anchorPoint: { x: 260, y: 160 },
      tailSize: 8,
    });

    const width = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const baseWidth = width(near.attachment.baseA, near.attachment.baseB);
    const tipWidth = width(near.attachment.tipA, near.attachment.tipB);

    expect(baseWidth).toBeGreaterThan(tipWidth);
    expect(tipWidth).toBeGreaterThan(0.5);
    expect(tipWidth).toBeLessThan(5);
    expect(width(far.attachment.tipA, far.attachment.tipB)).toBeCloseTo(tipWidth);
    expect(near.path.match(/ Q /g)).toHaveLength(1);
    expect(near.path).not.toContain('A ');
    expect(near.path).not.toContain('C ');
    expect(near.path).toContain('Z');
  });

  it('lets the bubble base approach a rounded corner without detaching', () => {
    const state = getDynamicTailState({
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect: { x: 120, y: 10, width: 80, height: 80 },
      anchorPoint: { x: 100, y: 100 },
      preferredSide: 'top',
      tailSize: 10,
    });

    expect(state.attachment.baseA.x).toBeGreaterThanOrEqual(122);
    expect(state.attachment.baseA.x).toBeLessThanOrEqual(128);
    expect(state.attachment.baseB.x).toBeGreaterThan(state.attachment.baseA.x);
  });

  it.each([
    ['top', { x: 150, y: 20, width: 80, height: 40 }],
    ['right', { x: 300, y: 140, width: 80, height: 40 }],
    ['bottom', { x: 150, y: 280, width: 80, height: 40 }],
    ['left', { x: 20, y: 140, width: 60, height: 40 }],
  ] as const)('keeps the %s terminus on the frame boundary', (side, bubbleRect) => {
    const state = getDynamicTailState({
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect,
      preferredSide: side,
      tailSize: 8,
    });

    expect(state.side).toBe(side);
    if (side === 'top') {
      expect(state.attachment.framePoint.y).toBe(100);
      expect(state.attachment.tipPoint.y).toBe(92);
    }
    if (side === 'right') {
      expect(state.attachment.framePoint.x).toBe(260);
      expect(state.attachment.tipPoint.x).toBe(268);
    }
    if (side === 'bottom') {
      expect(state.attachment.framePoint.y).toBe(220);
      expect(state.attachment.tipPoint.y).toBe(228);
    }
    if (side === 'left') {
      expect(state.attachment.framePoint.x).toBe(100);
      expect(state.attachment.tipPoint.x).toBe(92);
    }
  });
});

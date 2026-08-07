import { describe, expect, it } from 'vitest';
import { getDynamicTailState } from './dynamic-tail';

type Point = { x: number; y: number };

function vector(from: Point, to: Point) {
  return { x: to.x - from.x, y: to.y - from.y };
}

function normalizedCrossProduct(a: Point, b: Point) {
  return (a.x * b.y - a.y * b.x) / Math.max(1, Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
}

describe('dynamic callout tail endpoints', () => {
  it('uses one triangular contour with a normally rounded corner facing the frame', () => {
    const state = getDynamicTailState({
      anchorPoint: { x: 190, y: 100 },
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect: { x: 150, y: 20, width: 80, height: 40 },
      preferredSide: 'top',
      tailSize: 8,
    });

    expect(state.path.match(/ Q /g)).toHaveLength(1);
    expect(state.path).not.toContain('A ');
    expect(state.path).not.toContain('C ');
    expect(state.attachment.tipPoint.y).toBe(92);
    expect(state.attachment.tipA.y).toBeLessThan(state.attachment.tipPoint.y);
    expect(state.attachment.tipB.y).toBeLessThan(state.attachment.tipPoint.y);
  });

  it('keeps the rounded-corner thickness stable when the triangle is angled', () => {
    const straight = getDynamicTailState({
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect: { x: 120, y: 20, width: 120, height: 48 },
      preferredSide: 'top',
      tailSize: 10,
    });
    const angled = getDynamicTailState({
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect: { x: 220, y: 20, width: 120, height: 48 },
      preferredSide: 'top',
      tailSize: 10,
    });
    const capWidth = (state: typeof straight) =>
      Math.hypot(
        state.attachment.tipB.x - state.attachment.tipA.x,
        state.attachment.tipB.y - state.attachment.tipA.y
      );
    expect(capWidth(angled)).toBeCloseTo(capWidth(straight));
    expect(straight.attachment.tipPoint.y).toBe(92);
    expect(angled.attachment.tipPoint.y).toBe(92);
    expect(angled.path.match(/ Q /g)).toHaveLength(1);
  });

  it('joins both tapered sides to the rounded terminus without an arrowhead shoulder', () => {
    const state = getDynamicTailState({
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect: { x: 250, y: 20, width: 120, height: 48 },
      preferredSide: 'top',
      tailSize: 10,
    });
    const attachment = state.attachment;

    const incomingSide = vector(attachment.baseA, attachment.tipA);
    const incomingCurve = vector(attachment.tipA, attachment.tipVertex);
    const outgoingCurve = vector(attachment.tipVertex, attachment.tipB);
    const outgoingSide = vector(attachment.tipB, attachment.baseB);
    const roundedCornerMidpoint = {
      x: attachment.tipA.x * 0.25 + attachment.tipVertex.x * 0.5 + attachment.tipB.x * 0.25,
      y: attachment.tipA.y * 0.25 + attachment.tipVertex.y * 0.5 + attachment.tipB.y * 0.25,
    };

    expect(normalizedCrossProduct(incomingSide, incomingCurve)).toBeCloseTo(0);
    expect(normalizedCrossProduct(outgoingCurve, outgoingSide)).toBeCloseTo(0);
    expect(roundedCornerMidpoint.x).toBeCloseTo(attachment.tipPoint.x);
    expect(roundedCornerMidpoint.y).toBeCloseTo(attachment.tipPoint.y);
  });

  it('moves the bubble base along its boundary without changing the frame gap', () => {
    const args = {
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect: { x: 120, y: 20, width: 160, height: 48 },
      preferredSide: 'top' as const,
      tailSize: 8,
    };
    const left = getDynamicTailState({ ...args, tailBasePosition: 0.25 });
    const right = getDynamicTailState({ ...args, tailBasePosition: 0.75 });

    expect(right.attachment.bubblePoint.x).toBeGreaterThan(left.attachment.bubblePoint.x);
    expect(right.attachment.bubblePoint.y).toBe(left.attachment.bubblePoint.y);
    expect(right.attachment.bubbleEdgePoint.y).toBe(args.bubbleRect.y + args.bubbleRect.height);
    expect(right.attachment.tipPoint).toEqual(left.attachment.tipPoint);
  });

  it('changes the base width around its persisted center', () => {
    const args = {
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect: { x: 120, y: 20, width: 160, height: 48 },
      preferredSide: 'top' as const,
      tailBasePosition: 0.5,
      tailSize: 8,
    };
    const narrow = getDynamicTailState({ ...args, tailBaseWidth: 0.1 });
    const wide = getDynamicTailState({ ...args, tailBaseWidth: 0.3 });
    const width = (state: typeof narrow) =>
      Math.hypot(
        state.attachment.baseEdgeB.x - state.attachment.baseEdgeA.x,
        state.attachment.baseEdgeB.y - state.attachment.baseEdgeA.y
      );
    const tipWidth = (state: typeof narrow) =>
      Math.hypot(
        state.attachment.tipB.x - state.attachment.tipA.x,
        state.attachment.tipB.y - state.attachment.tipA.y
      );

    expect(width(narrow)).toBeCloseTo(16);
    expect(width(wide)).toBeCloseTo(48);
    expect(tipWidth(wide) / tipWidth(narrow)).toBeCloseTo(width(wide) / width(narrow));
    expect(wide.attachment.bubbleEdgePoint).toEqual(narrow.attachment.bubbleEdgePoint);
  });

  it('moves the rounded frame endpoint along the selected frame boundary', () => {
    const args = {
      frameRect: { x: 100, y: 100, width: 160, height: 120 },
      bubbleRect: { x: 120, y: 20, width: 160, height: 48 },
      preferredSide: 'top' as const,
      tailSize: 8,
    };
    const left = getDynamicTailState({ ...args, tailFramePosition: 0.25 });
    const right = getDynamicTailState({ ...args, tailFramePosition: 0.75 });

    expect(right.attachment.framePoint.x).toBeGreaterThan(left.attachment.framePoint.x);
    expect(right.attachment.framePoint.y).toBe(left.attachment.framePoint.y);
    expect(right.attachment.tipPoint.y).toBe(left.attachment.tipPoint.y);
    expect(right.attachment.bubblePoint).toEqual(left.attachment.bubblePoint);
  });
});

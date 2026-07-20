import { describe, expect, it, vi } from 'vitest';

import { getTextCalloutPath, traceTextCalloutPath } from './path';

function createTraceContext() {
  return {
    arcTo: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
  };
}

describe('text callout path owners', () => {
  it('builds pointer and flag paths against the authoritative frame', () => {
    const frame = { height: 80, left: -40, top: -20, width: 160 };

    expect(getTextCalloutPath('pointer', frame)).toContain('M -4 -20 H 120 V 60');
    expect(getTextCalloutPath('flag', frame)).toContain('L 96 20');
    expect(getTextCalloutPath('plain', frame)).toBeNull();
  });

  it('traces rounded callout formats through the canvas path seam', () => {
    const ctx = createTraceContext();
    const frame = { height: 40, left: -100, top: -20, width: 200 };

    expect(traceTextCalloutPath(ctx as never, 'panel', frame)).toBe(true);
    expect(traceTextCalloutPath(ctx as never, 'bubble', frame)).toBe(true);
    expect(traceTextCalloutPath(ctx as never, 'arrow-bubble', frame)).toBe(true);
    expect(ctx.beginPath).toHaveBeenCalledTimes(3);
    expect(ctx.arcTo).toHaveBeenCalled();
    expect(ctx.closePath).toHaveBeenCalledTimes(3);
  });

  it('keeps pointer, flag, and plain formats out of the rounded canvas tracer', () => {
    const ctx = createTraceContext();
    const frame = { height: 60, left: 0, top: 0, width: 100 };

    expect(traceTextCalloutPath(ctx as never, 'pointer', frame)).toBe(false);
    expect(traceTextCalloutPath(ctx as never, 'flag', frame)).toBe(false);
    expect(traceTextCalloutPath(ctx as never, 'plain', frame)).toBe(false);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });
});

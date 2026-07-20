import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTextCalloutTailMetricsMock: vi.fn(() => ({})),
}));

vi.mock('./geometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./geometry')>()),
  getTextCalloutTailMetrics: mocks.getTextCalloutTailMetricsMock,
}));

import { traceRoundedCalloutPath } from './rounded-trace';

function createTraceContext() {
  return {
    arcTo: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
  };
}

describe('rounded callout trace', () => {
  it('falls back to unit tail metrics when tracing bubble-family callouts', () => {
    const ctx = createTraceContext();
    const frame = { height: 40, left: -100, top: -20, width: 200 };

    traceRoundedCalloutPath(ctx as never, 'panel', frame);
    traceRoundedCalloutPath(ctx as never, 'bubble', frame);
    traceRoundedCalloutPath(ctx as never, 'arrow-bubble', frame);

    expect(ctx.beginPath).toHaveBeenCalledTimes(3);
    expect(ctx.lineTo).toHaveBeenCalledWith(0, 20);
    expect(ctx.lineTo).toHaveBeenCalledWith(1, 19);
    expect(ctx.lineTo).toHaveBeenCalledWith(-1, 19);
    expect(ctx.closePath).toHaveBeenCalledTimes(3);
  });
});

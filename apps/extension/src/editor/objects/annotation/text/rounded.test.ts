import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTextCalloutTailMetricsMock: vi.fn(() => ({})),
}));

vi.mock('./geometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./geometry')>()),
  getTextCalloutTailMetrics: mocks.getTextCalloutTailMetricsMock,
}));

import { getRoundedCalloutPath } from './rounded';

describe('rounded callout path', () => {
  it('falls back to unit tail metrics when geometry metadata is absent', () => {
    const frame = { height: 40, left: -100, top: -20, width: 200 };

    expect(getRoundedCalloutPath('panel', frame)).toContain('A 5.333 5.333');
    expect(getRoundedCalloutPath('bubble', frame)).toContain('L 0 20');
    expect(getRoundedCalloutPath('arrow-bubble', frame)).toContain('L -1 19');
    expect(mocks.getTextCalloutTailMetricsMock).toHaveBeenCalledWith(frame, 'arrow-bubble');
  });
});

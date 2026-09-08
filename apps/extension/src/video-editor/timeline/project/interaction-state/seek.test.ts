// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { resolveClampedTimelineSeekTime } from './seek';

describe('project timeline seek bounds', () => {
  it('clamps timeline padding seeks to the project duration', () => {
    const timeline = document.createElement('div');
    vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({
      bottom: 30,
      height: 30,
      left: 100,
      right: 700,
      top: 0,
      width: 600,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });
    timeline.scrollLeft = 60;

    expect(resolveClampedTimelineSeekTime(timeline, 40, 60, 10)).toBe(0);
    expect(resolveClampedTimelineSeekTime(timeline, 400, 60, 10)).toBe(6);
    expect(resolveClampedTimelineSeekTime(timeline, 900, 60, 10)).toBe(10);
  });
});

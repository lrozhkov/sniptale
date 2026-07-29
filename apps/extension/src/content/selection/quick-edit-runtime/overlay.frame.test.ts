// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { applyQuickEditFrameRect } from './overlay.frame';

describe('quick-edit canonical frame projection', () => {
  it('keeps the existing outer visual box with an inward stroke', () => {
    const target = document.createElement('div');
    const frame = document.createElement('div');
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 60.75,
        height: 40.5,
        left: 10.25,
        right: 40.75,
        top: 20.25,
        width: 30.5,
        x: 10.25,
        y: 20.25,
      }),
    });

    applyQuickEditFrameRect(frame, target);

    expect(frame.style.left).toBe('4.25px');
    expect(frame.style.top).toBe('14.25px');
    expect(frame.style.width).toBe('42.5px');
    expect(frame.style.height).toBe('52.5px');
  });
});

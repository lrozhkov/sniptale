// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { applyQuickEditFrameRect } from './overlay.frame';

describe('quick-edit canonical frame projection', () => {
  it('projects the padded content box so its stroke stays entirely outside', () => {
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
    expect(frame.style.width).toBe('36.5px');
    expect(frame.style.height).toBe('46.5px');
  });
});

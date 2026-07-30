// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { hideDesignReviewFrame, removeDesignReviewFrame, showDesignReviewFrame } from './frame';

function createTarget(): HTMLElement {
  const target = document.createElement('img');
  document.body.append(target);
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: 72,
      height: 64,
      left: 12,
      right: 76,
      toJSON: () => ({}),
      top: 8,
      width: 64,
      x: 12,
      y: 8,
    }),
  });

  return target;
}

afterEach(() => {
  removeDesignReviewFrame();
  document.body.replaceChildren();
});

describe('design review frame', () => {
  it('shows, reuses, and hides the exact black selection frame', () => {
    const target = createTarget();

    showDesignReviewFrame(target);
    const firstFrame = document.querySelector<HTMLElement>('.sniptale-design-review-frame');
    showDesignReviewFrame(target);

    expect(document.querySelectorAll('.sniptale-design-review-frame')).toHaveLength(1);
    expect(firstFrame?.style.display).toBe('block');
    expect(firstFrame?.style.border).toBe('2px solid rgb(0, 0, 0)');
    expect(firstFrame?.style.boxSizing).toBe('border-box');
    expect(firstFrame?.style.left).toBe('12px');
    expect(firstFrame?.style.top).toBe('8px');
    expect(firstFrame?.style.width).toBe('64px');
    expect(firstFrame?.style.height).toBe('64px');

    hideDesignReviewFrame();
    expect(firstFrame?.style.display).toBe('none');

    document.body.replaceChildren();
    document.body.append(target);
    showDesignReviewFrame(target);

    expect(document.querySelector('.sniptale-design-review-frame')).not.toBe(firstFrame);
  });
});

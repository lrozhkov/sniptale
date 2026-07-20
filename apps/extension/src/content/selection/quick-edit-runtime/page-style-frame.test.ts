// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { hideQuickEditPageStyleFrame, showQuickEditPageStyleFrame } from './page-style-frame';

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
  document.body.replaceChildren();
});

describe('quick-edit page-style frame', () => {
  it('shows, reuses, hides, and recreates the blue selection frame', () => {
    const target = createTarget();

    showQuickEditPageStyleFrame(target);
    const firstFrame = document.querySelector<HTMLElement>('.sniptale-quick-edit-page-style-frame');
    showQuickEditPageStyleFrame(target);

    expect(document.querySelectorAll('.sniptale-quick-edit-page-style-frame')).toHaveLength(1);
    expect(firstFrame?.style.display).toBe('block');
    expect(firstFrame?.style.border).toContain('var(--sniptale-color-info)');

    hideQuickEditPageStyleFrame();
    expect(firstFrame?.style.display).toBe('none');

    document.body.replaceChildren();
    document.body.append(target);
    showQuickEditPageStyleFrame(target);

    expect(document.querySelector('.sniptale-quick-edit-page-style-frame')).not.toBe(firstFrame);
  });
});

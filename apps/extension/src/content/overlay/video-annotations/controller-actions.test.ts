// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoAnnotationsController } from '.';

function createOverlayElement(): SVGSVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
}

describe('video annotations controller actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('ignores repeated enable and disable calls', () => {
    const addOverlayNode = vi.fn();
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const controller = createVideoAnnotationsController({
      addListener,
      addOverlayNode,
      createOverlay: createOverlayElement,
      removeListener,
    });

    controller.enable({ autoFadeDelay: 1 } as never);
    controller.enable({ autoFadeDelay: 2 } as never);
    controller.disable();
    controller.disable();

    expect(addOverlayNode).toHaveBeenCalledTimes(1);
    expect(addListener).toHaveBeenCalledTimes(3);
    expect(removeListener).toHaveBeenCalledTimes(3);
    expect(controller.isEnabled()).toBe(false);
  });

  it('clears detached overlays when disabling an enabled controller', () => {
    const controller = createVideoAnnotationsController({
      addOverlayNode: vi.fn(),
      createOverlay: createOverlayElement,
      removeListener: vi.fn(),
    });

    controller.enable({ autoFadeDelay: 1 } as never);
    controller.disable();

    expect(controller.isEnabled()).toBe(false);
    expect(document.querySelector('svg')).toBeNull();
  });
});

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoAnnotationsController } from '.';

function appendOverlay<T extends Node>(node: T): T {
  document.body.appendChild(node);
  return node;
}

function createOverlayElement(): SVGSVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
}

function createVideoAnnotationsTestController(
  overrides: Partial<Parameters<typeof createVideoAnnotationsController>[0]> = {}
) {
  return createVideoAnnotationsController({
    addOverlayNode: appendOverlay,
    createOverlay: createOverlayElement,
    ...overrides,
  });
}

function dispatchAnnotationGesture() {
  document.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 20, shiftKey: true })
  );
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 40 }));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('createVideoAnnotationsController lifecycle', () => {
  it('enables and disables the overlay with explicit listener ownership', () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const controller = createVideoAnnotationsTestController();

    controller.enable({ autoFadeDelay: 2 } as never);

    expect(controller.isEnabled()).toBe(true);
    expect(document.querySelector('svg')).not.toBeNull();
    expect(addListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(addListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(addListener).toHaveBeenCalledWith('mouseup', expect.any(Function));

    controller.disable();

    expect(controller.isEnabled()).toBe(false);
    expect(document.querySelector('svg')).toBeNull();
    expect(removeListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });
});

describe('createVideoAnnotationsController drawing', () => {
  it('draws an annotation and applies auto-fade on mouseup', () => {
    const applyAutoFade = vi.fn();
    const createAnnotationElement = vi.fn(() =>
      document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    );
    const updateAnnotationElement = vi.fn((currentElement: SVGElement) => currentElement);
    const controller = createVideoAnnotationsTestController({
      applyAutoFade,
      createAnnotationElement,
      updateAnnotationElement,
    });

    controller.enable({ autoFadeDelay: 3 } as never);
    dispatchAnnotationGesture();

    expect(createAnnotationElement).toHaveBeenCalledWith(
      { hasShift: true, hasAlt: false, hasCtrl: false },
      { x: 10, y: 20 },
      expect.objectContaining({
        pathState: expect.objectContaining({
          getPoints: expect.any(Function),
          setPoints: expect.any(Function),
        }),
      })
    );
    expect(updateAnnotationElement).toHaveBeenCalledTimes(1);
    expect(applyAutoFade).toHaveBeenCalledTimes(1);
  });
});

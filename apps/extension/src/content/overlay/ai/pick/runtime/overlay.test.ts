// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { createAiPickOverlayController } from './overlay';

const overlayController = createAiPickOverlayController();

function createTargetWithRect(rect: DOMRectInit): HTMLElement {
  const element = document.createElement('div');
  document.body.appendChild(element);

  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.x ?? 0,
      y: rect.y ?? 0,
      left: rect.x ?? 0,
      top: rect.y ?? 0,
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      right: (rect.x ?? 0) + (rect.width ?? 0),
      bottom: (rect.y ?? 0) + (rect.height ?? 0),
      toJSON: () => null,
    }),
  });

  return element;
}

afterEach(() => {
  overlayController.removeOverlayContainer();
  document.body.replaceChildren();
});

describe('ai-pick hover overlay', () => {
  it('matches the hovered element bounds without extra top-left offset', () => {
    const target = createTargetWithRect({ x: 84, y: 36, width: 220, height: 110 });

    overlayController.showHoverOverlay(target);

    const hover = document.querySelector<HTMLElement>('.sniptale-ai-pick-hover');
    expect(hover).not.toBeNull();
    expect(hover?.style.left).toBe('84px');
    expect(hover?.style.top).toBe('36px');
    expect(hover?.style.width).toBe('220px');
    expect(hover?.style.height).toBe('110px');
    expect(hover?.style.boxSizing).toBe('border-box');
    expect(hover?.style.display).toBe('block');
  });

  it('keeps the overlay mounted but hidden after leave', () => {
    const target = createTargetWithRect({ x: 10, y: 12, width: 40, height: 50 });

    overlayController.showHoverOverlay(target);
    overlayController.hideHoverOverlay();

    const hover = document.querySelector<HTMLElement>('.sniptale-ai-pick-hover');
    expect(hover?.style.display).toBe('none');
  });
});

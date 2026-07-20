// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnnotationPath } from './svg';
import {
  applyVideoAnnotationAutoFade,
  createAnnotationElement,
  updateAnnotationElement,
  type VideoAnnotationPathState,
} from './runtime';

function createPathState(): VideoAnnotationPathState {
  const points = new WeakMap<SVGPathElement, Array<{ x: number; y: number }>>();

  return {
    getPoints: (element) => points.get(element),
    setPoints: (element, nextPoints) => {
      points.set(element, nextPoints);
    },
  };
}

function resetRuntimeEnvironment(): void {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
}

beforeEach(() => {
  resetRuntimeEnvironment();
});

describe('video annotations runtime freehand drawing', () => {
  it('stores freehand path points inside the explicit path-state owner', () => {
    const pathState = createPathState();
    const svgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const currentElement = createAnnotationElement(
      { hasAlt: false, hasCtrl: true, hasShift: false },
      { x: 10, y: 20 },
      { pathState }
    );

    expect(currentElement).not.toBeNull();
    svgContainer.appendChild(currentElement!);

    const nextElement = updateAnnotationElement(
      currentElement!,
      svgContainer,
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { pathState }
    );

    expect(nextElement.tagName).toBe('path');
    expect(pathState.getPoints(nextElement as SVGPathElement)).toEqual([
      { x: 10, y: 20 },
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });
});

describe('video annotations runtime shape creation', () => {
  it('creates rectangle, arrow, and null annotations for non-freehand modifiers', () => {
    const start = { x: 10, y: 20 };

    const rectangle = createAnnotationElement(
      { hasAlt: false, hasCtrl: false, hasShift: true },
      start
    );
    const arrow = createAnnotationElement({ hasAlt: true, hasCtrl: false, hasShift: false }, start);
    const none = createAnnotationElement({ hasAlt: false, hasCtrl: false, hasShift: false }, start);

    expect(rectangle?.tagName).toBe('rect');
    expect(arrow?.tagName).toBe('line');
    expect(none).toBeNull();
  });
});

describe('video annotations runtime shape updates', () => {
  it('updates rectangle and arrow elements in place', () => {
    const svgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const rectangle = createAnnotationElement(
      { hasAlt: false, hasCtrl: false, hasShift: true },
      { x: 40, y: 30 }
    );
    const arrow = createAnnotationElement(
      { hasAlt: true, hasCtrl: false, hasShift: false },
      { x: 10, y: 20 }
    );

    const nextRectangle = updateAnnotationElement(
      rectangle!,
      svgContainer,
      { x: 40, y: 30 },
      { x: 10, y: 60 }
    );
    const nextArrow = updateAnnotationElement(
      arrow!,
      svgContainer,
      { x: 10, y: 20 },
      { x: 30, y: 40 }
    );

    expect(nextRectangle).toBe(rectangle);
    expect(rectangle?.getAttribute('x')).toBe('10');
    expect(rectangle?.getAttribute('height')).toBe('30');
    expect(nextArrow).toBe(arrow);
    expect(arrow?.getAttribute('x2')).toBe('30');
    expect(arrow?.getAttribute('y2')).toBe('40');
  });
});

describe('video annotations runtime fade', () => {
  it('uses injected timers for delayed auto-fade cleanup', () => {
    vi.useFakeTimers();
    const element = createAnnotationPath([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);
    document.body.appendChild(element);

    applyVideoAnnotationAutoFade(element, { autoFadeDelay: 2 } as never, {
      scheduleTimeout: globalThis.setTimeout.bind(globalThis),
    });

    expect(element.style.transition).toBe('opacity 1000ms ease-out');
    vi.advanceTimersByTime(2000);
    expect(element.style.opacity).toBe('0');

    vi.advanceTimersByTime(1000);
    expect(document.body.contains(element)).toBe(false);
  });

  it('returns early without settings and tolerates detached fade cleanup', () => {
    vi.useFakeTimers();
    const attachedElement = createAnnotationPath([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);
    const detachedElement = createAnnotationPath([
      { x: 15, y: 15 },
      { x: 25, y: 25 },
    ]);
    const scheduleTimeout = globalThis.setTimeout.bind(globalThis);

    applyVideoAnnotationAutoFade(attachedElement, null, { scheduleTimeout });
    expect(attachedElement.style.transition).toBe('');

    applyVideoAnnotationAutoFade(detachedElement, { autoFadeDelay: 1 } as never, {
      scheduleTimeout,
    });
    vi.advanceTimersByTime(2000);

    expect(detachedElement.style.opacity).toBe('0');
  });
});

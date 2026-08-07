// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  containFloatingSurfaceWheel,
  getComposedEventTargetElement,
  isComposedEventWithinAnyElement,
  isComposedEventWithinElement,
} from './index';

function defineScrollableElement(
  element: HTMLElement,
  dimensions: { clientHeight: number; scrollHeight: number; scrollTop: number }
) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: dimensions.clientHeight },
    scrollHeight: { configurable: true, value: dimensions.scrollHeight },
    scrollTop: { configurable: true, value: dimensions.scrollTop, writable: true },
  });
  element.style.overflowY = 'auto';
}

function dispatchWheel(
  target: EventTarget,
  deltaY: number,
  options: { deltaMode?: number; deltaX?: number } = {}
) {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY,
    ...(options.deltaMode === undefined ? {} : { deltaMode: options.deltaMode }),
    ...(options.deltaX === undefined ? {} : { deltaX: options.deltaX }),
  });
  target.dispatchEvent(event);
  return event;
}

describe('shared ui dom-events', () => {
  it('uses composed path targets before falling back to the raw event target', () => {
    const pathTarget = document.createElement('button');
    const fallbackTarget = document.createElement('span');
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: fallbackTarget,
    });
    event.composedPath = () => [pathTarget, document.body, window];

    expect(getComposedEventTargetElement(event)).toBe(pathTarget);
  });

  it('detects direct and descendant ownership through the composed path', () => {
    const owner = document.createElement('section');
    const descendant = document.createElement('button');
    owner.appendChild(descendant);
    const event = new MouseEvent('pointerdown');
    event.composedPath = () => [descendant, owner, document.body, window];

    expect(isComposedEventWithinElement(event, owner)).toBe(true);
  });

  it('checks multiple candidate owners and ignores null entries', () => {
    const owner = document.createElement('section');
    const other = document.createElement('aside');
    const target = document.createElement('button');
    owner.appendChild(target);
    const event = new MouseEvent('mousedown');
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: target,
    });

    expect(isComposedEventWithinAnyElement(event, [null, other, owner])).toBe(true);
  });
});

describe('floating surface wheel containment', () => {
  it('prevents a non-scrollable floating surface from scrolling its host page', () => {
    const surface = document.createElement('div');
    const child = document.createElement('button');
    surface.append(child);
    surface.addEventListener('wheel', containFloatingSurfaceWheel);

    const event = dispatchWheel(child, 80);

    expect(event.defaultPrevented).toBe(true);
  });

  it('scrolls the nearest internal container without relying on page scroll chaining', () => {
    const surface = document.createElement('div');
    const scrollable = document.createElement('div');
    const child = document.createElement('button');
    defineScrollableElement(scrollable, { clientHeight: 100, scrollHeight: 300, scrollTop: 40 });
    scrollable.append(child);
    surface.append(scrollable);
    surface.addEventListener('wheel', containFloatingSurfaceWheel);

    const event = dispatchWheel(child, 60);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollable.scrollTop).toBe(100);
  });

  it('absorbs wheel input at an internal scroll boundary', () => {
    const surface = document.createElement('div');
    const scrollable = document.createElement('div');
    defineScrollableElement(scrollable, { clientHeight: 100, scrollHeight: 300, scrollTop: 200 });
    surface.append(scrollable);
    surface.addEventListener('wheel', containFloatingSurfaceWheel);

    const event = dispatchWheel(scrollable, 60);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollable.scrollTop).toBe(200);
  });

  it('does not leak wheel input to an ancestor interaction owner', () => {
    const host = document.createElement('div');
    const surface = document.createElement('div');
    host.appendChild(surface);
    document.body.appendChild(host);
    const hostWheel = vi.fn();
    host.addEventListener('wheel', hostWheel);
    surface.addEventListener('wheel', containFloatingSurfaceWheel);

    surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 }));

    expect(hostWheel).not.toHaveBeenCalled();
  });

  it('does not scroll an outer floating surface after a nested menu owns the wheel event', () => {
    const outerSurface = document.createElement('div');
    const innerMenu = document.createElement('div');
    defineScrollableElement(outerSurface, { clientHeight: 100, scrollHeight: 300, scrollTop: 40 });
    outerSurface.append(innerMenu);
    innerMenu.addEventListener('wheel', containFloatingSurfaceWheel);
    outerSurface.addEventListener('wheel', containFloatingSurfaceWheel);

    const event = dispatchWheel(innerMenu, 60);

    expect(event.defaultPrevented).toBe(true);
    expect(outerSurface.scrollTop).toBe(40);
  });

  it('supports upward, horizontal, line, and page wheel distances', () => {
    const surface = document.createElement('div');
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 100 },
      clientWidth: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 300 },
      scrollLeft: { configurable: true, value: 40, writable: true },
      scrollTop: { configurable: true, value: 100, writable: true },
    });
    surface.style.overflowX = 'auto';
    surface.style.overflowY = 'auto';
    surface.addEventListener('wheel', containFloatingSurfaceWheel);

    dispatchWheel(surface, -2, { deltaMode: WheelEvent.DOM_DELTA_LINE, deltaX: 3 });
    expect(surface.scrollTop).toBe(68);
    expect(surface.scrollLeft).toBe(88);

    dispatchWheel(surface, 1, { deltaMode: WheelEvent.DOM_DELTA_PAGE });
    expect(surface.scrollTop).toBe(168);

    dispatchWheel(surface, 0, { deltaMode: WheelEvent.DOM_DELTA_PAGE, deltaX: 1 });
    expect(surface.scrollLeft).toBe(188);
  });

  it('falls back from a text target and ignores invalid or already-owned events', () => {
    const surface = document.createElement('div');
    const textTarget = document.createTextNode('Menu');
    surface.append(textTarget);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const event = {
      currentTarget: surface,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaX: 0,
      deltaY: 80,
      preventDefault,
      stopPropagation,
      target: textTarget,
      composedPath: () => [],
    };

    containFloatingSurfaceWheel(event);
    containFloatingSurfaceWheel(event);
    containFloatingSurfaceWheel({
      ...event,
      __sniptaleFloatingWheelContained: false,
      currentTarget: null,
    });

    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(stopPropagation).toHaveBeenCalledTimes(2);
  });
});

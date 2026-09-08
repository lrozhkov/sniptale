// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

const targetResolver = vi.hoisted(() => ({ resolveShieldedPageElement: vi.fn() }));

vi.mock('../page-element-target', () => targetResolver);

import { handleOverlayWheel } from './overlay';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function defineScrollBox(
  element: HTMLElement,
  values: { clientHeight: number; scrollHeight: number; scrollTop: number }
): void {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: values.clientHeight },
    scrollHeight: { configurable: true, value: values.scrollHeight },
    scrollTop: { configurable: true, value: values.scrollTop, writable: true },
  });
}

it('routes shield wheel input to the nearest scrollable page ancestor', () => {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  defineScrollBox(scroller, { clientHeight: 400, scrollHeight: 1_600, scrollTop: 120 });
  const target = document.createElement('div');
  scroller.append(target);
  document.body.append(scroller);
  const scrollBy = vi.fn();
  Object.defineProperty(scroller, 'scrollBy', { configurable: true, value: scrollBy });
  targetResolver.resolveShieldedPageElement.mockReturnValue(target);
  const event = new WheelEvent('wheel', { cancelable: true, deltaX: 4, deltaY: 80 });

  handleOverlayWheel(event);

  expect(event.defaultPrevented).toBe(true);
  expect(scrollBy).toHaveBeenCalledWith({ behavior: 'auto', left: 4, top: 80 });
});

it('walks through an open shadow host to route horizontal wheel input', () => {
  const scroller = document.createElement('div');
  scroller.style.overflowX = 'scroll';
  Object.defineProperties(scroller, {
    clientWidth: { configurable: true, value: 300 },
    scrollLeft: { configurable: true, value: 90, writable: true },
    scrollWidth: { configurable: true, value: 900 },
  });
  const host = document.createElement('div');
  const target = document.createElement('span');
  host.attachShadow({ mode: 'open' }).append(target);
  scroller.append(host);
  document.body.append(scroller);
  const scrollBy = vi.fn();
  Object.defineProperty(scroller, 'scrollBy', { configurable: true, value: scrollBy });
  targetResolver.resolveShieldedPageElement.mockReturnValue(target);

  handleOverlayWheel(new WheelEvent('wheel', { cancelable: true, deltaX: -40 }));

  expect(scrollBy).toHaveBeenCalledWith({ behavior: 'auto', left: -40, top: 0 });
});

it('falls back to the target window when every page ancestor is at its scroll boundary', () => {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  defineScrollBox(scroller, { clientHeight: 400, scrollHeight: 1_600, scrollTop: 1_200 });
  const target = document.createElement('div');
  scroller.append(target);
  document.body.append(scroller);
  targetResolver.resolveShieldedPageElement.mockReturnValue(target);
  const scrollBy = vi.fn();
  vi.stubGlobal('scrollBy', scrollBy);

  handleOverlayWheel(new WheelEvent('wheel', { cancelable: true, deltaY: 80 }));

  expect(scrollBy).toHaveBeenCalledWith({ behavior: 'auto', left: 0, top: 80 });
});

it('falls back to the current window when the shield has no page target', () => {
  targetResolver.resolveShieldedPageElement.mockReturnValue(null);
  const scrollBy = vi.fn();
  vi.stubGlobal('scrollBy', scrollBy);

  handleOverlayWheel(new WheelEvent('wheel', { cancelable: true, deltaX: 12, deltaY: -24 }));

  expect(scrollBy).toHaveBeenCalledWith({ behavior: 'auto', left: 12, top: -24 });
});

it('chains wheel fallback from a bounded iframe window to the scrollable top window', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const target = iframe.contentDocument!.createElement('div');
  iframe.contentDocument!.body.append(target);
  targetResolver.resolveShieldedPageElement.mockReturnValue(target);
  const innerWindow = iframe.contentWindow!;
  const innerScrollBy = vi.fn();
  const topScrollBy = vi.fn();
  Object.defineProperty(innerWindow, 'scrollBy', { configurable: true, value: innerScrollBy });
  Object.defineProperty(innerWindow.parent, 'scrollBy', {
    configurable: true,
    value: topScrollBy,
  });
  Object.defineProperties(innerWindow, {
    innerHeight: { configurable: true, value: 400 },
    scrollY: { configurable: true, value: 800 },
  });
  Object.defineProperties(innerWindow.document.documentElement, {
    scrollHeight: { configurable: true, value: 1_200 },
  });
  Object.defineProperties(window, {
    innerHeight: { configurable: true, value: 600 },
    scrollY: { configurable: true, value: 100 },
  });
  Object.defineProperties(document.documentElement, {
    scrollHeight: { configurable: true, value: 2_000 },
  });

  handleOverlayWheel(new WheelEvent('wheel', { cancelable: true, deltaY: 80 }));

  expect(innerScrollBy).not.toHaveBeenCalled();
  expect(topScrollBy).toHaveBeenCalledWith({ behavior: 'auto', left: 0, top: 80 });
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { DrawingSurface } from './surface';

vi.mock('../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/dom-host')>()),
  toggleContentHostClass: vi.fn(),
}));

function createCanvasContextFixture(): CanvasRenderingContext2D {
  const context: Partial<CanvasRenderingContext2D> = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
  };
  return context as CanvasRenderingContext2D;
}

const context = createCanvasContextFixture();

let host: HTMLDivElement;
let root: Root;

function createController(
  getScrollRoot: ContentDrawingController['getScrollRoot']
): ContentDrawingController {
  return {
    session: createDrawingSession({ onDocumentCommit: () => true }),
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot,
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 800 },
    innerHeight: { configurable: true, value: 600 },
    devicePixelRatio: { configurable: true, value: 2 },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('updates CSS viewport size when page zoom keeps the canvas backing store unchanged', () => {
  const visualViewport = new EventTarget();
  vi.stubGlobal('visualViewport', visualViewport);
  const controller = createController(() => ({ kind: 'viewport', element: null }));
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;
  expect(canvas.width).toBe(1600);
  expect(canvas.style.width).toBe('800px');

  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 400 },
    innerHeight: { configurable: true, value: 300 },
    devicePixelRatio: { configurable: true, value: 4 },
  });
  act(() => visualViewport.dispatchEvent(new Event('resize')));

  expect(canvas.width).toBe(1600);
  expect(canvas.height).toBe(1200);
  expect(canvas.style.width).toBe('400px');
  expect(canvas.style.height).toBe('300px');
  expect(context.setTransform).toHaveBeenLastCalledWith(4, 0, 0, 4, 0, 0);
});

it('leaves browser zoom wheel gestures to the browser for an internal scroll root', () => {
  const element = document.createElement('div');
  const scrollBy = vi.fn();
  element.scrollBy = scrollBy;
  const controller = createController(() => ({ kind: 'element', element }));
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;

  const zoomWheel = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -100,
  });
  act(() => canvas.dispatchEvent(zoomWheel));
  expect(zoomWheel.defaultPrevented).toBe(false);
  expect(scrollBy).not.toHaveBeenCalled();

  const scrollWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40 });
  act(() => canvas.dispatchEvent(scrollWheel));
  expect(scrollBy).toHaveBeenCalledWith({ behavior: 'instant', left: 0, top: 40 });
});

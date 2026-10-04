// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { DrawingSurface } from './surface';

vi.mock('../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/dom-host')>()),
  toggleContentHostClass: vi.fn(),
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function touchEvent(type: string, pointerId: number, clientY: number): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: 100,
    clientY,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
  });
  return event;
}

function mousePointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'mouse' },
  });
  return event;
}

it('draws an arrow from its tip using the direction captured at pointer down', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const defaults = session.getSnapshot().defaults;
  session.setDefaults({ ...defaults, arrow: { ...defaults.arrow, drawFromTip: true } });
  session.setActiveTool('arrow');
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => ['#ef4444'],
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;

  act(() => canvas.dispatchEvent(mousePointerEvent('pointerdown', 10, 20)));
  session.setDefaults({ ...defaults, arrow: { ...defaults.arrow, drawFromTip: false } });
  act(() => canvas.dispatchEvent(mousePointerEvent('pointermove', 100, 80)));
  act(() => canvas.dispatchEvent(mousePointerEvent('pointerup', 100, 80)));

  expect(session.getSnapshot().document.objects[0]).toMatchObject({
    kind: 'arrow',
    start: { x: 100, y: 80 },
    end: { x: 10, y: 20 },
  });
  act(() => root.unmount());
});

it('tracks two-finger scrolling in client coordinates while the scroll root moves', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  const element = document.createElement('div');
  const deltas: number[] = [];
  Object.defineProperty(element, 'scrollBy', {
    configurable: true,
    value: (optionsOrX?: ScrollToOptions | number, y?: number) => {
      const delta = typeof optionsOrX === 'number' ? (y ?? 0) : (optionsOrX?.top ?? 0);
      deltas.push(delta);
      element.scrollTop += delta;
    },
  });
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => ['#ef4444'],
    getScrollRoot: () => ({ kind: 'element', element }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;

  act(() => canvas.dispatchEvent(touchEvent('pointerdown', 1, 100)));
  act(() => canvas.dispatchEvent(touchEvent('pointerdown', 2, 200)));
  act(() => canvas.dispatchEvent(touchEvent('pointermove', 1, 110)));
  act(() => canvas.dispatchEvent(touchEvent('pointermove', 1, 110)));

  expect(deltas).toEqual([-5, 0]);
  expect(element.scrollTop).toBe(-5);
  act(() => root.unmount());
});

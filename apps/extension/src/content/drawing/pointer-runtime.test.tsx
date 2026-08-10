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

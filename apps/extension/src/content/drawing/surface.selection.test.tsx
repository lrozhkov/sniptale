// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { DrawingSurface } from './surface';

function createCanvasContextFixture(): CanvasRenderingContext2D {
  const fixture: Partial<CanvasRenderingContext2D> = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
  };
  return fixture as CanvasRenderingContext2D;
}

const context = createCanvasContextFixture();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperties(window, {
    devicePixelRatio: { configurable: true, value: 1 },
    innerHeight: { configurable: true, value: 600 },
    innerWidth: { configurable: true, value: 800 },
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function pointer(type: string, x: number, y: number, shiftKey = false) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
    shiftKey,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'mouse' },
  });
  return event;
}

it('selects objects through a dragged area and extends the selection with Shift', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    bounds: { x: 20, y: 20, width: 30, height: 30 },
    id: 'first',
    kind: 'blur',
  });
  session.commitObject({
    bounds: { x: 100, y: 20, width: 30, height: 30 },
    id: 'second',
    kind: 'blur',
  });
  session.setActiveTool('select');
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;

  act(() => {
    canvas.dispatchEvent(pointer('pointerdown', 0, 0));
    canvas.dispatchEvent(pointer('pointermove', 60, 60));
  });
  expect(session.getSnapshot().selectedObjectIds).toEqual(['first']);
  expect(context.fillRect).toHaveBeenCalled();
  act(() => canvas.dispatchEvent(pointer('pointerup', 60, 60)));

  act(() => {
    canvas.dispatchEvent(pointer('pointerdown', 110, 30, true));
    canvas.dispatchEvent(pointer('pointerup', 110, 30, true));
  });
  expect(session.getSnapshot().selectedObjectIds).toEqual(['first', 'second']);
  act(() => root.unmount());
});

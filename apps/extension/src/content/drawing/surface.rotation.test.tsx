// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { createDrawingSession, getDrawingObjectRotation } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { getDrawingRotationHandlePoint } from './interaction';
import { DrawingSurface } from './surface';
import { renderDrawingObject } from './render';

function createCanvasContextFixture(): CanvasRenderingContext2D {
  const fixture: Partial<CanvasRenderingContext2D> = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 }) as TextMetrics),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    roundRect: vi.fn(),
    scale: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    transform: vi.fn(),
    translate: vi.fn(),
  };
  return fixture as CanvasRenderingContext2D;
}

const context = createCanvasContextFixture();

beforeEach(() => {
  vi.clearAllMocks();
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
    innerWidth: { configurable: true, value: 800 },
    innerHeight: { configurable: true, value: 600 },
    devicePixelRatio: { configurable: true, value: 2 },
  });
});

it('keeps canvas text backgrounds joined in local coordinates after rotation', () => {
  renderDrawingObject(
    context,
    {
      backgroundColor: '#fef08a',
      bounds: { x: 100, y: 100, width: 180, height: 60 },
      color: '#111827',
      fontSize: 20,
      id: 'canvas-text',
      kind: 'text',
      rotation: 45,
      text: 'Longer\nTiny',
    },
    { x: 0, y: 0 }
  );
  expect(context.rotate).toHaveBeenCalledWith(Math.PI / 4);
  expect(context.roundRect).toHaveBeenNthCalledWith(1, 100, 102, 72, 25, [3, 3, 3, 0]);
  expect(context.roundRect).toHaveBeenNthCalledWith(2, 100, 127, 52, 25, [0, 0, 3, 3]);
});

it('shows the standard rotation control without skewing handles and commits live rotation', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const rectangle = {
    bounds: { x: 20, y: 30, width: 100, height: 80 },
    color: '#ef4444',
    id: 'selected-rectangle',
    kind: 'rectangle' as const,
    skewX: 15,
    width: 4,
  };
  session.commitObject(rectangle);
  session.setActiveTool('select');
  session.select(rectangle.id);
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
  expect(context.transform).not.toHaveBeenCalled();
  expect(context.scale).toHaveBeenCalledWith(0.65, 0.65);
  const canvas = host.querySelector('canvas')!;
  const handle = getDrawingRotationHandlePoint(rectangle, 'rotate-ne');
  if (!handle) throw new Error('Expected rotation handle');
  const pointerEvent = (type: string, point: { x: number; y: number }, shiftKey = false) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX: point.x,
      clientY: point.y,
      shiftKey,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    return event;
  };

  act(() => canvas.dispatchEvent(pointerEvent('pointermove', handle)));
  expect(canvas.style.cursor).toBe('grab');
  act(() => canvas.dispatchEvent(pointerEvent('pointerdown', handle)));
  const center = { x: 70, y: 70 };
  const radians = Math.PI / 6;
  const delta = { x: handle.x - center.x, y: handle.y - center.y };
  const rotated = {
    x: center.x + delta.x * Math.cos(radians) - delta.y * Math.sin(radians),
    y: center.y + delta.x * Math.sin(radians) + delta.y * Math.cos(radians),
  };
  act(() => canvas.dispatchEvent(pointerEvent('pointermove', rotated, true)));
  act(() => canvas.dispatchEvent(pointerEvent('pointerup', rotated, true)));

  expect(session.getSnapshot().document.objects[0]).toMatchObject({ rotation: 30 });
  act(() => root.unmount());
});

it('consumes the rotation release click with Text selected and accepts the next text click', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const text = {
    backgroundColor: '#fef08a',
    bounds: { x: 100, y: 100, width: 180, height: 60 },
    color: '#111827',
    fontSize: 20,
    id: 'rotated-text',
    kind: 'text' as const,
    text: 'First line\nSecond',
  };
  session.commitObject(text);
  session.setActiveTool('text');
  session.select(text.id);
  const controller: ContentDrawingController = {
    session,
    getPalette: () => [],
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
  const handle = getDrawingRotationHandlePoint(text, 'rotate-ne')!;
  const release = { x: handle.x + 30, y: handle.y + 90 };
  const dispatch = (type: string, point: { x: number; y: number }) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX: point.x,
      clientY: point.y,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    act(() => canvas.dispatchEvent(event));
  };
  dispatch('pointerdown', handle);
  dispatch('pointermove', release);
  dispatch('pointerup', release);
  dispatch('click', release);
  expect(host.querySelector('[data-ui="content.drawing.text-input"]')).toBeNull();
  expect(session.getSnapshot().document.objects).toHaveLength(1);
  expect(getDrawingObjectRotation(session.getSnapshot().document.objects[0]!)).not.toBe(0);
  dispatch('pointerdown', { x: 500, y: 400 });
  dispatch('pointerup', { x: 500, y: 400 });
  dispatch('click', { x: 500, y: 400 });
  expect(host.querySelector('[data-ui="content.drawing.text-input"]')).not.toBeNull();
  act(() => root.unmount());
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { DrawingSurface, getDrawingViewportProjection, toDrawingScenePoint } from './surface';

function createCanvasContextFixture(): CanvasRenderingContext2D {
  const context: Partial<CanvasRenderingContext2D> = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 }) as TextMetrics),
    moveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
  };
  return context as CanvasRenderingContext2D;
}

const context = createCanvasContextFixture();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'object-id') });
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('projects viewport and internal-scroll coordinates into one scene space', () => {
  const element = document.createElement('div');
  element.scrollLeft = 20;
  element.scrollTop = 30;
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: 50,
    left: 100,
    top: 50,
    right: 500,
    bottom: 350,
    width: 400,
    height: 300,
    toJSON: () => ({}),
  });
  const root = { kind: 'element' as const, element };
  expect(getDrawingViewportProjection(root)).toEqual({ x: -80, y: -20 });
  expect(toDrawingScenePoint({ clientX: 120, clientY: 80 }, root)).toEqual({ x: 40, y: 60 });
});

it('commits a speed-sampled pencil object and becomes click-through outside Drawing mode', () => {
  const session = createDrawingSession();
  let finalizer: (() => void) | null = null;
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: (next) => {
      finalizer = next;
    },
    finalizeInteraction: () => finalizer?.(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;
  const hostPointer = vi.fn();
  const hostClick = vi.fn();
  const hostContextMenu = vi.fn();
  const hostWheel = vi.fn();
  document.addEventListener('pointerdown', hostPointer);
  document.addEventListener('click', hostClick);
  document.addEventListener('contextmenu', hostContextMenu);
  document.addEventListener('wheel', hostWheel);
  const dispatchPointer = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    canvas.dispatchEvent(event);
  };
  act(() => {
    dispatchPointer('pointerdown', 10, 10);
    dispatchPointer('pointermove', 40, 20);
    dispatchPointer('pointerup', 40, 20);
  });
  expect(session.getSnapshot().document.objects[0]).toMatchObject({
    id: 'drawing-object-id',
    kind: 'pencil',
    width: 4,
  });
  act(() => {
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 20 }));
  });
  expect(hostPointer).not.toHaveBeenCalled();
  expect(hostClick).not.toHaveBeenCalled();
  expect(hostContextMenu).not.toHaveBeenCalled();
  expect(hostWheel).toHaveBeenCalledTimes(1);

  act(() => {
    dispatchPointer('pointerdown', 50, 50);
    dispatchPointer('pointermove', 90, 70);
    controller.finalizeInteraction();
  });
  expect(session.getSnapshot().document.objects).toHaveLength(2);
  expect(context.clearRect).toHaveBeenCalled();

  act(() => {
    session.setActiveTool('text');
    dispatchPointer('pointerdown', 120, 90);
  });
  const textEditor = host.querySelector('textarea');
  expect(textEditor).not.toBeNull();
  act(() => {
    textEditor?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    textEditor?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  expect(hostClick).not.toHaveBeenCalled();
  expect(hostContextMenu).not.toHaveBeenCalled();

  act(() =>
    root.render(<DrawingSurface active={false} chromeHidden={false} controller={controller} />)
  );
  expect(
    host.querySelector<HTMLElement>('[data-ui="content.drawing.surface"]')?.style.pointerEvents
  ).toBe('none');
  expect(session.getSnapshot().document.objects).toHaveLength(2);
  act(() => root.unmount());
});

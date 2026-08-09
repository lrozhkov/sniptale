// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { DrawingSurface, getDrawingViewportProjection, toDrawingScenePoint } from './surface';

const domHostMocks = vi.hoisted(() => ({ toggleContentHostClass: vi.fn() }));

vi.mock('../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/dom-host')>()),
  toggleContentHostClass: domHostMocks.toggleContentHostClass,
}));

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
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'object-id') });
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

it('renders every unified outline shape without filling it', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const shapes = ['rectangle', 'ellipse', 'triangle', 'parallelogram'] as const;
  shapes.forEach((kind) =>
    session.commitObject({
      bounds: { x: 10, y: 20, width: 80, height: 40 },
      color: '#ef4444',
      id: kind,
      kind,
      width: 4,
    })
  );
  session.setActiveTool('shape');
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

  expect(context.stroke).toHaveBeenCalledTimes(4);
  expect(context.ellipse).toHaveBeenCalledOnce();
  expect(context.moveTo).toHaveBeenCalledTimes(3);
  expect(context.fill).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it('renders an arrow as the filled editor-style shaft and head profile', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    color: '#ef4444',
    dynamicWidth: true,
    end: { x: 200, y: 40 },
    id: 'arrow',
    kind: 'arrow',
    start: { x: 20, y: 40 },
    width: 18,
  });
  session.setActiveTool('arrow');
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

  expect(context.fill).toHaveBeenCalledOnce();
  expect(context.moveTo).toHaveBeenCalledOnce();
  expect(context.lineTo).toHaveBeenCalledTimes(6);
  expect(context.stroke).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it('shows only two endpoint handles without a dashed selection box for an arrow', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    color: '#ef4444',
    dynamicWidth: true,
    end: { x: 200, y: 40 },
    id: 'selected-arrow',
    kind: 'arrow',
    start: { x: 20, y: 40 },
    width: 18,
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

  expect(host.querySelector<HTMLCanvasElement>('canvas')?.style.cursor).toBe('default');
  expect(context.arc).toHaveBeenCalledTimes(2);
  expect(context.strokeRect).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it('isolates annotation chrome only while the Drawing surface is active', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
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
  expect(domHostMocks.toggleContentHostClass).toHaveBeenLastCalledWith(
    'sniptale-drawing-mode-active',
    true
  );

  act(() =>
    root.render(<DrawingSurface active={false} chromeHidden={false} controller={controller} />)
  );
  expect(domHostMocks.toggleContentHostClass).toHaveBeenLastCalledWith(
    'sniptale-drawing-mode-active',
    false
  );
  act(() => root.unmount());
  expect(domHostMocks.toggleContentHostClass).toHaveBeenLastCalledWith(
    'sniptale-drawing-mode-active',
    false
  );
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
  const session = createDrawingSession({ onDocumentCommit: () => true });
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
  expect(canvas.style.cursor).toBe('crosshair');
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
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 120,
        clientY: 90,
      })
    );
  });
  expect(canvas.style.cursor).toBe('text');
  const textEditor = host.querySelector('textarea');
  expect(textEditor).not.toBeNull();
  expect(document.activeElement).toBe(textEditor);
  act(() => {
    textEditor?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    textEditor?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  expect(hostClick).not.toHaveBeenCalled();
  expect(hostContextMenu).not.toHaveBeenCalled();

  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  act(() => {
    valueSetter?.call(textEditor, 'Persistent note');
    textEditor?.dispatchEvent(new Event('input', { bubbles: true }));
    root.render(<DrawingSurface active={false} chromeHidden={false} controller={controller} />);
  });
  expect(host.querySelector('textarea')).toBeNull();
  expect(session.getSnapshot().document.objects.at(-1)).toMatchObject({
    kind: 'text',
    text: 'Persistent note',
  });
  expect(context.fillText).toHaveBeenCalledWith('Persistent note', 126, 96);

  expect(
    host.querySelector<HTMLElement>('[data-ui="content.drawing.surface"]')?.style.pointerEvents
  ).toBe('none');
  expect(canvas.style.cursor).toBe('default');
  expect(session.getSnapshot().document.objects).toHaveLength(3);
  act(() => root.unmount());
});

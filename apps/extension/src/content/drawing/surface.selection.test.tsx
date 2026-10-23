// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { DrawingSurface } from './surface';
import { DrawingBlurLayer } from './surface-visual-layers';

function createCanvasContextFixture(): CanvasRenderingContext2D {
  const fixture: Partial<CanvasRenderingContext2D> = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
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

it('clips a rotated projected blur to its scroll root and retains offscreen object identity', () => {
  const host = document.createElement('div');
  const scroller = document.createElement('section');
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 400, 300));
  document.body.append(host);
  const root = createRoot(host);
  const objects = [
    {
      id: 'rotated',
      kind: 'blur' as const,
      rotation: 45,
      bounds: { x: 120, y: 220, width: 800, height: 500 },
    },
    { id: 'outside', kind: 'blur' as const, bounds: { x: 2000, y: 100, width: 100, height: 100 } },
  ];
  act(() =>
    root.render(
      <DrawingBlurLayer
        objects={objects}
        projection={{ x: 120, y: 200 }}
        root={{ kind: 'element', element: scroller }}
      />
    )
  );
  const nodes = host.querySelectorAll<HTMLElement>('[data-sniptale-drawing-object-id]');
  expect(nodes).toHaveLength(2);
  const visible = nodes[0]!;
  expect(parseFloat(visible.style.left)).toBeGreaterThanOrEqual(20);
  expect(parseFloat(visible.style.top)).toBeGreaterThanOrEqual(30);
  expect(parseFloat(visible.style.left) + parseFloat(visible.style.width)).toBeLessThanOrEqual(420);
  expect(parseFloat(visible.style.top) + parseFloat(visible.style.height)).toBeLessThanOrEqual(330);
  expect(visible.style.clipPath).toMatch(/^polygon\(/);
  expect(nodes[1]!.style.width).toBe('0px');
  expect(objects[0]!.bounds).toEqual({ x: 120, y: 220, width: 800, height: 500 });
  act(() => root.unmount());
});

it.each([
  { x: 780, y: 100, width: 100, height: 30 },
  { x: -30, y: 100, width: 100, height: 30 },
  { x: 100, y: -30, width: 100, height: 60 },
  { x: 100, y: 580, width: 100, height: 60 },
])('bounds live blur before filtering at the viewport edge %j', (bounds) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <DrawingBlurLayer
        objects={[{ id: 'edge', kind: 'blur', bounds }]}
        projection={{ x: 0, y: 0 }}
        root={{ kind: 'viewport', element: null }}
      />
    )
  );
  const node = host.querySelector<HTMLElement>('[data-sniptale-drawing-object-id]')!;
  expect(parseFloat(node.style.left)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(node.style.top)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(node.style.left) + parseFloat(node.style.width)).toBeLessThanOrEqual(800);
  expect(parseFloat(node.style.top) + parseFloat(node.style.height)).toBeLessThanOrEqual(600);
  expect(node.style.clipPath).toMatch(/^polygon\(/);
  act(() => root.unmount());
});

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

it('renders the selected blur strength and preserves legacy strength', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    id: 'strong',
    kind: 'blur',
    amount: 20,
    bounds: { x: 0, y: 0, width: 30, height: 30 },
  });
  session.commitObject({
    id: 'legacy',
    kind: 'blur',
    bounds: { x: 40, y: 0, width: 30, height: 30 },
  });
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
  const filters = [...host.querySelectorAll<HTMLElement>('div')]
    .map((element) => element.style.backdropFilter)
    .filter(Boolean);
  expect(filters).toContain('blur(20px)');
  expect(filters).toContain('blur(10px)');
  act(() => root.unmount());
});

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

it('fades selected shape controls and hides the cursor only during its pointer drag', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    bounds: { x: 20, y: 30, width: 100, height: 80 },
    color: '#ef4444',
    id: 'selected-shape',
    kind: 'rectangle',
    width: 4,
  });
  session.setActiveTool('select');
  session.select('selected-shape');
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
  const canvas = host.querySelector<HTMLCanvasElement>('.sniptale-drawing-canvas')!;
  const chrome = host.querySelector<HTMLCanvasElement>(
    '[data-ui="content.drawing.selection-chrome"]'
  );
  expect(chrome).not.toBeNull();
  expect(chrome?.style.pointerEvents).toBe('none');

  act(() => canvas.dispatchEvent(pointer('pointerdown', 20, 30)));
  expect(canvas.style.cursor).toBe('none');
  expect(chrome?.style.opacity).toBe('0');
  expect(chrome?.style.transition).toContain('150ms');
  act(() => canvas.dispatchEvent(pointer('pointermove', 60, 70)));
  expect(canvas.style.cursor).toBe('none');
  act(() => canvas.dispatchEvent(pointer('pointerup', 60, 70)));
  expect(canvas.style.cursor).not.toBe('none');
  expect(chrome?.style.opacity).toBe('1');
  expect(chrome?.style.transition).toContain('50ms');

  act(() => canvas.dispatchEvent(pointer('pointerdown', 60, 70)));
  act(() => window.dispatchEvent(new Event('blur')));
  expect(canvas.style.cursor).not.toBe('none');
  expect(chrome?.style.opacity).toBe('1');
  act(() => root.unmount());
});

it('keeps text resize controls and cursor visible during a pointer drag', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    backgroundColor: null,
    bounds: { x: 20, y: 30, width: 80, height: 40 },
    color: '#111827',
    fontSize: 20,
    id: 'selected-text',
    kind: 'text',
    text: 'Short',
  });
  session.setActiveTool('text');
  session.select('selected-text');
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
  const canvas = host.querySelector<HTMLCanvasElement>('.sniptale-drawing-canvas')!;
  const chrome = host.querySelector<HTMLCanvasElement>(
    '[data-ui="content.drawing.selection-chrome"]'
  );

  act(() => canvas.dispatchEvent(pointer('pointerdown', 100, 50)));
  expect(canvas.style.cursor).not.toBe('none');
  expect(chrome?.style.opacity).toBe('1');
  act(() => canvas.dispatchEvent(pointer('pointerup', 100, 50)));
  act(() => root.unmount());
});

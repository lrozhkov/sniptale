// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createDrawingSession,
  getDrawingObjectRotation,
  getDrawingSelectionBounds,
  getDrawingBoundsCenter,
  rotateDrawingPoint,
  type DrawingObject,
} from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { getDrawingMultiRotationHandlePoint } from './interaction';
import { DrawingSurface } from './surface';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const context: Partial<CanvasRenderingContext2D> = {
    arc: vi.fn(),
    arcTo: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
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
    measureText: vi.fn((text: string) => ({ width: text.length * 10 }) as TextMetrics),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as CanvasRenderingContext2D
  );
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('previews and commits group rotation once, cancels safely, and consumes the Text release click', () => {
  const commit = vi.fn(() => true);
  const session = createDrawingSession({ onDocumentCommit: commit });
  const objects: DrawingObject[] = [
    {
      id: 'one',
      kind: 'text',
      bounds: { x: 100, y: 140, width: 100, height: 40 },
      text: 'First',
      color: '#111',
      backgroundColor: '#f97316',
      fontSize: 20,
    },
    {
      id: 'two',
      kind: 'text',
      bounds: { x: 250, y: 140, width: 100, height: 40 },
      text: 'Second',
      color: '#111',
      backgroundColor: null,
      fontSize: 20,
    },
  ];
  objects.forEach((object) => session.commitObject(object));
  session.setActiveTool('text');
  session.setSelection(['one', 'two']);
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
  const bounds = getDrawingSelectionBounds(objects)!;
  const start = getDrawingMultiRotationHandlePoint(bounds);
  const end = rotateDrawingPoint(start, getDrawingBoundsCenter(bounds), 30);
  const dispatch = (type: string, point: { x: number; y: number }) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX: point.x,
      clientY: point.y,
      shiftKey: true,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    act(() => canvas.dispatchEvent(event));
  };
  commit.mockClear();
  dispatch('pointermove', start);
  expect(canvas.style.cursor).toBe('grab');
  dispatch('pointerdown', start);
  dispatch('pointermove', end);
  expect(session.getSnapshot().document.objects).toEqual(objects);
  expect(
    host.querySelector('[data-ui="content.drawing.text-object"]')?.getAttribute('style')
  ).toContain('rotate(30deg)');
  dispatch('pointercancel', end);
  expect(commit).not.toHaveBeenCalled();
  expect(session.getSnapshot().document.objects).toEqual(objects);
  dispatch('pointerdown', start);
  dispatch('pointermove', end);
  dispatch('pointerup', end);
  dispatch('click', end);
  expect(commit).toHaveBeenCalledOnce();
  expect(session.getSnapshot().document.objects).toHaveLength(2);
  expect(session.getSnapshot().document.objects.map(getDrawingObjectRotation)).toEqual([30, 30]);
  expect(session.getSnapshot().selectedObjectIds).toEqual(['one', 'two']);
  expect(host.querySelector('[data-ui="content.drawing.text-input"]')).toBeNull();
  act(() => root.unmount());
  host.remove();
});

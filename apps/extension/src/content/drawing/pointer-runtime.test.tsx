// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  buildDrawingFreehandArrowLines,
  createDrawingSession,
} from '../../features/drawing/public';
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

it('edits multiple shaft bends with one commit per drag, no empty click, and cancellation', () => {
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
  const commit = vi.fn(() => true);
  const session = createDrawingSession({ onDocumentCommit: commit });
  session.commitObject({
    kind: 'arrow',
    id: 'bent',
    design: 'freehand',
    start: { x: 0, y: 0 },
    end: { x: 200, y: 0 },
    color: '#f00',
    width: 12,
    dynamicWidth: false,
  });
  session.setActiveTool('select');
  commit.mockClear();
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => ['#f00'],
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;
  const event = (type: string, x: number, y: number) =>
    act(() => canvas.dispatchEvent(mousePointerEvent(type, x, y)));
  const arrow = () => {
    const object = session.getSnapshot().document.objects[0];
    if (object?.kind !== 'arrow') throw new Error('Expected arrow');
    return object;
  };
  event('pointermove', 100, 0);
  expect(canvas.style.cursor).toBe('grab');
  event('pointerdown', 100, 0);
  expect(canvas.style.cursor).toBe('none');
  event('pointerup', 100, 0);
  expect(commit).not.toHaveBeenCalled();
  expect(arrow()).not.toHaveProperty('bendPoints');
  event('pointerdown', 100, 0);
  event('pointermove', 100, 80);
  expect(commit).not.toHaveBeenCalled();
  event('pointerup', 100, 80);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(arrow().bendPoints).toEqual([{ x: 100, y: 80 }]);
  expect(canvas.style.cursor).not.toBe('none');
  const next = buildDrawingFreehandArrowLines(arrow())[0]![36]!;
  event('pointerdown', next.x, next.y);
  event('pointermove', next.x, next.y + 40);
  event('pointerup', next.x, next.y + 40);
  expect(arrow().bendPoints).toHaveLength(2);
  expect(commit).toHaveBeenCalledTimes(2);
  const committed = arrow();
  for (const reason of ['pointercancel', 'lostpointercapture', 'blur']) {
    event('pointerdown', 100, 80);
    event('pointermove', 100, 120);
    if (reason === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else event(reason, 100, 120);
    event('pointerup', 100, 120);
    expect(arrow()).toBe(committed);
    expect(canvas.style.cursor).not.toBe('none');
  }
  expect(commit).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});

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

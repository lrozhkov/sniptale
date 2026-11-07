// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  buildDrawingFreehandArrowLines,
  createDrawingSession,
  type DrawingObject,
} from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { DrawingSurface } from './surface';
import * as trustedEvents from '../platform/trusted-events';
vi.mock('../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/trusted-events')>()),
  isTrustedKeyboardEvent: vi.fn(() => true),
}));

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

function mousePointerEvent(
  type: string,
  clientX: number,
  clientY: number,
  modifiers: MouseEventInit = {}
): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY, ...modifiers });
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

function setupAlignmentSurface(enabled = true) {
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
    id: 'target',
    kind: 'rectangle',
    bounds: { x: 300, y: 200, width: 200, height: 160 },
    color: '#f00',
    fillColor: '#f00',
    width: 2,
  });
  session.commitObject({
    id: 'moving',
    kind: 'rectangle',
    bounds: { x: 80, y: 80, width: 80, height: 60 },
    color: '#f00',
    fillColor: '#f00',
    width: 2,
  });
  session.setActiveTool('select');
  session.select('moving');
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
  const render = (chromeHidden = false) =>
    act(() =>
      root.render(
        <DrawingSurface
          active
          alignMovesToPage={enabled}
          chromeHidden={chromeHidden}
          controller={controller}
        />
      )
    );
  render();
  const canvas = host.querySelector('canvas')!;
  commit.mockClear();
  return {
    commit,
    session,
    host,
    render,
    event: (type: string, x: number, y: number, modifiers: MouseEventInit = {}) =>
      act(() => canvas.dispatchEvent(mousePointerEvent(type, x, y, modifiers))),
    moving: () => session.getSnapshot().document.objects.find((object) => object.id === 'moving'),
    dispose: () => act(() => root.unmount()),
  };
}

it.each([true, false])('commits one aligned page move with opt-in=%s', (enabled) => {
  const scene = setupAlignmentSurface(enabled);
  scene.event('pointerdown', 120, 110);
  scene.event('pointermove', 344, 234);
  expect(scene.moving()).toMatchObject({ bounds: { x: 80, y: 80 } });
  expect(scene.commit).not.toHaveBeenCalled();
  expect(
    scene.host.querySelectorAll('[data-ui="content.drawing.alignment-guides"] line')
  ).toHaveLength(enabled ? 2 : 0);
  scene.event('pointerup', 344, 234);
  expect(scene.moving()).toMatchObject({
    bounds: { x: enabled ? 300 : 304, y: enabled ? 200 : 204 },
  });
  expect(scene.commit).toHaveBeenCalledOnce();
  expect(scene.host.querySelector('[data-ui="content.drawing.alignment-guides"]')).toBeNull();
  scene.dispose();
});

it.each(['pointercancel', 'lostpointercapture', 'blur'])(
  'cancels aligned move on %s without saving preview',
  (reason) => {
    const scene = setupAlignmentSurface();
    scene.event('pointerdown', 120, 110);
    scene.event('pointermove', 344, 234);
    expect(
      scene.host.querySelectorAll('[data-ui="content.drawing.alignment-guides"] line')
    ).toHaveLength(2);
    if (reason === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else scene.event(reason, 344, 234);
    scene.event('pointerup', 344, 234);
    expect(scene.host.querySelector('[data-ui="content.drawing.alignment-guides"]')).toBeNull();
    expect(scene.moving()).toMatchObject({ bounds: { x: 80, y: 80 } });
    expect(scene.commit).not.toHaveBeenCalled();
    scene.dispose();
  }
);

it('hides alignment feedback with capture chrome while preserving the disposable draft', () => {
  const scene = setupAlignmentSurface();
  scene.event('pointerdown', 120, 110);
  scene.event('pointermove', 344, 234);
  scene.render(true);
  expect(scene.host.querySelector('[data-ui="content.drawing.alignment-guides"]')).toBeNull();
  expect(scene.moving()).toMatchObject({ bounds: { x: 80, y: 80 } });
  scene.render();
  expect(
    scene.host.querySelectorAll('[data-ui="content.drawing.alignment-guides"] line')
  ).toHaveLength(2);
  scene.event('pointercancel', 344, 234);
  expect(scene.commit).not.toHaveBeenCalled();
  scene.dispose();
});

it('does not snap the initial shape creation', () => {
  const scene = setupAlignmentSurface();
  act(() => {
    scene.session.setActiveTool('shape');
    scene.session.select(null);
  });
  scene.event('pointerdown', 304, 204);
  scene.event('pointermove', 384, 264);
  expect(scene.host.querySelector('[data-ui="content.drawing.alignment-guides"]')).toBeNull();
  scene.event('pointerup', 384, 264);
  expect(scene.session.getSnapshot().document.objects.at(-1)).toMatchObject({
    bounds: { x: 304, y: 204, width: 80, height: 60 },
  });
  scene.dispose();
});

it('submits a Simplify pointer release to its async owner without committing a draft', () => {
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
    id: 'previous',
    kind: 'blur',
    bounds: { x: 300, y: 200, width: 100, height: 80 },
  });
  session.setActiveTool('simplify');
  session.select('previous');
  expect(session.getSnapshot().selectedObjectIds).toEqual(['previous']);
  commit.mockClear();
  const submit = vi.fn<NonNullable<ContentDrawingController['simplify']>['submit']>(
    async () => undefined
  );
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => ['#123456'],
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    simplify: {
      prepare: vi.fn<NonNullable<ContentDrawingController['simplify']>['prepare']>(
        () => new Promise(() => undefined)
      ),
      cancelPreparation: vi.fn(),
      submit,
      transform: vi.fn(async () => undefined),
      duplicate: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      rebuild: vi.fn(async () => undefined),
      getPending: () => [],
      getPendingObjects: () => [],
      getFeedback: () => null,
      getRevision: () => 0,
      subscribe: () => () => undefined,
      cancel: vi.fn(),
      dispose: vi.fn(),
    },
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;
  for (const [type, x, y] of [
    ['pointerdown', 10, 20],
    ['pointermove', 80, 90],
    ['pointerup', 80, 90],
  ] as const) {
    act(() => {
      canvas.dispatchEvent(mousePointerEvent(type, x, y));
    });
    if (type === 'pointerdown') expect(session.getSnapshot().selectedObjectIds).toEqual([]);
    if (type === 'pointermove') {
      const preview = host.querySelector<HTMLElement>(
        '[data-ui="content.drawing.simplify-private"]'
      );
      expect(preview).not.toBeNull();
      expect(preview!.style.backdropFilter).toBe('blur(2px)');
      expect(preview!.style.borderStyle).toBe('dashed');
      expect(preview!.style.borderColor).toBe('rgb(37, 99, 235)');
    }
  }
  expect(submit).toHaveBeenCalledOnce();
  expect(submit.mock.calls[0]?.[0]).toMatchObject({
    kind: 'simplify',
    bounds: { x: 10, y: 20, width: 70, height: 70 },
  });
  expect(submit.mock.calls[0]?.[1]).toBeInstanceOf(Event);
  expect(commit).not.toHaveBeenCalled();
  expect(session.getSnapshot().document.objects).toHaveLength(1);
  act(() => root.unmount());
  session.dispose();
});

it('keeps a pending mask at its released geometry and hides handles without changing history', () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const original = {
    id: 'pending-geometry',
    kind: 'simplify',
    bounds: { x: 10, y: 20, width: 40, height: 30 },
    settings: session.getSnapshot().defaults.simplify,
    result: { dataUrl: 'data:image/png;base64,result', width: 40, height: 30 },
  } as const;
  session.commitObject(original);
  let pending: readonly DrawingObject[] = [];
  let revision = 0;
  const listeners = new Set<() => void>();
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => [],
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    simplify: {
      prepare: vi.fn<NonNullable<ContentDrawingController['simplify']>['prepare']>(
        () => new Promise(() => undefined)
      ),
      cancelPreparation: vi.fn(),
      submit: vi.fn(async () => undefined),
      transform: vi.fn(async () => undefined),
      duplicate: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      rebuild: vi.fn(async () => undefined),
      getPending: () => [],
      getPendingObjects: () => pending,
      getFeedback: () => null,
      getRevision: () => revision,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      cancel: vi.fn(),
      dispose: vi.fn(),
    },
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  act(() => {
    pending = [{ ...original, bounds: { x: 80, y: 25, width: 90, height: 30 } }];
    revision++;
    listeners.forEach((listener) => listener());
  });
  const privateHost = host.querySelector<HTMLElement>(
    '[data-ui="content.drawing.simplify-private"]'
  )!;
  expect(privateHost.style.left).toBe('80px');
  expect(privateHost.style.width).toBe('90px');
  expect(privateHost.style.backdropFilter).toBe('blur(2px)');
  expect(
    host.querySelector<HTMLElement>('[data-ui="content.drawing.selection-chrome"]')?.style.opacity
  ).toBe('0');
  expect(session.getCommittedDocument().objects).toEqual([original]);
  act(() => {
    pending = [];
    revision++;
    listeners.forEach((listener) => listener());
  });
  expect(privateHost.style.left).toBe('10px');
  expect(privateHost.style.width).toBe('40px');
  act(() => root.unmount());
  session.dispose();
});

it.each([true, false])('aligns an existing shape resize only with page opt-in=%s', (enabled) => {
  const scene = setupAlignmentSurface(enabled);
  scene.event('pointerdown', 160, 140);
  scene.event('pointermove', 296, 196);
  expect(
    scene.host.querySelectorAll('[data-ui="content.drawing.alignment-guides"] line')
  ).toHaveLength(enabled ? 2 : 0);
  expect(scene.commit).not.toHaveBeenCalled();
  scene.event('pointerup', 296, 196);
  expect(scene.moving()).toMatchObject({
    bounds: { x: 80, y: 80, width: enabled ? 220 : 216, height: enabled ? 120 : 116 },
  });
  expect(scene.commit).toHaveBeenCalledOnce();
  scene.dispose();
});

it.each(['move', 'resize'])(
  'Alt immediately releases and restores %s alignment without pointer motion',
  (kind) => {
    const scene = setupAlignmentSurface();
    const start = kind === 'move' ? { x: 120, y: 110 } : { x: 160, y: 140 };
    const end = kind === 'move' ? { x: 344, y: 234 } : { x: 296, y: 196 };
    scene.event('pointerdown', start.x, start.y);
    scene.event('pointermove', end.x, end.y);
    const guides = () =>
      scene.host.querySelectorAll('[data-ui="content.drawing.alignment-guides"] line');
    expect(guides()).toHaveLength(2);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true })));
    expect(guides()).toHaveLength(0);
    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false })));
    expect(guides()).toHaveLength(2);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true })));
    scene.event('pointerup', end.x, end.y, { altKey: true });
    expect(scene.moving()).toMatchObject(
      kind === 'move'
        ? { bounds: { x: 304, y: 204, width: 80, height: 60 } }
        : { bounds: { x: 80, y: 80, width: 216, height: 116 } }
    );
    expect(scene.commit).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' })));
    expect(guides()).toHaveLength(0);
    scene.dispose();
  }
);

it.each(['pointercancel', 'lostpointercapture', 'blur'])(
  'discards resize alignment on %s',
  (reason) => {
    const scene = setupAlignmentSurface();
    scene.event('pointerdown', 160, 140);
    scene.event('pointermove', 296, 196);
    expect(
      scene.host.querySelectorAll('[data-ui="content.drawing.alignment-guides"] line')
    ).toHaveLength(2);
    if (reason === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else scene.event(reason, 296, 196);
    scene.event('pointerup', 296, 196);
    expect(scene.moving()).toMatchObject({ bounds: { x: 80, y: 80, width: 80, height: 60 } });
    expect(scene.commit).not.toHaveBeenCalled();
    scene.dispose();
  }
);

function addNestedLayer(scene: ReturnType<typeof setupAlignmentSurface>) {
  act(() => {
    scene.session.commitObject({
      id: 'inner',
      kind: 'rectangle',
      bounds: { x: 360, y: 260, width: 40, height: 30 },
      color: '#f00',
      fillColor: '#f00',
      width: 2,
    });
    scene.session.select('moving');
  });
  scene.commit.mockClear();
}
it('preserves selection on an unselected background press and consumes the final marquee release point', () => {
  const scene = setupAlignmentSurface();
  addNestedLayer(scene);
  scene.event('pointerdown', 320, 220);
  expect(scene.session.getSnapshot().selectedObjectIds).toEqual(['moving']);
  scene.event('pointerup', 440, 330);
  expect(scene.session.getSnapshot().selectedObjectIds).toEqual(['inner']);
  expect(scene.commit).not.toHaveBeenCalled();
  scene.event('pointerdown', 320, 220);
  scene.event('pointerup', 320, 220);
  expect(scene.session.getSnapshot().selectedObjectIds).toEqual(['target']);
  expect(scene.commit).not.toHaveBeenCalled();
  scene.dispose();
});
it.each(['pointercancel', 'lostpointercapture', 'blur'])(
  'restores prior selection after a background marquee is cancelled with %s',
  (reason) => {
    const scene = setupAlignmentSurface();
    addNestedLayer(scene);
    scene.event('pointerdown', 320, 220);
    scene.event('pointermove', 440, 330);
    expect(scene.session.getSnapshot().selectedObjectIds).toEqual(['inner']);
    if (reason === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else scene.event(reason, 440, 330);
    scene.event('pointerup', 440, 330);
    expect(scene.session.getSnapshot().selectedObjectIds).toEqual(['moving']);
    expect(scene.commit).not.toHaveBeenCalled();
    scene.dispose();
  }
);

it('consumes Alt defaults only during an active page alignment gesture', () => {
  const scene = setupAlignmentSurface();
  const idle = new KeyboardEvent('keydown', { key: 'Alt', altKey: true, cancelable: true });
  act(() => window.dispatchEvent(idle));
  expect(idle.defaultPrevented).toBe(false);
  scene.event('pointerdown', 160, 140);
  scene.event('pointermove', 296, 196);
  const active = new KeyboardEvent('keydown', { key: 'Alt', altKey: true, cancelable: true });
  act(() => window.dispatchEvent(active));
  expect(active.defaultPrevented).toBe(true);
  scene.event('pointercancel', 296, 196);
  scene.dispose();
});

it('ignores a page-generated Alt event during a drawing gesture', () => {
  const scene = setupAlignmentSurface();
  scene.event('pointerdown', 160, 140);
  scene.event('pointermove', 296, 196);
  vi.spyOn(trustedEvents, 'isTrustedKeyboardEvent').mockReturnValue(false);
  const event = new KeyboardEvent('keydown', { key: 'Alt', altKey: true, cancelable: true });
  act(() => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
  expect(
    scene.host.querySelectorAll('[data-ui="content.drawing.alignment-guides"] line')
  ).toHaveLength(2);
  scene.event('pointercancel', 296, 196);
  scene.dispose();
});

it.each([false, true])(
  'moves the selected layer beneath an overlapping layer, release-only=%s, and preserves upper click',
  (releaseOnly) => {
    const scene = setupAlignmentSurface(false);
    act(() => {
      scene.session.commitObject({
        id: 'upper',
        kind: 'rectangle',
        bounds: { x: 90, y: 90, width: 100, height: 100 },
        color: '#000',
        width: 2,
      });
      scene.session.select('moving');
    });
    scene.commit.mockClear();
    scene.event('pointerdown', 120, 110);
    scene.event('pointermove', 123, 110);
    expect(scene.moving()).toMatchObject({ bounds: { x: 80, y: 80 } });
    if (!releaseOnly) scene.event('pointermove', 140, 120);
    scene.event('pointerup', 140, 120);
    expect(scene.moving()).toMatchObject({ bounds: { x: 100, y: 90 } });
    expect(scene.session.getSnapshot().selectedObjectIds).toEqual(['moving']);
    expect(scene.commit).toHaveBeenCalledOnce();
    scene.event('pointerdown', 140, 120);
    scene.event('pointerup', 140, 120);
    expect(scene.session.getSnapshot().selectedObjectIds).toEqual(['upper']);
    expect(scene.commit).toHaveBeenCalledOnce();
    scene.dispose();
  }
);

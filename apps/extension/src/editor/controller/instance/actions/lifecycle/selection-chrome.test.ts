// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { Control, Point, Rect, Textbox } from 'fabric';
import { createFrameAnnotationProxy } from '../../../../frame-annotation/proxy';
import { EditorCanvas } from '../../../../document/canvas-surface/render-region';
import type { EditorMagnetManager } from '../../../magnet';
import { useEditorStore } from '../../../../state/useEditorStore';
import { patchEdgeControl } from '../../../document/interaction-border-controls';
import {
  disposeEditorSelectionChrome,
  mountEditorSelectionChrome,
  resolveSelectionChromeMetrics,
} from './selection-chrome';

it('keeps selection controls bounded in screen pixels across editor zoom', () => {
  expect(resolveSelectionChromeMetrics(4)).toMatchObject({
    cornerRadius: 4.5,
    borderWidth: 1.25,
    guideWidth: 1,
  });
  expect(resolveSelectionChromeMetrics(0.2)).toMatchObject({
    cornerRadius: 4.5,
    borderWidth: 1.25,
    guideWidth: 1,
  });
});

it('fades controls for a selected shape during a pointer gesture and restores them on release', () => {
  useEditorStore.getState().updateWorkspace({ hideSelectionWhileDragging: true });
  const container = document.createElement('div');
  const upperCanvasEl = document.createElement('canvas');
  container.appendChild(upperCanvasEl);
  upperCanvasEl.style.cursor = 'move';
  upperCanvasEl.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
  const object = {
    sniptaleType: 'shape',
    hasBorders: false,
    hasControls: false,
    controls: {},
    getCoords: () => [],
  };
  const listeners = new Map<string, (event?: any) => void>();
  const canvas = {
    upperCanvasEl,
    getWidth: () => 100,
    getHeight: () => 100,
    getActiveObject: () => object,
    setCursor: (cursor: string) => {
      upperCanvasEl.style.cursor = cursor;
    },
    on: (name: string, handler: (event?: any) => void) => {
      listeners.set(name, handler);
      return () => listeners.delete(name);
    },
  };
  mountEditorSelectionChrome(
    canvas as never,
    { getVisualFeedback: () => ({ guides: [], relations: [], acceptedByAxis: {} }) } as never
  );
  const controls = container.querySelector(
    '[data-ui="editor.canvas.selection-controls"]'
  ) as SVGGElement;
  listeners.get('mouse:down')?.({ e: { button: 0, clientX: 10, clientY: 10 }, target: object });
  listeners.get('object:moving')?.({ e: { clientX: 11, clientY: 11 }, target: object });
  expect(controls.style.opacity).not.toBe('0');
  listeners.get('mouse:up')?.();
  expect(controls.style.opacity).not.toBe('0');
  listeners.get('mouse:down')?.({ e: { button: 0 }, target: object });
  listeners.get('object:moving')?.({ target: object });
  expect(controls.style.opacity).toBe('0');
  expect(controls.style.transition).toContain('150ms');
  expect(upperCanvasEl.style.cursor).toBe('none');
  canvas.setCursor('move');
  expect(upperCanvasEl.style.cursor).toBe('none');

  canvas.setCursor('grab');

  listeners.get('mouse:up')?.();
  expect(controls.style.opacity).toBe('1');
  expect(controls.style.transition).toContain('50ms');
  expect(upperCanvasEl.style.cursor).toBe('grab');

  listeners.get('mouse:down')?.({ e: { button: 0 }, target: object });
  window.dispatchEvent(new Event('blur'));
  expect(controls.style.opacity).toBe('1');
  disposeEditorSelectionChrome(canvas as never);
});

it('leaves text selection visible and respects the workspace switch', () => {
  const container = document.createElement('div');
  const upperCanvasEl = document.createElement('canvas');
  container.appendChild(upperCanvasEl);
  upperCanvasEl.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
  const object = {
    sniptaleType: 'text',
    hasBorders: false,
    hasControls: false,
    controls: {},
    getCoords: () => [],
  };
  const listeners = new Map<string, (event?: any) => void>();
  const canvas = {
    upperCanvasEl,
    getWidth: () => 100,
    getHeight: () => 100,
    getActiveObject: () => object,
    setCursor: (cursor: string) => {
      upperCanvasEl.style.cursor = cursor;
    },
    on: (name: string, handler: (event?: any) => void) => {
      listeners.set(name, handler);
      return () => listeners.delete(name);
    },
  };
  mountEditorSelectionChrome(
    canvas as never,
    { getVisualFeedback: () => ({ guides: [], relations: [], acceptedByAxis: {} }) } as never
  );
  const controls = container.querySelector(
    '[data-ui="editor.canvas.selection-controls"]'
  ) as SVGGElement;
  listeners.get('mouse:down')?.({ e: { button: 0 }, target: object });
  expect(controls.style.opacity).not.toBe('0');
  object.sniptaleType = 'shape';
  useEditorStore.getState().updateWorkspace({ hideSelectionWhileDragging: false });
  listeners.get('mouse:down')?.({ e: { button: 0 }, target: object });
  expect(controls.style.opacity).not.toBe('0');
  expect(upperCanvasEl.style.cursor).not.toBe('none');
  listeners.get('mouse:up')?.();
  useEditorStore.getState().updateWorkspace({ hideSelectionWhileDragging: true });
  listeners.get('mouse:down')?.({ e: { button: 0 }, target: object });
  listeners.get('object:moving')?.({ target: object });
  canvas.setCursor('move');
  expect(controls.style.opacity).toBe('0');
  expect(upperCanvasEl.style.cursor).toBe('none');
  disposeEditorSelectionChrome(canvas as never);
  expect(upperCanvasEl.style.cursor).toBe('move');
});

it('renders selection and magnet as sharp vectors while preserving the Fabric hit surface', () => {
  const container = document.createElement('div');
  const upperCanvasEl = document.createElement('canvas');
  upperCanvasEl.style.zIndex = '10';
  container.appendChild(upperCanvasEl);
  let displayedWidth = 400;
  upperCanvasEl.getBoundingClientRect = () => ({ width: displayedWidth }) as DOMRect;
  const object = {
    borderColor: '#2563eb',
    cornerColor: '#fff',
    cornerStrokeColor: '#2563eb',
    hasBorders: true,
    hasControls: true,
    borderDashArray: null,
    getCoords: () => [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
      { x: 10, y: 30 },
    ],
    calcOCoords: () => ({ tl: { x: 10, y: 10 } }),
    setCoords: () => {},
    controls: { tl: { offsetX: 0, offsetY: 0, sizeX: 13, sizeY: 13 } },
    isControlVisible: () => true,
  };
  let render: (() => void) | undefined;
  const canvas = {
    upperCanvasEl,
    getWidth: () => 100,
    getHeight: () => 100,
    getActiveObject: () => object,
    on: (_event: string, handler: () => void) => {
      render = handler;
      return () => {
        render = undefined;
      };
    },
  };
  const magnet = {
    getVisualFeedback: () => ({
      guides: [{ axis: 'y', coordinate: 2, from: 1, to: 50, points: [] }],
      relations: [],
      acceptedByAxis: {},
    }),
  };

  mountEditorSelectionChrome(canvas as never, magnet as never);
  const svg = container.querySelector('svg')!;
  expect(Number(getComputedStyle(svg).zIndex)).toBeGreaterThan(
    Number(getComputedStyle(upperCanvasEl).zIndex)
  );
  expect(canvas).toHaveProperty('skipControlsDrawing', true);
  expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
  expect(svg.querySelector('polygon')?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  expect(svg.querySelector('line')?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  expect(Number(svg.querySelector('[data-control=tl]')?.getAttribute('width')) * 4).toBeCloseTo(9);
  expect(object.controls.tl).toHaveProperty('sizeX', 5.5);

  displayedWidth = 20;
  render?.();
  expect(Number(svg.querySelector('[data-control=tl]')?.getAttribute('width')) * 0.2).toBeCloseTo(
    9
  );
  expect(object.controls.tl).toHaveProperty('sizeX', 110);
  disposeEditorSelectionChrome(canvas as never);
  expect(container.querySelector('svg')).toBeNull();
  expect(canvas).toHaveProperty('skipControlsDrawing', false);
  expect(object.controls.tl).toHaveProperty('sizeX', 13);
});

it('shows visible custom and rotation controls, point guides, and clears stale selection', () => {
  const container = document.createElement('div');
  const upperCanvasEl = document.createElement('canvas');
  container.appendChild(upperCanvasEl);
  upperCanvasEl.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
  const hiddenEdge = new Control();
  patchEdgeControl(hiddenEdge, 'mt');
  const object = {
    hasBorders: true,
    hasControls: true,
    borderDashArray: [4, 3],
    borderColor: '#2563eb',
    cornerColor: '#fff',
    cornerStrokeColor: '#2563eb',
    cornerSize: 13,
    getCoords: () => [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ],
    controls: {
      tl: { sizeX: 13, sizeY: 13, offsetX: 0, offsetY: 0 },
      mt: hiddenEdge,
      ml: { sizeX: 20, sizeY: 20, offsetX: 0, offsetY: 0 },
      mtr: { sizeX: 22, sizeY: 22, offsetX: 0, offsetY: -32 },
      start: { sizeX: 20, sizeY: 20, offsetX: 0, offsetY: 0 },
      end: { sizeX: 20, sizeY: 20, offsetX: 0, offsetY: 0 },
    },
    calcOCoords: () => ({
      tl: { x: 0, y: 0 },
      mt: { x: 10, y: 0 },
      ml: { x: 0, y: 10 },
      mtr: { x: 10, y: -32 },
      start: { x: 3, y: 4 },
      end: { x: NaN, y: 4 },
    }),
    setCoords: () => {},
    isControlVisible: (key: string) => key !== 'tl',
  };
  let selected: typeof object | null = object;
  let render: (() => void) | undefined;
  let logicalWidth = 100;
  let logicalHeight = 100;
  const canvas = {
    upperCanvasEl,
    getWidth: () => logicalWidth,
    getHeight: () => logicalHeight,
    getActiveObject: () => selected,
    on: (_event: string, handler: () => void) => {
      render = handler;
      return () => {};
    },
  };
  const magnet = {
    getVisualFeedback: () => ({
      guides: [
        {
          axis: 'x',
          coordinate: 5,
          from: -10,
          to: 30,
          points: [],
          matches: [
            {
              target: {
                id: 'point',
                kind: 'object',
                bounds: { x: 0, y: 0, width: 10, height: 12 },
              },
              source: { kind: 'center', point: { x: 5, y: 20 } },
              anchor: { kind: 'center', point: { x: 5, y: 6 } },
            },
          ],
        },
      ],
      relations: [],
      acceptedByAxis: {},
    }),
  };
  mountEditorSelectionChrome(canvas as never, magnet as never);
  const svg = container.querySelector('svg')!;
  expect(svg.querySelector('polygon')?.getAttribute('stroke-dasharray')).toBe('4 3');
  const rotationPath = svg
    .querySelector('[data-ui="editor.canvas.selection-rotate"]')
    ?.getAttribute('d');
  expect(rotationPath).toContain('M19.95 11a8 8');
  expect(rotationPath).toContain('M11 12a1 1');
  expect(svg.querySelectorAll('[data-ui="editor.canvas.selection-handle"]')).toHaveLength(3);
  expect(svg.querySelectorAll('path')).toHaveLength(2);

  selected = null;
  render?.();
  expect(svg.querySelector('polygon')).toBeNull();
  expect(svg.querySelectorAll('path')).toHaveLength(1);
  logicalWidth = 0;
  logicalHeight = 0;
  render?.();
  expect(svg.querySelectorAll('path')).toHaveLength(1);
  disposeEditorSelectionChrome(canvas as never);
  expect(object.controls.mtr).toHaveProperty('offsetY', -32);
});

it('does not replace Fabric controls when its canvas wrapper is unavailable', () => {
  const canvas = { upperCanvasEl: document.createElement('canvas') };
  mountEditorSelectionChrome(
    canvas as never,
    { getVisualFeedback: () => ({ guides: [], relations: [], acceptedByAxis: {} }) } as never
  );
  expect(canvas).not.toHaveProperty('skipControlsDrawing');
});

it('projects the selection border through the virtual viewport transform', () => {
  const container = document.createElement('div');
  const upperCanvasEl = document.createElement('canvas');
  container.append(upperCanvasEl);
  upperCanvasEl.getBoundingClientRect = () => ({ width: 200 }) as DOMRect;
  const object = {
    hasBorders: true,
    hasControls: false,
    getCoords: () => [
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 40 },
      { x: 10, y: 40 },
    ],
    canvas: { viewportTransform: [0.5, 0, 0, 0.5, 100, 200] },
  };
  const canvas = {
    upperCanvasEl,
    viewportTransform: object.canvas.viewportTransform,
    getWidth: () => 200,
    getHeight: () => 150,
    getActiveObject: () => object,
    on: () => () => undefined,
  };
  mountEditorSelectionChrome(
    canvas as never,
    {
      getVisualFeedback: () => ({ guides: [], relations: [], acceptedByAxis: {} }),
    } as never
  );

  expect(container.querySelector('polygon')?.getAttribute('points')).toBe(
    '105,210 115,210 115,220 105,220'
  );
  disposeEditorSelectionChrome(canvas as never);
});

it('keeps live selection chrome unchanged after a temporary preview render', () => {
  const container = document.createElement('div');
  const upperCanvasEl = document.createElement('canvas');
  container.append(upperCanvasEl);
  upperCanvasEl.getBoundingClientRect = () => ({ width: 200 }) as DOMRect;
  const liveContext = {} as CanvasRenderingContext2D;
  let render: ((event: { ctx: CanvasRenderingContext2D }) => void) | undefined;
  const canvas = {
    upperCanvasEl,
    viewportTransform: [1, 0, 0, 1, 0, 0],
    getContext: () => liveContext,
    getWidth: () => 200,
    getHeight: () => 150,
    getActiveObject: () => null,
    on: (_event: string, handler: typeof render) => {
      render = handler;
      return () => undefined;
    },
  };
  mountEditorSelectionChrome(
    canvas as never,
    {
      getVisualFeedback: () => ({
        guides: [
          {
            axis: 'x',
            coordinate: 5,
            from: -10,
            to: 30,
            points: [],
            matches: [
              {
                target: {
                  id: 'point',
                  kind: 'object',
                  bounds: { x: 0, y: 0, width: 10, height: 12 },
                },
                source: { kind: 'center', point: { x: 5, y: 20 } },
                anchor: { kind: 'center', point: { x: 5, y: 6 } },
              },
            ],
          },
        ],
        relations: [],
        acceptedByAxis: {},
      }),
    } as never
  );
  const svg = container.querySelector('svg')!;
  const liveMarkup = svg.innerHTML;
  const liveViewBox = svg.getAttribute('viewBox');
  canvas.viewportTransform = [2, 0, 0, 2, 100, 200];
  render?.({ ctx: {} as CanvasRenderingContext2D });
  expect(svg.getAttribute('viewBox')).toBe(liveViewBox);
  expect(svg.innerHTML).toBe(liveMarkup);
  disposeEditorSelectionChrome(canvas as never);
});

it('keeps the Simplify resize border visible while hiding controls until release', () => {
  useEditorStore.getState().updateWorkspace({ hideSelectionWhileDragging: true });
  const container = document.createElement('div');
  const upperCanvasEl = document.createElement('canvas');
  container.appendChild(upperCanvasEl);
  upperCanvasEl.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
  const object = {
    sniptaleType: 'simplify',
    hasBorders: true,
    hasControls: false,
    controls: {},
    borderColor: '#2563eb',
    getCoords: () => [
      { x: 10, y: 10 },
      { x: 80, y: 10 },
      { x: 80, y: 60 },
      { x: 10, y: 60 },
    ],
  };
  const listeners = new Map<
    string,
    (event?: { e?: { button: number }; target?: typeof object }) => void
  >();
  const canvas = {
    upperCanvasEl,
    _currentTransform: { action: 'scale' },
    getWidth: () => 100,
    getHeight: () => 100,
    getActiveObject: () => object,
    setCursor: (cursor: string) => {
      upperCanvasEl.style.cursor = cursor;
    },
    on: (
      name: string,
      handler: (event?: { e?: { button: number }; target?: typeof object }) => void
    ) => {
      listeners.set(name, handler);
      return () => listeners.delete(name);
    },
  };
  mountEditorSelectionChrome(
    canvas as never,
    { getVisualFeedback: () => ({ guides: [], relations: [], acceptedByAxis: {} }) } as never
  );
  const controls = container.querySelector<SVGGElement>(
    '[data-ui="editor.canvas.selection-controls"]'
  )!;
  listeners.get('mouse:down')?.({ e: { button: 0 }, target: object });
  expect(controls.style.getPropertyValue('--editor-selection-controls-opacity')).not.toBe('0');
  listeners.get('object:scaling')?.({ target: object });
  expect(controls.style.opacity).toBe('1');
  expect(controls.style.getPropertyValue('--editor-selection-controls-opacity')).toBe('0');
  expect(controls.querySelector('polygon')?.getAttribute('stroke')).toBe(
    'var(--sniptale-color-canvas-selection, #2563eb)'
  );
  window.dispatchEvent(new Event('pointercancel'));
  expect(controls.style.getPropertyValue('--editor-selection-controls-opacity')).toBe('1');
  disposeEditorSelectionChrome(canvas as never);
});

it('renders hover as a border only and clears it on selection, leave, blur and disposal', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const element = document.createElement('canvas');
  document.body.append(element);
  const canvas = new EditorCanvas(element, { width: 200, height: 120, renderOnAddRemove: false });
  const object = new Rect({
    left: 20,
    top: 20,
    width: 40,
    height: 30,
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
  });
  object.sniptaleId = 'hover-layer';
  canvas.add(object);
  const magnet: EditorMagnetManager = {
    clearGuides() {},
    dispose() {},
    hasActiveGuides: () => false,
    getVisualFeedback: () => ({ guides: [], relations: [], acceptedByAxis: {} }),
    snapRect: ({ rect }) => rect,
    snapPoint: ({ point }) => point,
  };
  mountEditorSelectionChrome(canvas, magnet);
  const root = canvas.upperCanvasEl.parentElement!;
  const preview = () => root.querySelector('[data-ui="editor.canvas.selection-preview"]')!;
  const hover = () =>
    canvas.fire('mouse:move', {
      e: new MouseEvent('mousemove'),
      target: object,
      scenePoint: new Point(25, 25),
      viewportPoint: new Point(25, 25),
    });
  hover();
  expect(preview().querySelector('polygon')?.getAttribute('data-layer-id')).toBe('hover-layer');
  expect(preview().querySelectorAll('circle')).toHaveLength(0);
  expect(canvas.getActiveObjects()).toEqual([]);
  canvas.setZoom(2);
  canvas.renderAll();
  expect(preview().querySelector('polygon')?.getAttribute('points')).toMatch(/^40,40 /);
  canvas.setActiveObject(object);
  canvas.renderAll();
  expect(preview().children).toHaveLength(0);
  canvas.discardActiveObject();
  canvas.upperCanvasEl.dispatchEvent(new MouseEvent('mouseout'));
  expect(preview().children).toHaveLength(0);
  hover();
  expect(preview().children).toHaveLength(1);
  window.dispatchEvent(new Event('blur'));
  expect(preview().children).toHaveLength(0);
  disposeEditorSelectionChrome(canvas);
  hover();
  expect(root.querySelector('[data-ui="editor.canvas.selection-chrome"]')).toBeNull();
  canvas.dispose();
  root.remove();
  vi.unstubAllGlobals();
});

it.each(['callout', 'step-badge'] as const)(
  'uses rendered %s bounds for layer outline, hover and full containment',
  async (kind) => {
    let mutationDeliveries = 0;
    const NativeMutationObserver = globalThis.MutationObserver;
    vi.stubGlobal(
      'MutationObserver',
      class extends NativeMutationObserver {
        constructor(callback: MutationCallback) {
          super((records, observer) => {
            mutationDeliveries += 1;
            callback(records, observer);
          });
        }
      }
    );
    const observed = new Set<Element>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(element: Element) {
          observed.add(element);
        }
        unobserve(element: Element) {
          observed.delete(element);
        }
        disconnect() {
          observed.clear();
        }
      }
    );
    vi.stubGlobal('PointerEvent', MouseEvent);
    class MarqueeCanvas extends EditorCanvas {
      marquee(value: { x: number; y: number; deltaX: number; deltaY: number } | null) {
        this._groupSelector = value;
      }
    }
    const viewport = document.createElement('div');
    viewport.dataset['ui'] = 'editor.canvas.viewport';
    const element = document.createElement('canvas');
    viewport.append(element);
    document.body.append(viewport);
    const canvas = new MarqueeCanvas(element, {
      width: 200,
      height: 120,
      renderOnAddRemove: false,
    });
    canvas.upperCanvasEl.getBoundingClientRect = () => new DOMRect(0, 0, 200, 120);
    const object = createFrameAnnotationProxy({
      frame: { id: 'standalone', annotationKind: kind, x: 100, y: 60, width: 1, height: 1 },
      ordering: 0,
      label: 'Annotation',
    });
    object.selectable = true;
    canvas.add(object);
    const scene = document.createElement('div');
    scene.dataset['ui'] = 'editor.frame-annotation-scene';
    const marker = document.createElement('div');
    marker.dataset['frameId'] = 'standalone';
    marker.className = kind === 'callout' ? 'sniptale-callout' : 'sniptale-step-badge-layer';
    const surface = kind === 'callout' ? marker : document.createElement('div');
    if (kind === 'step-badge') {
      surface.className = 'sniptale-step-badge';
      marker.append(surface);
    }
    surface.getBoundingClientRect = () => new DOMRect(80, 40, 80, 40);
    scene.append(marker);
    viewport.append(scene);
    const magnet: EditorMagnetManager = {
      clearGuides() {},
      dispose() {},
      hasActiveGuides: () => false,
      getVisualFeedback: () => ({ guides: [], relations: [], acceptedByAxis: {} }),
      snapRect: ({ rect }) => rect,
      snapPoint: ({ point }) => point,
    };
    mountEditorSelectionChrome(canvas, magnet);
    canvas.setActiveObject(object);
    canvas.renderAll();
    const chrome = viewport.querySelector<SVGElement>(
      '[data-ui="editor.canvas.selection-chrome"]'
    )!;
    expect(Number(chrome.style.zIndex)).toBeGreaterThan(30);
    const outline = viewport.querySelector('[data-ui="editor.canvas.projected-selection-outline"]');
    expect(outline?.getAttribute('points')).toBe('80,40 160,40 160,80 80,80');
    expect(outline?.getAttribute('stroke')).toBe('var(--sniptale-color-canvas-selection, #2563eb)');
    expect(object.width).toBe(1);
    await Promise.resolve();
    mutationDeliveries = 0;
    for (let index = 0; index < 100; index += 1) outline?.setAttribute('data-probe', String(index));
    await Promise.resolve();
    expect(mutationDeliveries).toBe(0);
    marker.style.left = '1px';
    await Promise.resolve();
    expect(mutationDeliveries).toBe(1);
    await Promise.resolve();
    expect(mutationDeliveries).toBe(1);

    surface.getBoundingClientRect = () => new DOMRect(80, 40, 0, 0);
    canvas.renderAll();
    expect(
      viewport.querySelector('[data-ui="editor.canvas.projected-selection-outline"]')
    ).toBeNull();
    surface.getBoundingClientRect = () => new DOMRect(80, 40, 80, 40);
    canvas.discardActiveObject();
    surface.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    expect(
      viewport.querySelectorAll('[data-ui="editor.canvas.selection-preview-outline"]')
    ).toHaveLength(1);
    viewport.dispatchEvent(new MouseEvent('pointerleave'));
    expect(
      viewport.querySelectorAll('[data-ui="editor.canvas.selection-preview-outline"]')
    ).toHaveLength(0);
    canvas.marquee({ x: 75, y: 35, deltaX: 50, deltaY: 30 });
    expect(canvas.getSelectionPreviewObjects()).toEqual([]);
    canvas.marquee({ x: 75, y: 35, deltaX: 90, deltaY: 50 });
    expect(canvas.getSelectionPreviewObjects()).toEqual([object]);
    canvas.marquee(null);
    const replacement = createFrameAnnotationProxy({
      frame: { id: 'standalone', annotationKind: kind, x: 100, y: 60, width: 1, height: 1 },
      ordering: 0,
      label: 'Restored annotation',
    });
    replacement.selectable = true;
    canvas.remove(object);
    canvas.add(replacement);
    canvas.setActiveObject(replacement);
    marker.dataset['revision'] = 'restored';
    await Promise.resolve();
    canvas.renderAll();
    expect(observed.has(surface)).toBe(true);
    marker.remove();
    await Promise.resolve();
    canvas.renderAll();
    expect(observed.has(surface)).toBe(false);
    expect(
      viewport.querySelector('[data-ui="editor.canvas.projected-selection-outline"]')
    ).toBeNull();
    disposeEditorSelectionChrome(canvas);
    expect(
      canvas.collectObjects(
        { left: 75, top: 35, width: 50, height: 30 },
        { includeIntersecting: false }
      )
    ).toEqual([replacement]);
    await canvas.dispose();
    viewport.remove();
    vi.unstubAllGlobals();
  }
);

it('keeps control visual metrics fixed across CSS projection scales', () => {
  for (const scale of [0.25, 0.5, 1, 2, 4]) {
    expect(resolveSelectionChromeMetrics(scale)).toMatchObject({
      cornerRadius: 4.5,
      rotationRadius: 12,
    });
  }
});

it('removes the selected text frame and controls during native text editing', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 200, height: 140 });
  const text = new Textbox('тс', { left: 40, top: 40, width: 100, fontSize: 24 });
  text.sniptaleType = 'text';
  canvas.add(text);
  canvas.setActiveObject(text);
  mountEditorSelectionChrome(canvas, {
    getVisualFeedback: () => ({ guides: [], relations: [], acceptedByAxis: {} }),
  } as never);
  const controls = () =>
    canvas.upperCanvasEl.parentElement!.querySelector(
      '[data-ui="editor.canvas.selection-controls"]'
    )!;
  expect(controls().children.length).toBeGreaterThan(0);
  text.isEditing = true;
  canvas.renderAll();
  expect(controls().children).toHaveLength(0);
  text.isEditing = false;
  canvas.renderAll();
  expect(controls().children.length).toBeGreaterThan(0);
  disposeEditorSelectionChrome(canvas);
  void canvas.dispose();
  vi.unstubAllGlobals();
});

it('shows a solid rectangle hover outline without handles or a second selected outline', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 200, height: 140 });
  const object = new Rect({ left: 40, top: 40, width: 80, height: 40 });
  object.sniptaleType = 'shape';
  canvas.add(object);
  mountEditorSelectionChrome(canvas, {
    getVisualFeedback: () => ({ guides: [], relations: [], acceptedByAxis: {} }),
  } as never);
  canvas.fire('mouse:move', {
    e: new MouseEvent('mousemove'),
    target: object,
    scenePoint: new Point(60, 60),
    viewportPoint: new Point(60, 60),
  });
  const root = canvas.upperCanvasEl.parentElement!;
  const preview = () => root.querySelector('[data-ui="editor.canvas.selection-preview"]')!;
  expect(preview().querySelectorAll('polygon')).toHaveLength(1);
  expect(preview().querySelector('polygon')!.getAttribute('stroke-dasharray')).toBe('');
  expect(preview().querySelectorAll('[data-control]')).toHaveLength(0);
  expect(canvas.getActiveObjects()).toEqual([]);
  canvas.setActiveObject(object);
  canvas.renderAll();
  expect(preview().children).toHaveLength(0);
  expect(
    root.querySelector('[data-ui="editor.canvas.selection-controls"]')!.querySelectorAll('polygon')
  ).toHaveLength(0);
  disposeEditorSelectionChrome(canvas);
  void canvas.dispose();
  vi.unstubAllGlobals();
});

it('keeps selected controls and accepted magnet feedback out of actual PNG and SVG scene exports', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 200, height: 140 });
  const object = new Rect({
    left: 70,
    top: 60,
    width: 70,
    height: 40,
    fill: '#ff8800',
    strokeWidth: 0,
  });
  object.sniptaleType = 'shape';
  object.sniptaleId = 'export-shape';
  canvas.add(object);
  const baseline = canvas.toDataURL({ format: 'png', multiplier: 1 });
  const magnet: EditorMagnetManager = {
    clearGuides() {},
    dispose() {},
    hasActiveGuides: () => true,
    snapRect: ({ rect }) => rect,
    snapPoint: ({ point }) => point,
    getVisualFeedback: () => ({
      guides: [
        {
          axis: 'x',
          coordinate: 70,
          from: 10,
          to: 130,
          points: [],
          matches: [
            {
              target: {
                id: 'target',
                kind: 'object',
                bounds: { x: 60, y: 10, width: 20, height: 20 },
              },
              anchor: { kind: 'center', point: { x: 70, y: 20 } },
              source: { kind: 'center', point: { x: 70, y: 60 } },
            },
          ],
        },
      ],
      relations: [
        {
          kind: 'dimension',
          dimension: 'width',
          key: 'export-width',
          value: 70,
          sourceSpan: {
            from: { x: 35, y: 80 },
            to: { x: 105, y: 80 },
            participantIds: ['export-shape'],
          },
          targetSpans: [
            { from: { x: 10, y: 20 }, to: { x: 80, y: 20 }, participantIds: ['target'] },
          ],
        },
      ],
      acceptedByAxis: {},
    }),
  };
  mountEditorSelectionChrome(canvas, magnet);
  canvas.setActiveObject(object);
  canvas.renderAll();
  const overlay = canvas.upperCanvasEl.parentElement!;
  expect(overlay.querySelector('[data-ui="editor.canvas.selection-handle"]')).not.toBeNull();
  expect(overlay.querySelector('[data-ui="editor.canvas.magnet-marker"]')).not.toBeNull();
  expect(overlay.querySelectorAll('[data-ui="editor.canvas.magnet-relation"]')).toHaveLength(2);
  expect(overlay.querySelector('text')?.textContent).toBe('70');
  expect(canvas.toDataURL({ format: 'png', multiplier: 1 })).toBe(baseline);
  const svg = canvas.toSVG();
  expect(svg).toContain('rgb(255,136,0)');
  expect(svg).not.toContain('M19.95 11');
  expect(svg).not.toContain('canvas-selection');
  expect(svg).not.toContain('canvas-magnet');
  expect(svg).not.toContain('ui-monospace');
  disposeEditorSelectionChrome(canvas);
  void canvas.dispose();
  vi.unstubAllGlobals();
});

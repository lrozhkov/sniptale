// @vitest-environment jsdom
import {
  ActiveSelection,
  Group,
  Canvas,
  Textbox,
  Path,
  Rect,
  Point,
  util,
  type Transform,
  type FabricObject,
} from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { EditorObjectType, EditorTool } from '../../../features/editor/document/types';
import type {
  EditorMagnetAligningGuidelines,
  EditorMagnetTransformEvent,
} from './aligning-guidelines';
import { createEditorMagnetManager } from './manager';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { applyEditorDrawingInteractionControls } from '../../drawing/object/controls/apply';

function createTopContext() {
  return {
    beginPath: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    transform: vi.fn(),
    translate: vi.fn(),
  };
}

type MagnetTestTopContext = ReturnType<typeof createTopContext>;
type MagnetTestCanvas = {
  clearContext: ReturnType<typeof vi.fn>;
  requestRenderAll: ReturnType<typeof vi.fn>;
  contextTop: MagnetTestTopContext | undefined;
};

function createRect(options: {
  height: number;
  left: number;
  top: number;
  width: number;
  role?: Rect['sniptaleRole'];
  type?: EditorObjectType;
}) {
  const rect = new Rect({
    left: options.left,
    top: options.top,
    width: options.width,
    height: options.height,
    strokeWidth: 0,
  });
  if (options.role !== undefined) rect.sniptaleRole = options.role;
  rect.sniptaleType = options.type ?? 'shape';
  rect.isOnScreen = () => true;
  rect.setCoords();
  return rect;
}

function createCanvas(
  objects: FabricObject[],
  options: {
    throwOnMissingTopContext?: boolean;
    upperCanvasEl?: HTMLCanvasElement;
    topContext?: MagnetTestTopContext | null;
  } = {}
) {
  const listeners = new Map<string, Set<unknown>>();
  const topContext = options.topContext === undefined ? createTopContext() : options.topContext;
  const canvas = {
    ...(options.upperCanvasEl ? { upperCanvasEl: options.upperCanvasEl } : {}),
    uniScaleKey: 'shiftKey',
    uniformScaling: true,
    viewportTransform: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
    clearContext: vi.fn((context) => {
      if (options.throwOnMissingTopContext && context === undefined) {
        throw new TypeError("Cannot read properties of undefined (reading 'clearRect')");
      }
    }),
    contextTop: topContext ?? undefined,
    forEachObject(callback: (object: FabricObject) => void) {
      objects.forEach(callback);
    },
    getTopContext() {
      return topContext;
    },
    getZoom() {
      return 1;
    },
    off: vi.fn((event: string, handler: unknown) => {
      listeners.get(event)?.delete(handler);
    }),
    on: vi.fn((event: string, handler: unknown) => {
      const handlers = listeners.get(event) ?? new Set();
      handlers.add(handler);
      listeners.set(event, handlers);
    }),
    requestRenderAll: vi.fn(),
  };

  for (const object of objects) {
    object.canvas = canvas as never;
  }

  return { canvas: canvas as never as MagnetTestCanvas, listeners, topContext };
}

function createManagerHarness(options: {
  activeTool?: EditorTool;
  canvasOptions?: Parameters<typeof createCanvas>[1];
  cropGuide?: Rect | null;
  magnetEnabled?: boolean;
  objects: FabricObject[];
  size?: { height: number; width: number };
}) {
  const state = {
    activeTool: options.activeTool ?? 'select',
    cropGuide: options.cropGuide ?? null,
    magnetEnabled: options.magnetEnabled ?? true,
  };
  const size = options.size ?? { width: 100, height: 80 };
  const { canvas, listeners, topContext } = createCanvas(options.objects, options.canvasOptions);
  const manager = createEditorMagnetManager({
    canvas: canvas as never,
    getActiveTool: () => state.activeTool,
    getCanvasDocumentSize: () => size,
    getCropGuide: () => state.cropGuide,
    getWorkspace: () => ({
      backgroundColor: '#ffffff',
      hideSelectionWhileDragging: true,
      gridColor: '#d1d5db',
      gridEnabled: false,
      gridSize: 24,
      gridSnapEnabled: false,
      magnetEnabled: state.magnetEnabled,
    }),
  }) as any;

  return { canvas, manager, state, listeners, topContext };
}

describe('editor magnet manager', () => {
  it('snaps moving objects to sibling edges and workspace axes', verifyMoveSnapping);
  it('snaps external DOM geometry while excluding its authoritative proxy', () => {
    const proxy = createRect({ left: 43, top: 38, width: 20, height: 20 });
    proxy.sniptaleId = 'frame-1';
    const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
    const { manager } = createManagerHarness({ objects: [proxy, sibling] });

    expect(
      manager.snapRect({
        excludeId: 'frame-1',
        rect: { x: 43, y: 38, width: 20, height: 20 },
      })
    ).toMatchObject({ x: 40, y: 40, width: 20, height: 20 });
    expect(manager.hasActiveGuides()).toBe(true);
  });
  it('snaps only the active edge of external DOM resize geometry', () => {
    const proxy = createRect({ left: 10, top: 10, width: 47, height: 20 });
    proxy.sniptaleId = 'frame-1';
    const sibling = createRect({ left: 60, top: 10, width: 20, height: 20 });
    const { manager } = createManagerHarness({ objects: [proxy, sibling] });

    expect(
      manager.snapResizeRect({
        direction: 'e',
        excludeId: 'frame-1',
        minimumSize: 8,
        rect: { x: 10, y: 10, width: 47, height: 20 },
      })
    ).toMatchObject({ x: 10, y: 10, width: 50, height: 20 });
    expect(manager.hasActiveGuides()).toBe(true);
  });
  it.each([
    {
      direction: 'e' as const,
      sibling: { left: 14, top: 10, width: 20, height: 8 },
    },
    {
      direction: 'w' as const,
      sibling: { left: -100, top: 10, width: 114, height: 8 },
    },
    {
      direction: 's' as const,
      sibling: { left: 10, top: 14, width: 8, height: 20 },
    },
    {
      direction: 'n' as const,
      sibling: { left: 10, top: -100, width: 8, height: 114 },
    },
  ])(
    'keeps the minimum size when magnet snaps the $direction edge inward',
    ({ direction, sibling }) => {
      const proxy = createRect({ left: 10, top: 10, width: 8, height: 8 });
      proxy.sniptaleId = 'frame-minimum';
      const { manager } = createManagerHarness({ objects: [proxy, createRect(sibling)] });

      expect(
        manager.snapResizeRect({
          direction,
          excludeId: 'frame-minimum',
          minimumSize: 8,
          rect: { x: 10, y: 10, width: 8, height: 8 },
        })
      ).toEqual({ x: 10, y: 10, width: 8, height: 8 });
      expect(manager.hasActiveGuides()).toBe(false);
    }
  );
  it(
    'snaps scaling handles and draws guides without clearing crop overlays after render',
    verifyScalingAndRenderPath
  );
  it('guards render hooks when export-time canvases have no top context', verifyRenderGuard);
  it('stays inert when magnet mode is disabled or the target is not editable', verifyInertPaths);
  it(
    'stays inert for crop-guide sessions and clears guides when magnet turns off',
    verifySessionGatingAndGuideState
  );
  it('registers one listener set per mount and removes them on dispose', verifyListenerLifecycle);
});

function verifyMoveSnapping() {
  const movingTarget = createRect({ left: 43, top: 38, width: 20, height: 20 });
  const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
  const { manager } = createManagerHarness({
    objects: [movingTarget, sibling],
    size: { width: 100, height: 80 },
  });

  manager.moving({ target: movingTarget });
  expect(movingTarget.left).toBe(40);

  movingTarget.set({ left: 48, top: 38 });
  movingTarget.setCoords();
  manager.moving({ target: movingTarget });

  expect(movingTarget.left).toBe(50);
  expect(
    manager.getVisualFeedback().guides.some((guide: { axis: string }) => guide.axis === 'x')
  ).toBe(true);
  expect(
    manager.getVisualFeedback().guides.some((guide: { axis: string }) => guide.axis === 'y')
  ).toBe(true);
}

function verifyScalingAndRenderPath() {
  const scalingTarget = createRect({ left: 40, top: 40, width: 18, height: 20 });
  const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
  const { manager, topContext } = createManagerHarness({
    objects: [scalingTarget, sibling],
  });

  scaleTargetAgainstSibling(manager, scalingTarget);
  manager.afterRender();

  expect(scalingTarget.getCoords()[1]?.x).toBe(50);
  expect(manager.getVisualFeedback().guides.length).toBeGreaterThan(0);
  expect(topContext?.stroke).not.toHaveBeenCalled();
}

function verifyRenderGuard() {
  const movingTarget = createRect({ left: 43, top: 38, width: 20, height: 20 });
  const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
  const missing = createManagerHarness({
    objects: [movingTarget, sibling],
    canvasOptions: { throwOnMissingTopContext: true, topContext: null },
  });
  missing.manager.moving({ target: movingTarget });
  expect(() => missing.manager.beforeRender()).not.toThrow();
  expect(() => missing.manager.afterRender()).not.toThrow();
  expect(missing.canvas.clearContext).not.toHaveBeenCalled();

  const active = createManagerHarness({
    objects: [createRect({ left: 20, top: 20, width: 20, height: 20 })],
  });
  active.manager.beforeRender();
  expect(active.canvas.clearContext).toHaveBeenCalledWith(active.canvas.contextTop);
}

function verifyInertPaths() {
  verifyDisabledMagnetPath();
  verifyNonEditableTargetPath();
}

function verifyListenerLifecycle() {
  const target = createRect({ left: 40, top: 40, width: 20, height: 20 });
  const firstHarness = createManagerHarness({ objects: [target] });

  expectListenerSetSize(firstHarness.listeners, 1);
  firstHarness.manager.dispose();
  expectListenerSetSize(firstHarness.listeners, 0);

  const secondHarness = createManagerHarness({ objects: [target] });
  expect(secondHarness.listeners.get('object:moving')?.size).toBe(1);
  secondHarness.manager.dispose();
}

function verifySessionGatingAndGuideState() {
  const movingTarget = createRect({ left: 43, top: 38, width: 20, height: 20 });
  const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
  const harness = createManagerHarness({
    activeTool: 'shape',
    objects: [movingTarget, sibling],
  });

  harness.manager.moving({ target: movingTarget });
  expect(movingTarget.left).toBe(40);
  expect(harness.manager.hasActiveGuides()).toBe(true);

  harness.state.cropGuide = createRect({
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    role: 'crop-guide',
  });
  movingTarget.left = 43;
  harness.manager.moving({ target: movingTarget });
  expect(movingTarget.left).toBe(43);

  harness.state.cropGuide = null;
  harness.manager.moving({ target: movingTarget });
  expect(harness.manager.hasActiveGuides()).toBe(true);

  harness.state.magnetEnabled = false;
  harness.manager.afterRender();
  expect(harness.manager.hasActiveGuides()).toBe(false);
}

function scaleTargetAgainstSibling(manager: EditorMagnetAligningGuidelines, target: Rect) {
  manager.scalingOrResizing({
    target,
    e: { shiftKey: false } as never,
    pointer: null as never,
    transform: {
      action: 'scaleX',
      corner: 'mr',
      original: { originX: 'left', originY: 'center' } as never,
    } as never,
  } as EditorMagnetTransformEvent);
}

function verifyDisabledMagnetPath() {
  const movingTarget = createRect({ left: 43, top: 40, width: 20, height: 20 });
  const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
  const disabledHarness = createManagerHarness({
    magnetEnabled: false,
    objects: [movingTarget, sibling],
  });

  disabledHarness.manager.moving({ target: movingTarget });
  expect(movingTarget.left).toBe(43);
}

function verifyNonEditableTargetPath() {
  const cropTarget = createRect({
    left: 43,
    top: 40,
    width: 20,
    height: 20,
    role: 'crop-guide',
  });
  const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
  const activeHarness = createManagerHarness({
    objects: [cropTarget, sibling],
  });

  activeHarness.manager.moving({ target: cropTarget });
  expect(cropTarget.left).toBe(43);
  expect(activeHarness.manager.verticalLines.size).toBe(0);
}

function expectListenerSetSize(listeners: Map<string, Set<unknown>>, size: number) {
  expect(listeners.get('object:moving')?.size ?? 0).toBe(size);
  expect(listeners.get('object:scaling')?.size ?? 0).toBe(size);
  expect(listeners.get('object:resizing')?.size ?? 0).toBe(size);
  expect(listeners.get('mouse:up')?.size ?? 0).toBe(size);
  expect(listeners.get('before:render')?.size ?? 0).toBe(size);
  expect(listeners.get('after:render')?.size ?? 0).toBe(size);
}

it.each(['pencil', 'marker', 'arrow'] as const)(
  'snaps a real %s path by its selection bounds and respects the magnet switch',
  (type) => {
    const path = new Path('M 0 0 L 20 20', { left: 43, top: 38, strokeWidth: 0 });
    path.sniptaleType = type;
    path.isOnScreen = () => true;
    const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
    const { manager, state } = createManagerHarness({ objects: [path, sibling] });
    manager.moving({ target: path });
    expect(path.left).toBe(40);
    expect(path.top).toBe(40);
    state.magnetEnabled = false;
    path.set({ left: 43, top: 38 });
    manager.moving({ target: path });
    expect(path.left).toBe(43);
    expect(path.top).toBe(38);
    expect(manager.hasActiveGuides()).toBe(false);
  }
);

it.each([
  { name: 'group', Selection: Group },
  { name: 'selection', Selection: ActiveSelection },
])('snaps an aggregate $name without moving its children independently', ({ Selection }) => {
  const first = createRect({ left: 43, top: 38, width: 10, height: 10 });
  const second = createRect({ left: 53, top: 48, width: 10, height: 10 });
  const selected = new Selection([first, second], { strokeWidth: 0 });
  selected.sniptaleType = 'group';
  selected.isOnScreen = () => true;
  const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
  const relative = { left: second.left - first.left, top: second.top - first.top };
  const { manager } = createManagerHarness({ objects: [selected, sibling] });
  manager.moving({ target: selected });
  selected.setCoords();
  expect(selected.getBoundingRect().left).toBe(40);
  expect(selected.getBoundingRect().top).toBe(30);
  expect({ left: second.left - first.left, top: second.top - first.top }).toEqual(relative);
});

it.each([
  { screenWidth: 800, margin: 6 },
  { screenWidth: 1600, margin: 3 },
])(
  'keeps a six CSS pixel snap radius when canvas and document sizes differ ($screenWidth)',
  ({ screenWidth, margin }) => {
    const target = createRect({ left: 43, top: 38, width: 20, height: 20 });
    const sibling = createRect({ left: 60, top: 40, width: 20, height: 20 });
    const { canvas, manager } = createManagerHarness({ objects: [target, sibling] });
    Object.assign(canvas, {
      getWidth: () => 800,
      upperCanvasEl: { getBoundingClientRect: () => ({ width: screenWidth }) },
    });
    manager.moving({ target });
    expect(manager.margin).toBe(margin);
    expect(target.left).toBe(40);
  }
);

it('snaps an arrow point to real target coordinates without creating a persistent binding', () => {
  const target = createRect({ left: 160, top: 140, width: 40, height: 40 });
  target.sniptaleId = 'point-target';
  const { manager } = createManagerHarness({
    objects: [target],
    size: { width: 1000, height: 1000 },
  });
  const input = {
    point: { x: 156, y: 139 },
    origin: { x: 100, y: 100 },
    preserveAngle: false,
    bypass: false,
  };
  const point = manager.snapPoint(input);
  expect(point).toEqual({ x: 160, y: 140 });
  const guides = manager.getVisualFeedback().guides;
  expect(guides.some((guide: { axis: string }) => guide.axis === 'x')).toBe(true);
  expect(guides.some((guide: { axis: string }) => guide.axis === 'y')).toBe(true);
  manager.mouseUp();
  expect(manager.getVisualFeedback().guides).toEqual([]);
  target.set({ left: 500, top: 500 });
  target.setCoords();
  expect(point).toEqual({ x: 160, y: 140 });
  expect(manager.snapPoint({ ...input, bypass: true })).toEqual(input.point);
  expect(manager.getVisualFeedback().guides).toEqual([]);
});

it.each([0.25, 1, 2])(
  'keeps point snapping threshold at6 screen pixels with CSS scale2 and canvas zoom%s',
  (zoom) => {
    const target = createRect({ left: 100, top: 100, width: 20, height: 20 });
    const { manager, canvas } = createManagerHarness({
      objects: [target],
      size: { width: 1000, height: 1000 },
    });
    Object.assign(canvas, {
      getWidth: () => 100,
      upperCanvasEl: { getBoundingClientRect: () => ({ width: 200 }) },
      getZoom: () => zoom,
      viewportTransform: [zoom, 0, 0, zoom, 0, 0],
    });
    const probe = (screenDistance: number) =>
      manager.snapPoint({
        point: { x: 90 - screenDistance / (2 * zoom), y: 350 },
        origin: { x: 0, y: 0 },
        preserveAngle: false,
        bypass: false,
      });
    expect(probe(6).x).toBe(90);
    expect(probe(6.01).x).toBeCloseTo(90 - 6.01 / (2 * zoom));
  }
);

it('excludes a nested arrow ancestor while retaining its actual sibling snap targets', () => {
  const arrow = createRect({ left: 400, top: 300, width: 100, height: 60 });
  arrow.sniptaleId = 'nested-arrow';
  const sibling = createRect({ left: 600, top: 300, width: 100, height: 60 });
  sibling.sniptaleId = 'nested-peer';
  const parent = new Group([arrow, sibling]);
  parent.sniptaleType = 'group';
  parent.sniptaleId = 'arrow-parent';
  parent.isOnScreen = () => true;
  const outside = createRect({ left: 900, top: 600, width: 50, height: 50 });
  const ancestor = new Group([parent, outside]);
  ancestor.sniptaleType = 'group';
  ancestor.sniptaleId = 'arrow-ancestor';
  ancestor.isOnScreen = () => true;
  const { manager } = createManagerHarness({
    objects: [ancestor],
    size: { width: 1000, height: 800 },
  });
  ancestor.setCoords();
  parent.setCoords();
  arrow.setCoords();
  sibling.setCoords();
  const snap = (point: { x: number; y: number }) =>
    manager.snapPoint({
      point,
      origin: { x: 400, y: 300 },
      excludeId: 'nested-arrow',
      preserveAngle: false,
      bypass: false,
    });
  const ancestorBounds = ancestor.getBoundingRect();
  const siblingBounds = sibling.getBoundingRect();
  const y = siblingBounds.top + siblingBounds.height * 0.8;
  const nearAncestor = { x: ancestorBounds.left + 3, y };
  const nearSibling = { x: siblingBounds.left - 2, y };
  try {
    expect(snap(nearAncestor)).toEqual(nearAncestor);
    expect(snap(nearSibling)).toEqual({ x: siblingBounds.left, y });
  } finally {
    manager.dispose();
  }
});

function boxResizeEvent(
  target: FabricObject,
  corner = 'mr',
  centered = false,
  proportional = false
): EditorMagnetTransformEvent {
  const originX =
    centered || !/[lr]/.test(corner) ? 'center' : corner.includes('r') ? 'left' : 'right';
  const originY =
    centered || !/[tb]/.test(corner) ? 'center' : corner.includes('b') ? 'top' : 'bottom';
  const transform: Transform = {
    target,
    corner,
    action: corner.length === 2 ? 'scale' : /[lr]/.test(corner) ? 'scaleX' : 'scaleY',
    originX,
    originY,
    scaleX: target.scaleX,
    scaleY: target.scaleY,
    skewX: target.skewX,
    skewY: target.skewY,
    offsetX: 0,
    offsetY: 0,
    ex: 0,
    ey: 0,
    lastX: 0,
    lastY: 0,
    theta: util.degreesToRadians(target.angle),
    width: target.width,
    height: target.height,
    shiftKey: !proportional,
    altKey: centered,
    original: { ...util.saveObjectTransform(target), originX, originY },
    actionPerformed: true,
  };
  return {
    target,
    transform,
    pointer: new Point(),
    e: new MouseEvent('mousemove', { shiftKey: !proportional, ctrlKey: centered }),
  };
}

function dimensionPair(width = 84, height = 96) {
  const source = createRect({ left: 100, top: 120, width: 80, height: 40 });
  source.set({ originX: 'left', originY: 'top' });
  source.setCoords();
  source.sniptaleId = 'source';
  const reference = createRect({ left: 400, top: 420, width, height });
  reference.sniptaleId = 'reference';
  const harness = createManagerHarness({
    objects: [source, reference],
    size: { width: 1000, height: 800 },
  });
  return { source, reference, ...harness };
}

it.each(['shape', 'image', 'blur', 'simplify', 'group'] as const)(
  'matches an unaligned %s box width without manufacturing a coordinate guide',
  (type) => {
    const { source, reference, manager } = dimensionPair();
    source.sniptaleType = type;
    const fixed = source.getPositionByOrigin('left', 'center');
    manager.scalingOrResizing(boxResizeEvent(source));
    expect(source.getBoundingRect().width).toBeCloseTo(84, 8);
    expect(source.getPositionByOrigin('left', 'center')).toEqual(fixed);
    const feedback = manager.getVisualFeedback();
    expect(feedback.guides).toEqual([]);
    expect(feedback.relations).toMatchObject([
      { kind: 'dimension', dimension: 'width', value: 84 },
    ]);
    expect(feedback.acceptedByAxis.x).toBe(feedback.relations[0].key);
    expect(reference.width).toBe(84);
    expect(manager.hasActiveGuides()).toBe(true);
    manager.mouseUp();
    expect(manager.getVisualFeedback()).toEqual({ guides: [], relations: [], acceptedByAxis: {} });
    manager.dispose();
  }
);

it('clears every feedback field on cancel, blur, mode change and disposal', () => {
  const { source, manager, state } = dimensionPair();
  const snap = () => manager.scalingOrResizing(boxResizeEvent(source));
  snap();
  expect(manager.getVisualFeedback().relations).toHaveLength(1);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(manager.getVisualFeedback()).toEqual({ guides: [], relations: [], acceptedByAxis: {} });
  snap();
  window.dispatchEvent(new Event('blur'));
  expect(manager.hasActiveGuides()).toBe(false);
  snap();
  window.dispatchEvent(new Event('pointercancel'));
  expect(manager.hasActiveGuides()).toBe(false);
  snap();
  state.activeTool = 'shape';
  expect(manager.hasActiveGuides()).toBe(false);
  state.activeTool = 'select';
  snap();
  manager.dispose();
  expect(manager.getVisualFeedback()).toEqual({ guides: [], relations: [], acceptedByAxis: {} });
});

it('publishes external frame dimension feedback through the existing rectangle resize entry', () => {
  const source = createRect({ left: 100, top: 120, width: 80, height: 40 });
  source.sniptaleId = 'frame';
  const reference = createRect({ left: 400, top: 420, width: 84, height: 100 });
  reference.sniptaleId = 'reference';
  const { manager, state } = createManagerHarness({
    objects: [source, reference],
    size: { width: 1000, height: 800 },
  });
  const input = {
    direction: 'e' as const,
    excludeId: 'frame',
    minimumSize: 8,
    rect: { x: 100, y: 120, width: 80, height: 40 },
  };
  expect(manager.snapResizeRect(input)).toEqual({ x: 100, y: 120, width: 84, height: 40 });
  expect(manager.getVisualFeedback().guides).toEqual([]);
  expect(manager.getVisualFeedback().relations).toMatchObject([
    { kind: 'dimension', dimension: 'width', value: 84 },
  ]);
  expect(manager.hasActiveGuides()).toBe(true);
  manager.mouseUp();
  expect(manager.hasActiveGuides()).toBe(false);
  state.magnetEnabled = false;
  expect(manager.snapResizeRect(input)).toEqual(input.rect);
  expect(manager.hasActiveGuides()).toBe(false);
  state.magnetEnabled = true;
  state.cropGuide = createRect({ left: 0, top: 0, width: 100, height: 100, role: 'crop-guide' });
  expect(manager.snapResizeRect(input)).toEqual(input.rect);
  expect(manager.hasActiveGuides()).toBe(false);
  manager.dispose();
});

it('routes native arrow endpoint snapping through the manager using real endpoint coordinates', async () => {
  const canvas = new Canvas(document.createElement('canvas'), { width: 800, height: 800 });
  canvas.setZoom(2);
  const arrow = (id: string, start: Point, end: Point) => {
    const object = createEditorDrawingFabricObject(
      { kind: 'arrow', id, color: '#f97316', width: 20, dynamicWidth: false, start, end },
      1
    );
    applyEditorDrawingInteractionControls(object);
    canvas.add(object);
    return object;
  };
  const source = arrow('moving-arrow', new Point(40, 80), new Point(100, 80));
  const reference = arrow('reference-arrow', new Point(200, 150), new Point(300, 250));
  const original = readEditorDrawingObject(reference);
  const manager = createEditorMagnetManager({
    canvas,
    getActiveTool: () => 'select',
    getCanvasDocumentSize: () => ({ width: 800, height: 800 }),
    getCropGuide: () => null,
    getWorkspace: () => ({
      backgroundColor: '#fff',
      hideSelectionWhileDragging: true,
      gridColor: '#ccc',
      gridEnabled: false,
      gridSize: 24,
      gridSnapEnabled: false,
      magnetEnabled: true,
    }),
  });
  const transform = {
    ...boxResizeEvent(source).transform,
    action: 'modifyDrawingArrow',
    corner: 'end',
  };
  try {
    expect(
      source.controls['end']!.actionHandler(new MouseEvent('mousemove'), transform, 299, 249)
    ).toBe(true);
    expect(readEditorDrawingObject(source)).toMatchObject({ end: { x: 300, y: 250 } });
    const matches = manager.getVisualFeedback().guides.flatMap((guide) => guide.matches ?? []);
    expect(matches).toContainEqual(
      expect.objectContaining({
        target: expect.objectContaining({ id: 'reference-arrow' }),
        anchor: { kind: 'point', point: { x: 300, y: 250 } },
      })
    );
    expect(readEditorDrawingObject(reference)).toEqual(original);
    source.controls['end']!.actionHandler(
      new MouseEvent('mousemove', { altKey: true }),
      transform,
      310,
      260
    );
    expect(readEditorDrawingObject(source)).toMatchObject({ end: { x: 310, y: 260 } });
    expect(manager.hasActiveGuides()).toBe(false);
  } finally {
    manager.dispose();
    await canvas.dispose();
  }
});

it('keeps native text width resize alignment on its established fallback path', () => {
  const text = new Textbox('a', {
    left: 100,
    top: 100,
    width: 18,
    fontSize: 12,
    strokeWidth: 0,
    originX: 'left',
    originY: 'top',
  });
  text.sniptaleType = 'text';
  text.isOnScreen = () => true;
  const sibling = createRect({ left: 122, top: 400, width: 20, height: 20 });
  const { manager } = createManagerHarness({
    objects: [text, sibling],
    size: { width: 1000, height: 800 },
  });
  const event = boxResizeEvent(text);
  event.transform.action = 'resizing';
  manager.scalingOrResizing(event);
  expect(text.width).toBeCloseTo(22, 8);
  expect(text.left).toBe(100);
  expect(text.text).toBe('a');
  expect(manager.getVisualFeedback().relations).toEqual([]);
  expect(manager.getVisualFeedback().guides).toMatchObject([{ axis: 'x', coordinate: 122 }]);
  manager.dispose();
});

it('does not request scene redraws for empty freehand mouseup and lost capture cleanup', () => {
  const element = document.createElement('canvas');
  const { canvas, manager } = createManagerHarness({
    objects: [],
    activeTool: 'pencil',
    canvasOptions: { upperCanvasEl: element },
  });
  try {
    canvas.requestRenderAll.mockClear();
    manager.mouseUp();
    element.dispatchEvent(new Event('lostpointercapture'));
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  } finally {
    manager.dispose();
  }
});

it('redraws once when releasing visible guides and skips the subsequent empty capture cleanup', () => {
  const element = document.createElement('canvas');
  const target = createRect({ left: 160, top: 140, width: 40, height: 40 });
  const { canvas, manager } = createManagerHarness({
    objects: [target],
    size: { width: 1000, height: 1000 },
    canvasOptions: { upperCanvasEl: element },
  });
  try {
    manager.snapPoint({
      point: { x: 156, y: 139 },
      origin: { x: 100, y: 100 },
      preserveAngle: false,
      bypass: false,
    });
    expect(manager.hasActiveGuides()).toBe(true);
    canvas.requestRenderAll.mockClear();
    manager.mouseUp();
    expect(manager.hasActiveGuides()).toBe(false);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    element.dispatchEvent(new Event('lostpointercapture'));
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  } finally {
    manager.dispose();
  }
});

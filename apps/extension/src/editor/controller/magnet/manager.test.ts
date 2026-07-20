import { Rect } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { EditorObjectType, EditorTool } from '../../../features/editor/document/types';
import type {
  EditorMagnetAligningGuidelines,
  EditorMagnetTransformEvent,
} from './aligning-guidelines';
import { createEditorMagnetManager } from './manager';

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
  rect.sniptaleType = options.type ?? 'rectangle';
  rect.isOnScreen = () => true;
  rect.setCoords();
  return rect;
}

function createCanvas(
  objects: Rect[],
  options: {
    throwOnMissingTopContext?: boolean;
    topContext?: MagnetTestTopContext | null;
  } = {}
) {
  const listeners = new Map<string, Set<unknown>>();
  const topContext = options.topContext === undefined ? createTopContext() : options.topContext;
  const canvas = {
    uniScaleKey: 'shiftKey',
    uniformScaling: true,
    viewportTransform: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
    clearContext: vi.fn((context) => {
      if (options.throwOnMissingTopContext && context === undefined) {
        throw new TypeError("Cannot read properties of undefined (reading 'clearRect')");
      }
    }),
    contextTop: topContext ?? undefined,
    forEachObject(callback: (object: Rect) => void) {
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
  objects: Rect[];
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
  expect(manager.verticalLines.size).toBeGreaterThan(0);
  expect(manager.horizontalLines.size).toBeGreaterThan(0);
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
  expect(topContext?.stroke).toHaveBeenCalled();
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
    activeTool: 'rectangle',
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

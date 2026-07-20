// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { createEditorRasterToolSession } from './session';

const mocks = vi.hoisted(() => ({
  addObject: vi.fn(),
  applyRasterBitmap: vi.fn(async () => undefined),
  createRasterTargetSnapshot: vi.fn(),
  fabricImageFromURL: vi.fn(async () => ({
    set: vi.fn(),
  })),
  paintRasterBrushBitmap: vi.fn((args: { bitmap: HTMLCanvasElement }) => {
    const context = args.bitmap.getContext('2d');
    if (!context) {
      return false;
    }
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 1, 1);
    return true;
  }),
  resolveBitmapPoint: vi.fn(() => ({ x: 2, y: 3 })),
}));

vi.mock('fabric', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fabric')>()),
  FabricImage: {
    fromURL: mocks.fabricImageFromURL,
  },
}));

vi.mock('../raster/brush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/brush')>()),
  paintRasterBrushBitmap: mocks.paintRasterBrushBitmap,
}));

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  createRasterTargetSnapshot: mocks.createRasterTargetSnapshot,
  resolveBitmapPoint: mocks.resolveBitmapPoint,
}));

import {
  finishBrushDraft,
  handleBrushMouseDown,
  resolveBrushCursorStatus,
  updateBrushDraft,
  updateBrushHoverCursor,
} from './brush';

function createBindings() {
  const session = createEditorRasterToolSession();
  return {
    addObject: mocks.addObject,
    applyRasterBitmap: mocks.applyRasterBitmap,
    getCanvasDocumentSize: () => ({ width: 20, height: 10 }),
    getRasterToolSession: () => session,
    nextLabelIndex: vi.fn(() => 1),
    session,
    syncRuntimeState: vi.fn(),
  };
}

function createCanvas(activeObjects: unknown[] = []) {
  return {
    getActiveObjects: () => activeObjects,
  };
}

function createImageTarget(overrides: Record<string, unknown> = {}) {
  return {
    sniptaleId: 'image-1',
    sniptaleLabel: 'Image 1',
    sniptaleRole: 'annotation',
    sniptaleType: 'image',
    visible: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useEditorStore.setState({
    rasterToolSettings: {
      brushColor: '#ea580c',
      brushHardness: 0.85,
      brushOpacity: 1,
      brushSize: 24,
      eraserSize: 28,
      fillColor: '#111827',
      fillMode: 'bucket',
      gradientFrom: '#111827',
      gradientTo: '#ffffff',
      selectionMode: 'marquee',
    },
  });
  const bitmap = document.createElement('canvas');
  bitmap.width = 20;
  bitmap.height = 10;
  mocks.createRasterTargetSnapshot.mockResolvedValue({
    bitmap,
    reference: { kind: 'object', objectId: 'image-1', objectName: 'Image 1' },
    sceneBounds: { height: 10, left: 0, top: 0, width: 20 },
  });
});

it('paints into an explicit existing annotation image target and commits once on finish', async () => {
  const bindings = createBindings();
  const target = createImageTarget();

  expect(
    await handleBrushMouseDown(
      bindings as never,
      createCanvas([target]) as never,
      {
        x: 2,
        y: 3,
      } as never
    )
  ).toBe(true);
  expect(bindings.session.brushDraft?.createdTarget).toBe(false);
  expect(bindings.session.brushDraft?.changed).toBe(true);
  expect(await finishBrushDraft(bindings as never, bindings.session)).toBe(true);

  expect(mocks.applyRasterBitmap).toHaveBeenCalledWith(
    { kind: 'object', objectId: 'image-1', objectName: 'Image 1' },
    expect.any(HTMLCanvasElement)
  );
  expect(mocks.addObject).not.toHaveBeenCalled();
});

it('paints into source and background image targets instead of creating a brush layer', async () => {
  const sourceBindings = createBindings();
  const backgroundBindings = createBindings();

  expect(
    await handleBrushMouseDown(
      sourceBindings as never,
      createCanvas([
        createImageTarget({ sniptaleRole: 'source', sniptaleType: 'source-image' }),
      ]) as never,
      { x: 2, y: 3 } as never
    )
  ).toBe(true);
  expect(
    await handleBrushMouseDown(
      backgroundBindings as never,
      createCanvas([
        createImageTarget({
          sniptaleBackgroundMode: 'image',
          sniptaleRole: 'background',
          sniptaleType: 'background',
        }),
      ]) as never,
      { x: 2, y: 3 } as never
    )
  ).toBe(true);

  expect(sourceBindings.session.brushDraft?.createdTarget).toBe(false);
  expect(backgroundBindings.session.brushDraft?.createdTarget).toBe(false);
});

it('creates a transparent brush image layer for missing or vector targets', async () => {
  const bindings = createBindings();
  const missingBindings = createBindings();
  const vectorTarget = createImageTarget({ sniptaleRole: 'annotation', sniptaleType: 'rectangle' });

  expect(
    await handleBrushMouseDown(
      bindings as never,
      createCanvas([vectorTarget]) as never,
      {
        x: 2,
        y: 3,
      } as never
    )
  ).toBe(true);
  expect(bindings.session.brushDraft?.createdTarget).toBe(true);
  expect(bindings.session.brushDraft?.snapshot.reference.objectName).toBe('Кисть 1');
  expect(
    await handleBrushMouseDown(
      missingBindings as never,
      createCanvas([]) as never,
      {
        x: 2,
        y: 3,
      } as never
    )
  ).toBe(true);
  expect(missingBindings.session.brushDraft?.createdTarget).toBe(true);

  expect(await finishBrushDraft(bindings as never, bindings.session)).toBe(true);
  expect(mocks.addObject).toHaveBeenCalledOnce();
  expect(mocks.applyRasterBitmap).not.toHaveBeenCalled();
});

it('blocks locked and multiple targets without creating a layer', async () => {
  const lockedBindings = createBindings();
  const multipleBindings = createBindings();

  expect(
    await handleBrushMouseDown(
      lockedBindings as never,
      createCanvas([createImageTarget({ sniptaleLocked: true })]) as never,
      { x: 2, y: 3 } as never
    )
  ).toBe(false);
  expect(
    await handleBrushMouseDown(
      multipleBindings as never,
      createCanvas([createImageTarget(), createImageTarget({ sniptaleId: 'image-2' })]) as never,
      { x: 2, y: 3 } as never
    )
  ).toBe(false);

  expect(lockedBindings.session.brushDraft).toBeNull();
  expect(multipleBindings.session.brushDraft).toBeNull();
});

it('updates brush drafts and hover cursors without committing empty strokes', async () => {
  const bindings = createBindings();

  expect(
    await handleBrushMouseDown(
      bindings as never,
      createCanvas([]) as never,
      {
        x: 2,
        y: 3,
      } as never
    )
  ).toBe(true);
  expect(updateBrushDraft(bindings.session, { x: 4, y: 3 } as never)).toBe(true);
  expect(updateBrushHoverCursor(bindings.session, { x: 5, y: 6 } as never)).toBe(true);
  expect(bindings.session.hoverCursor).toEqual({ scenePoint: { x: 5, y: 6 }, tool: 'brush' });

  const emptyBindings = createBindings();
  emptyBindings.session.brushDraft = {
    bitmapPoints: [{ x: 1, y: 1 }],
    changed: false,
    createdTarget: true,
    snapshot: {
      bitmap: document.createElement('canvas'),
      reference: { kind: 'object', objectId: 'brush-empty', objectName: 'Brush Empty' },
      sceneBounds: { height: 1, left: 0, top: 0, width: 1 },
    },
  };
  emptyBindings.session.brushDraft.snapshot.bitmap.width = 1;
  emptyBindings.session.brushDraft.snapshot.bitmap.height = 1;

  expect(await finishBrushDraft(emptyBindings as never, emptyBindings.session)).toBe(true);
  expect(mocks.addObject).not.toHaveBeenCalled();
});

it('reports brush cursor status for ready, locked, and multiple target states', () => {
  expect(resolveBrushCursorStatus({ canvas: createCanvas([]) as never })).toBe('ready');
  expect(
    resolveBrushCursorStatus({
      canvas: createCanvas([createImageTarget({ sniptaleLocked: true })]) as never,
    })
  ).toBe('locked');
  expect(
    resolveBrushCursorStatus({
      canvas: createCanvas([
        createImageTarget(),
        createImageTarget({ sniptaleId: 'image-2' }),
      ]) as never,
    })
  ).toBe('multiple');
});

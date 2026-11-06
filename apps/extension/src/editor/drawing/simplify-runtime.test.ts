// @vitest-environment jsdom
import { cancelEditorTransientInteraction } from '../controller/input/canvas-actions/transient';
import { afterEach, expect, it, vi } from 'vitest';
import { Canvas, FabricImage, Rect } from 'fabric';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';
import type { DrawingSimplifyObject } from '../../features/drawing/public';
import { createEditorDrawingSimplifyObject } from './object/simplify';
import { readEditorDrawingObject, writeEditorDrawingObject } from './object/metadata';
import * as editingSurface from '../document/canvas-surface/editing-surface';
import { setEditorEditingSurfaceDimensions } from '../document/canvas-surface/editing-surface';
import { undoEditorControllerSnapshot } from '../controller/public-api/document/history';
import { createMockDocument } from '../controller/instance/bindings/test-fixtures-document';
import {
  createEditorSnapshotHistory,
  pushEditorSnapshotHistory,
  replaceCurrentEditorSnapshotHistory,
  undoEditorSnapshot,
  redoEditorSnapshot,
} from '../controller/history';
import {
  restoreCanonicalEditorDrawingObjects,
  canonicalizeModifiedEditorDrawingSelection,
} from './object/canonicalize';
import { serializeCanvasObjects } from '../controller/document/serialization';
import {
  cancelPendingEditorSimplify,
  mountEditorSimplifyRuntime,
  notifyEditorSimplifyDocumentCommit,
  requestEditorSimplify,
  type EditorSimplifyCompute,
} from './simplify-runtime';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});
function fixture(accepted = true) {
  const image = document.createElement('canvas');
  image.width = 20;
  image.height = 10;
  image.getContext('2d')?.fillRect(0, 0, 20, 10);
  const snapshot = { dataUrl: image.toDataURL('image/png'), width: 20, height: 10 };
  const drawing: DrawingSimplifyObject = {
    id: 'same-id',
    kind: 'simplify',
    bounds: { x: 5, y: 5, width: 80, height: 40 },
    settings: createDefaultSimplifySettings(),
    source: { ...snapshot, bounds: { x: 5, y: 5, width: 80, height: 40 } },
    ...(accepted ? { result: snapshot } : {}),
  };
  const canvas = new Canvas(document.createElement('canvas'));
  const object = createEditorDrawingSimplifyObject(drawing, 1, image);
  canvas.add(object);
  canvas.setActiveObject(object);
  const result = deferred<typeof snapshot & { version: string }>();
  const compute: EditorSimplifyCompute = {
    render: vi.fn(() => result.promise),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
  const commitHistory = vi.fn();
  const publishDerived = vi.fn(() => true);
  const reportFailure = vi.fn();
  const dispose = mountEditorSimplifyRuntime({
    canvas,
    createCompute: () => compute,
    prepareObject: () => undefined,
    commitHistory,
    publishDerived,
    syncRuntimeState: () => undefined,
    reportFailure,
  });
  cleanups.push(() => {
    dispose();
    void canvas.dispose();
  });
  vi.spyOn(FabricImage, 'fromURL').mockImplementation(async () => new FabricImage(image));
  return {
    image,
    canvas,
    object,
    drawing,
    snapshot,
    result,
    compute,
    commitHistory,
    publishDerived,
    reportFailure,
    dispose,
  };
}
async function settled() {
  for (let n = 0; n < 8; n += 1) await Promise.resolve();
}
it('admits a decoded result once and preserves source with one history action', async () => {
  const f = fixture();
  requestEditorSimplify(f.canvas, f.object, { ...f.drawing.settings, content: 'all' });
  f.result.resolve({ ...f.snapshot, version: 'test' });
  await settled();
  expect(f.commitHistory).toHaveBeenCalledTimes(1);
  expect(f.canvas.getObjects()).toHaveLength(1);
  expect(f.canvas.getObjects()[0]).not.toBe(f.object);
  expect(readEditorDrawingObject(f.canvas.getObjects()[0]!)).toMatchObject({
    settings: { content: 'all' },
    source: f.drawing.source,
    result: f.snapshot,
  });
});
it('keeps the last accepted result and settings when replacement fails', async () => {
  const f = fixture();
  const before = serializeCanvasObjects(f.canvas);
  requestEditorSimplify(f.canvas, f.object, { ...f.drawing.settings, content: 'all' });
  f.result.reject(new Error('worker failed'));
  await settled();
  expect(serializeCanvasObjects(f.canvas)).toBe(before);
  expect(f.commitHistory).not.toHaveBeenCalled();
  expect(f.reportFailure).toHaveBeenCalledTimes(1);
});
it('does not let deletion and same-identity restoration admit a late result', async () => {
  const f = fixture();
  requestEditorSimplify(f.canvas, f.object);
  await settled();
  f.canvas.remove(f.object);
  const restored = createEditorDrawingSimplifyObject(f.drawing, 1, f.image);
  f.canvas.add(restored);
  f.result.resolve({ ...f.snapshot, version: 'test' });
  await settled();
  expect(f.canvas.getObjects()).toEqual([restored]);
  expect(f.commitHistory).not.toHaveBeenCalled();
});
it('cancels pending creation without serializing a draft or resurrecting it', async () => {
  const f = fixture(false);
  requestEditorSimplify(f.canvas, f.object);
  await settled();
  expect(JSON.parse(serializeCanvasObjects(f.canvas)).objects).toEqual([]);
  expect(cancelPendingEditorSimplify(f.canvas)).toBe(true);
  f.result.resolve({ ...f.snapshot, version: 'test' });
  await settled();
  expect(f.canvas.getObjects()).toEqual([]);
  expect(f.commitHistory).not.toHaveBeenCalled();
});
it('disposal retires late work and clears temporary presentation', async () => {
  const f = fixture();
  requestEditorSimplify(f.canvas, f.object);
  await settled();
  f.dispose();
  f.result.resolve({ ...f.snapshot, version: 'test' });
  await settled();
  expect(f.canvas.getObjects()).toEqual([f.object]);
  expect(f.commitHistory).not.toHaveBeenCalled();
  expect(f.canvas.wrapperEl.querySelector('[data-ui="editor.simplify.pending"]')).toBeNull();
});
it('keeps preview pixels outside accepted serialization and clears them on reset', async () => {
  const f = fixture();
  const before = serializeCanvasObjects(f.canvas);
  requestEditorSimplify(f.canvas, f.object, { ...f.drawing.settings, color: '#ff0000' }, true);
  f.result.resolve({ ...f.snapshot, version: 'test' });
  await settled();
  expect(serializeCanvasObjects(f.canvas)).toBe(before);
  expect(f.commitHistory).not.toHaveBeenCalled();
  expect(
    f.canvas.wrapperEl.querySelector('[data-ui="editor.simplify.pending"] img')
  ).not.toBeNull();
  requestEditorSimplify(f.canvas, f.object, f.drawing.settings, true);
  expect(f.canvas.wrapperEl.querySelector('[data-ui="editor.simplify.pending"]')).toBeNull();
});

it('retires replaced settings work and admits only the latest controlled response', async () => {
  const f = fixture();
  const replacement = deferred<typeof f.snapshot & { version: string }>();
  vi.mocked(f.compute.render)
    .mockReturnValueOnce(f.result.promise)
    .mockReturnValueOnce(replacement.promise);
  requestEditorSimplify(f.canvas, f.object, { ...f.drawing.settings, content: 'all' });
  await settled();
  requestEditorSimplify(f.canvas, f.object, { ...f.drawing.settings, sensitivity: 90 });
  f.result.resolve({ ...f.snapshot, version: 'stale' });
  await settled();
  expect(f.commitHistory).not.toHaveBeenCalled();
  replacement.resolve({ ...f.snapshot, version: 'current' });
  await settled();
  expect(f.commitHistory).toHaveBeenCalledTimes(1);
  expect(readEditorDrawingObject(f.canvas.getObjects()[0]!)).toMatchObject({
    settings: { content: 'text', sensitivity: 90 },
  });
});

it('removes a failed new region and lets a subsequent region retry normally', async () => {
  const f = fixture(false);
  requestEditorSimplify(f.canvas, f.object);
  await settled();
  f.result.reject(new Error('worker unavailable'));
  await settled();
  expect(f.canvas.getObjects()).toEqual([]);
  expect(f.commitHistory).not.toHaveBeenCalled();
  const retry = createEditorDrawingSimplifyObject(f.drawing, 2);
  f.canvas.add(retry);
  vi.mocked(f.compute.render).mockResolvedValue({ ...f.snapshot, version: 'recovered' });
  requestEditorSimplify(f.canvas, retry);
  await settled();
  expect(f.canvas.getObjects()).toHaveLength(1);
  expect(f.commitHistory).toHaveBeenCalledTimes(1);
});

it('recaptures changed lower pixels as a derived update and preserves cache for upper-only changes', async () => {
  const f = fixture();
  setEditorEditingSurfaceDimensions(f.canvas, { width: 100, height: 100 });
  const lower = new Rect({
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    width: 100,
    height: 100,
    fill: '#ff0000',
    strokeWidth: 0,
  });
  f.canvas.insertAt(0, lower);
  requestEditorSimplify(f.canvas, f.object);
  f.result.resolve({ ...f.snapshot, version: 'first' });
  await settled();
  expect(f.compute.render).toHaveBeenCalledTimes(1);
  const upper = new Rect({ width: 100, height: 100, fill: '#00ff00' });
  f.canvas.add(upper);
  notifyEditorSimplifyDocumentCommit(f.canvas);
  await settled();
  expect(f.compute.render).toHaveBeenCalledTimes(1);
  const next = deferred<typeof f.snapshot & { version: string }>();
  vi.mocked(f.compute.render).mockReturnValueOnce(next.promise);
  lower.set({ fill: '#0000ff' });
  notifyEditorSimplifyDocumentCommit(f.canvas);
  await settled();
  expect(f.compute.render).toHaveBeenCalledTimes(2);
  const input = vi.mocked(f.compute.render).mock.calls[1]![0];
  const expected = document.createElement('canvas');
  expected.width = 100;
  expected.height = 100;
  const context = expected.getContext('2d')!;
  context.fillStyle = '#0000ff';
  context.fillRect(0, 0, 100, 100);
  expect(input.source.dataUrl).toBe(expected.toDataURL('image/png'));
  next.resolve({ ...f.snapshot, version: 'derived' });
  await settled();
  expect(f.commitHistory).toHaveBeenCalledTimes(1);
  expect(f.publishDerived).toHaveBeenCalledTimes(1);
});

it('persists dirty intermediate history and enriches recomputed Undo state without losing Redo', async () => {
  const f = fixture();
  setEditorEditingSurfaceDimensions(f.canvas, { width: 100, height: 100 });
  const lower = new Rect({
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    width: 100,
    height: 100,
    strokeWidth: 0,
    fill: '#ff0000',
  });
  lower.sniptaleId = 'lower';
  lower.sniptaleType = 'shape';
  lower.sniptaleRole = 'annotation';
  f.canvas.insertAt(0, lower);
  const exportDocument = () => ({
    ...createMockDocument(),
    canvasJson: serializeCanvasObjects(f.canvas),
  });
  const history = createEditorSnapshotHistory(exportDocument());
  cleanups.push(
    mountEditorSimplifyRuntime({
      canvas: f.canvas,
      createCompute: () => f.compute,
      prepareObject: () => undefined,
      commitHistory: () => undefined,
      syncRuntimeState: () => undefined,
      publishDerived: () =>
        replaceCurrentEditorSnapshotHistory({
          history,
          expectedRevision: history.getRevision(),
          exportDocument,
        }),
    })
  );
  lower.set({ fill: '#0000ff' });
  notifyEditorSimplifyDocumentCommit(f.canvas);
  pushEditorSnapshotHistory({ history, muted: false, exportDocument });
  expect(readEditorDrawingObject(f.object)).toMatchObject({ sourceDirty: true });
  await settled();
  const upper = new Rect({ width: 10, height: 10, fill: '#00ff00' });
  upper.sniptaleId = 'upper';
  upper.sniptaleType = 'shape';
  upper.sniptaleRole = 'annotation';
  f.canvas.add(upper);
  notifyEditorSimplifyDocumentCommit(f.canvas);
  pushEditorSnapshotHistory({ history, muted: false, exportDocument });
  f.result.resolve({ ...f.snapshot, version: 'current' });
  await settled();
  expect(history.getState()).toMatchObject({ index: 2, size: 3 });
  expect(readEditorDrawingObject(f.canvas.getObjects()[1]!)).not.toHaveProperty('sourceDirty');
  const intermediate = undoEditorSnapshot(history)!;
  expect(intermediate.canvasJson).toContain('sourceDirty');
  const restored = deferred<typeof f.snapshot & { version: string }>();
  vi.mocked(f.compute.render).mockReturnValueOnce(restored.promise);
  vi.spyOn(FabricImage, 'fromObject').mockImplementation(async (raw) =>
    Object.assign(new FabricImage(f.image), raw)
  );
  await f.canvas.loadFromJSON(intermediate.canvasJson);
  restoreCanonicalEditorDrawingObjects({
    canvas: f.canvas,
    source: null,
    prepareObject: () => undefined,
  });
  notifyEditorSimplifyDocumentCommit(f.canvas);
  await settled();
  expect(f.compute.render).toHaveBeenCalledTimes(2);
  restored.resolve({ ...f.snapshot, version: 'restored' });
  await settled();
  expect(history.getState()).toMatchObject({ index: 1, size: 3, canRedo: true });
  expect(readEditorDrawingObject(f.canvas.getObjects()[1]!)).not.toHaveProperty('sourceDirty');
  const redone = redoEditorSnapshot(history)!;
  expect(JSON.parse(redone.canvasJson).objects).toHaveLength(3);
  expect(history.getState()).toMatchObject({ index: 2, size: 3 });
});

it('repaints resized geometry from the retained source without a new backdrop capture', async () => {
  const f = fixture();
  f.object.set({ scaleX: f.object.scaleX / 2 });
  canonicalizeModifiedEditorDrawingSelection({
    canvas: f.canvas,
    object: f.object,
    source: null,
    prepareObject: () => undefined,
  });
  const replacement = f.canvas.getObjects()[0]!;
  expect(readEditorDrawingObject(replacement)).toMatchObject({
    sourceDirty: true,
    bounds: { width: 40, height: 40 },
  });
  notifyEditorSimplifyDocumentCommit(f.canvas);
  await settled();
  expect(f.compute.render).toHaveBeenCalledTimes(1);
  expect(vi.mocked(f.compute.render).mock.calls[0]![0].source).toMatchObject(f.drawing.source!);
  expect(vi.mocked(f.compute.render).mock.calls[0]![0].region).toMatchObject({
    width: 10,
    height: 10,
  });
  f.result.resolve({ ...f.snapshot, version: 'resized' });
  await settled();
  expect(f.publishDerived).toHaveBeenCalledTimes(1);
  expect(f.commitHistory).not.toHaveBeenCalled();
});

it('creates a manual image without reading a backdrop and does not retain a blank source', async () => {
  const f = fixture(false);
  f.canvas.remove(f.object);
  const object = createEditorDrawingSimplifyObject(
    {
      id: 'manual-image',
      kind: 'simplify',
      bounds: { x: 5, y: 5, width: 80, height: 40 },
      settings: { ...createDefaultSimplifySettings(), automatic: false, manualKind: 'image' },
    },
    1
  );
  f.canvas.add(object);
  const pixels = document.createElement('canvas');
  pixels.width = 80;
  pixels.height = 40;
  const result = {
    dataUrl: pixels.toDataURL('image/png'),
    width: 80,
    height: 40,
    version: 'manual',
  };
  vi.mocked(FabricImage.fromURL).mockResolvedValue(new FabricImage(pixels));
  requestEditorSimplify(f.canvas, object);
  await settled();
  expect(f.compute.render).toHaveBeenCalledTimes(1);
  expect(vi.mocked(f.compute.render).mock.calls[0]![0]).toMatchObject({
    source: { width: 80, height: 40 },
    settings: { automatic: false, manualKind: 'image' },
  });
  f.result.resolve(result);
  await settled();
  expect(f.commitHistory).toHaveBeenCalledTimes(1);
  expect(readEditorDrawingObject(f.canvas.getObjects()[0]!)).toMatchObject({
    id: 'manual-image',
    result: { dataUrl: result.dataUrl, width: 80, height: 40 },
  });
  expect(readEditorDrawingObject(f.canvas.getObjects()[0]!)).not.toHaveProperty('source');
});

it('Undo cancels derived work and still undoes its originating user action', async () => {
  const f = fixture();
  setEditorEditingSurfaceDimensions(f.canvas, { width: 100, height: 100 });
  const lower = new Rect({ width: 100, height: 100, fill: '#ff0000' });
  lower.sniptaleType = 'shape';
  lower.sniptaleRole = 'annotation';
  f.canvas.insertAt(0, lower);
  const exportDocument = () => ({
    ...createMockDocument(),
    canvasJson: serializeCanvasObjects(f.canvas),
  });
  const history = createEditorSnapshotHistory(exportDocument());
  cleanups.push(
    mountEditorSimplifyRuntime({
      canvas: f.canvas,
      createCompute: () => f.compute,
      prepareObject: () => undefined,
      commitHistory: f.commitHistory,
      syncRuntimeState: () => undefined,
    })
  );
  lower.set({ fill: '#0000ff' });
  notifyEditorSimplifyDocumentCommit(f.canvas);
  pushEditorSnapshotHistory({ history, muted: false, exportDocument });
  await settled();
  const applyDocument = vi.fn(async () => undefined);
  await undoEditorControllerSnapshot({
    canvas: f.canvas,
    history,
    applyDocument,
    publishHistoryDocument: () => undefined,
  });
  expect(history.getState().index).toBe(0);
  expect(applyDocument).toHaveBeenCalledTimes(1);
  f.result.resolve({ ...f.snapshot, version: 'late' });
  await settled();
  expect(f.commitHistory).not.toHaveBeenCalled();
});

it.each([15, 90])(
  'sends the unrotated manual-text source region plus %i degree projection',
  async (rotation) => {
    const f = fixture();
    vi.spyOn(editingSurface, 'getEditorEditingDocumentSize').mockReturnValue({
      width: 100,
      height: 100,
    });
    f.canvas.remove(f.object);
    const drawing = {
      ...f.drawing,
      rotation,
      settings: { ...f.drawing.settings, automatic: false, manualKind: 'text' as const },
    };
    const object = createEditorDrawingSimplifyObject(drawing, 1, f.image);
    f.canvas.add(object);
    requestEditorSimplify(f.canvas, object);
    await settled();
    expect(vi.mocked(f.compute.render).mock.calls[0]![0].region).toEqual({
      x: 5,
      y: 5,
      width: 80,
      height: 40,
      rotation,
    });
    f.result.resolve({ ...f.snapshot, version: 'simplify-v1' });
    await settled();
    expect(f.commitHistory).toHaveBeenCalledTimes(1);
    expect(readEditorDrawingObject(f.canvas.getObjects()[0]!)).toMatchObject({
      rotation,
      engineVersion: 'simplify-v1',
      settings: { automatic: false, manualKind: 'text' },
    });
  }
);

it(
  'keeps manual-image geometry independent of a clipped source and recaptures when ' +
    'returning to automatic',
  async () => {
    const f = fixture();
    f.canvas.remove(f.object);
    const drawing = { ...f.drawing, bounds: { ...f.drawing.bounds, y: -15 } };
    const object = createEditorDrawingSimplifyObject(drawing, 1, f.image);
    f.canvas.add(object);
    const pixels = document.createElement('canvas');
    pixels.width = 80;
    pixels.height = 40;
    vi.mocked(FabricImage.fromURL).mockResolvedValue(new FabricImage(pixels));
    requestEditorSimplify(f.canvas, object, {
      ...drawing.settings,
      automatic: false,
      manualKind: 'image',
    });
    await settled();
    expect(vi.mocked(f.compute.render).mock.calls[0]![0]).toMatchObject({
      source: { width: 80, height: 40 },
      region: { x: 0, y: 0, width: 80, height: 40 },
    });
    f.result.resolve({
      dataUrl: pixels.toDataURL('image/png'),
      width: 80,
      height: 40,
      version: 'simplify-v1',
    });
    await settled();
    const accepted = f.canvas.getObjects()[0]!;
    expect(readEditorDrawingObject(accepted)).toMatchObject({ source: f.drawing.source });
    setEditorEditingSurfaceDimensions(f.canvas, { width: 100, height: 100 });
    requestEditorSimplify(f.canvas, accepted, drawing.settings);
    await settled();
    expect(vi.mocked(f.compute.render).mock.calls[1]![0].source).toMatchObject({
      width: 100,
      height: 100,
    });
  }
);

it('recaptures when geometry leaves the retained source even if lower layers are unchanged', async () => {
  const f = fixture();
  vi.spyOn(editingSurface, 'getEditorEditingDocumentSize').mockReturnValue({
    width: 100,
    height: 150,
  });
  writeEditorDrawingObject(f.object, {
    ...f.drawing,
    bounds: { x: 5, y: 80, width: 80, height: 40 },
    sourceDirty: true,
  });
  requestEditorSimplify(f.canvas, f.object);
  await settled();
  const request = vi.mocked(f.compute.render).mock.calls[0]![0];
  expect(request.source).toMatchObject({
    width: 100,
    height: 150,
    bounds: { x: 0, y: 0, width: 100, height: 150 },
  });
  expect(request.region).toEqual({ x: 5, y: 80, width: 80, height: 40 });
  f.result.resolve({ ...f.snapshot, version: 'recaptured' });
  await settled();
  expect(f.reportFailure).not.toHaveBeenCalled();
  expect(f.commitHistory).toHaveBeenCalledTimes(1);
});

it('paints the accepted result while the pending blur cover is still mounted', async () => {
  const f = fixture();
  const render = vi.spyOn(f.canvas, 'renderAll').mockImplementation(() => {
    expect(readEditorDrawingObject(f.canvas.getObjects()[0]!)).toMatchObject({
      engineVersion: 'paint-first',
    });
    expect(f.canvas.wrapperEl.querySelector('[data-ui="editor.simplify.pending"]')).not.toBeNull();
    return f.canvas;
  });
  requestEditorSimplify(f.canvas, f.object);
  f.result.resolve({ ...f.snapshot, version: 'paint-first' });
  await settled();
  expect(render).toHaveBeenCalledOnce();
  expect(f.canvas.wrapperEl.querySelector('[data-ui="editor.simplify.pending"]')).toBeNull();
});

it.each([false, true])(
  'preserves submitted work on focus loss; explicit cancel=%s',
  async (cancel) => {
    const f = fixture(false);
    requestEditorSimplify(f.canvas, f.object);
    await settled();
    const options = {
      canvas: f.canvas,
      drawSession: null,
      cropGuide: null,
      activeTool: 'simplify',
      clearCropSelection: vi.fn(),
      switchToSelectTool: vi.fn(),
      syncRuntimeState: vi.fn(),
    };
    cancelEditorTransientInteraction({
      ...options,
      preserveActiveTool: true,
      preservePendingSimplify: true,
    });
    expect(f.canvas.getObjects()).toContain(f.object);
    expect(f.compute.cancel).not.toHaveBeenCalled();
    if (cancel) cancelEditorTransientInteraction(options);
    f.result.resolve({ ...f.snapshot, version: 'after-focus-loss' });
    await settled();
    if (cancel) {
      expect(f.canvas.getObjects()).toHaveLength(0);
      expect(f.commitHistory).not.toHaveBeenCalled();
    } else {
      expect(f.canvas.getObjects()).toHaveLength(1);
      expect(f.commitHistory).toHaveBeenCalledOnce();
      expect(readEditorDrawingObject(f.canvas.getObjects()[0]!)).toMatchObject({
        engineVersion: 'after-focus-loss',
      });
    }
  }
);

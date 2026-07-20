import { describe, expect, it, vi } from 'vitest';
import type { FabricObject, Point, Rect } from 'fabric';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';
import type { CropSelection, DrawSession, PanSession } from '../../core/types';
import type { SourceState } from '../../../document/model/source-state';

const rasterClipboardMocks = vi.hoisted(() => ({
  copyRasterSelectionForController: vi.fn(async () => true),
  cutRasterSelectionForController: vi.fn(async () => true),
  deleteRasterSelectionForController: vi.fn(async () => true),
  pasteRasterClipboardForController: vi.fn(async () => true),
}));

vi.mock('../../raster-tools/controller', async () => {
  const actual = await vi.importActual<typeof import('../../raster-tools/controller')>(
    '../../raster-tools/controller'
  );
  return {
    ...actual,
    copyRasterSelectionForController: rasterClipboardMocks.copyRasterSelectionForController,
    cutRasterSelectionForController: rasterClipboardMocks.cutRasterSelectionForController,
    deleteRasterSelectionForController: rasterClipboardMocks.deleteRasterSelectionForController,
    pasteRasterClipboardForController: rasterClipboardMocks.pasteRasterClipboardForController,
  };
});

const richShapeTextEditorMocks = vi.hoisted(() => ({
  startRichShapeTextEditor: vi.fn(() => true),
}));
vi.mock('../../rich-shape-text-editor/session-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../rich-shape-text-editor/session-start')>()),
  startRichShapeTextEditor: richShapeTextEditorMocks.startRichShapeTextEditor,
}));
vi.mock('../../../objects/rich-shape/guards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/rich-shape/guards')>()),
  isRichShapeObject: (object: FabricObject) => object.sniptaleType === 'rich-shape',
}));

import { createEditorControllerEventBindings, createEditorControllerPublicApiAdapter } from './';
import { exercisePublicApiMethods, expectPublicApiMethodCalls } from './test-support';
import {
  createMockController,
  createMockDocument,
  createMockMutatorFixtures,
} from './test-fixtures';

function createEventBindingFixtures() {
  return {
    cropGuide: { kind: 'crop' } as unknown as Rect,
    cropSelection: { kind: 'selection' } as unknown as CropSelection,
    drawSession: { tool: 'arrow' } as unknown as DrawSession,
    source: { kind: 'image' } as unknown as SourceState,
    panSession: { kind: 'pan' } as unknown as PanSession,
    point: { x: 1, y: 2 } as Point,
    object: { kind: 'object' } as unknown as FabricObject,
  };
}

function exerciseEventStateAndObjectBindings(
  bindings: ReturnType<typeof createEditorControllerEventBindings>,
  fixtures: ReturnType<typeof createEventBindingFixtures>
) {
  bindings.setCropState(fixtures.cropGuide, fixtures.cropSelection);
  bindings.setDrawSession(fixtures.drawSession);
  bindings.setSource(fixtures.source);
  bindings.setIsSpacePressed(true);
  bindings.setPanSession(fixtures.panSession);
  bindings.setViewportSyncFrame(11);
  bindings.getCanvas();
  bindings.getViewportElement();
  bindings.getCanvasDocumentSize();
  bindings.getCropSelectionMouseEnabled();
  bindings.getSource();
  bindings.getActiveTool();
  bindings.getHistoryMuted();
  bindings.getActiveCropRect();
  bindings.ensureObjectReachable(fixtures.object);
  bindings.applyGridSnap(fixtures.object);
  bindings.nextLabelIndex('text' as never);
  bindings.prepareObject(fixtures.object);
  bindings.startDrawSession('arrow', fixtures.point, fixtures.object);
  bindings.decorateShape(fixtures.object, 'rectangle');
  bindings.addObject(fixtures.object);
  bindings.beginRichShapeTextEditing?.({
    ...fixtures.object,
    sniptaleRichShape: { id: 'shape-1' },
    sniptaleType: 'rich-shape',
  } as never);
  bindings.switchToSelectTool();
  bindings.advanceStepValue();
}

async function exerciseEventCommandBindings(
  bindings: ReturnType<typeof createEditorControllerEventBindings>
) {
  const bitmap = { width: 1, height: 1 } as HTMLCanvasElement;
  bindings.undo();
  bindings.redo();
  bindings.duplicateSelection();
  bindings.nudgeSelection({ code: 'ArrowRight', deltaX: 1, deltaY: 0, step: 1 });
  bindings.finalizeSelectionNudge('ArrowRight');
  bindings.deleteSelection();
  bindings.applyCropSelection();
  bindings.applyTextSelectionStyle('bold');
  bindings.commitHistory();
  bindings.syncRuntimeState();
  bindings.syncViewportState();
  bindings.zoomViewportAtPoint(1.2, { clientX: 12, clientY: 24 });
  bindings.clearRasterSelection();
  bindings.copyRasterSelection();
  bindings.cutRasterSelection();
  bindings.deleteRasterSelectionPixels();
  bindings.pasteRasterClipboard();
  await bindings.applyRasterBitmap(
    { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    bitmap
  );
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function expectEventBindingState(
  bindings: ReturnType<typeof createEditorControllerEventBindings>,
  fixtures: ReturnType<typeof createEventBindingFixtures>
) {
  expect(bindings.getCropGuide()).toBe(fixtures.cropGuide);
  expect(bindings.getCropSelection()).toBe(fixtures.cropSelection);
  expect(bindings.getDrawSession()).toBe(fixtures.drawSession);
  expect(bindings.getSource()).toBe(fixtures.source);
  expect(bindings.getIsSpacePressed()).toBe(true);
  expect(bindings.getPanSession()).toBe(fixtures.panSession);
  expect(bindings.getViewportSyncFrame()).toBe(11);
}

function expectEventCommandCalls(controller: ReturnType<typeof createMockController>) {
  expect(controller.switchToSelectTool).toHaveBeenCalled();
  expect(controller.advanceStepValue).toHaveBeenCalled();
  expect(controller.undo).toHaveBeenCalled();
  expect(controller.redo).toHaveBeenCalled();
  expect(controller.duplicateSelection).toHaveBeenCalled();
  expect(controller.nudgeSelection).toHaveBeenCalledWith({
    code: 'ArrowRight',
    deltaX: 1,
    deltaY: 0,
    step: 1,
  });
  expect(controller.finalizeSelectionNudge).toHaveBeenCalledWith('ArrowRight');
  expect(controller.deleteSelection).toHaveBeenCalled();
  expect(controller.applyCropSelection).toHaveBeenCalled();
  expect(controller.applyTextSelectionStyle).toHaveBeenCalledWith('bold');
  expect(controller.commitHistory).toHaveBeenCalled();
  expect(controller.syncRuntimeState).toHaveBeenCalled();
  expect(controller.syncViewportState).toHaveBeenCalled();
  expect(controller.setZoomAtViewportPoint).toHaveBeenCalledWith(1.2, {
    clientX: 12,
    clientY: 24,
  });
  expect(controller.clearRasterSelection).toHaveBeenCalled();
  expect(rasterClipboardMocks.copyRasterSelectionForController).toHaveBeenCalledWith(controller);
  expect(rasterClipboardMocks.cutRasterSelectionForController).toHaveBeenCalledWith(controller);
  expect(rasterClipboardMocks.deleteRasterSelectionForController).toHaveBeenCalledWith(controller);
  expect(rasterClipboardMocks.pasteRasterClipboardForController).toHaveBeenCalledWith(controller);
  expect(controller.applyRasterBitmap).toHaveBeenCalled();
}

it('mutates controller state and proxies command bindings', async () => {
  const controller = createMockController();
  controller.applyTextSelectionStyle = vi.fn(() => true);
  const bindings = createEditorControllerEventBindings(controller);
  const fixtures = createEventBindingFixtures();

  exerciseEventStateAndObjectBindings(bindings, fixtures);
  await exerciseEventCommandBindings(bindings);

  expectEventBindingState(bindings, fixtures);
  expect(controller.startDrawSession).toHaveBeenCalledWith(
    'arrow',
    fixtures.point,
    fixtures.object
  );
  expect(controller.decorateShape).toHaveBeenCalledWith(fixtures.object, 'rectangle');
  expect(controller.addObject).toHaveBeenCalledWith(fixtures.object);
  expect(richShapeTextEditorMocks.startRichShapeTextEditor).toHaveBeenCalledWith({
    canvas: controller.canvas,
    object: expect.objectContaining({ sniptaleType: 'rich-shape' }),
    owner: controller,
  });
  expectEventCommandCalls(controller);
});

describe('editor controller public api adapter', () => {
  it('exposes current view values and proxies public methods', () => {
    const controller = createMockController();
    controller.viewportDevicePixelRatioBaseline = 1;
    const adapter = createEditorControllerPublicApiAdapter(controller);
    const object = { kind: 'object' } as unknown as FabricObject;
    const browserFrame = { kind: 'browser-frame' } as unknown as BrowserFrameState;
    const frame = { kind: 'frame' } as unknown as EditorFrameSettings;
    const document = createMockDocument();

    expect(adapter.canvasDocumentSize).toEqual({ width: 10, height: 20 });
    expect(adapter.activeTool).toBe('select');
    expect(adapter.viewportDevicePixelRatioBaseline).toBe(1);

    exercisePublicApiMethods({ adapter, browserFrame, document, frame, object });
    expectPublicApiMethodCalls({ controller, browserFrame, document, frame, object });
  });

  it('updates mutable controller state through adapter mutators', () => {
    const controller = createMockController();
    controller.viewportDevicePixelRatioBaseline = 1;
    const adapter = createEditorControllerPublicApiAdapter(controller);
    const { cropGuide, cropSelection, document, drawSession, history, panSession, source } =
      createMockMutatorFixtures();

    adapter.setCanvasDocumentSize({ width: 30, height: 40 });
    adapter.setSource(source);
    adapter.setOriginalDocument(document);
    adapter.setHistory(history);
    adapter.setActiveTool('text');
    adapter.setZoomLevel(2);
    adapter.setDrawSession(drawSession);
    adapter.setCropState(cropGuide, cropSelection);
    adapter.setPanSession(panSession);
    const mutedResult = adapter.withHistoryMuted(() => 'ok');

    expect(controller.canvasDocumentSize).toEqual({ width: 30, height: 40 });
    expect(controller.source).toBe(source);
    expect(controller.originalDocument).toBe(document);
    expect(controller.history).toBe(history);
    expect(controller.activeTool).toBe('text');
    expect(controller.zoomLevel).toBe(2);
    expect(controller.drawSession).toBe(drawSession);
    expect(controller.cropGuide).toBe(cropGuide);
    expect(controller.cropSelection).toBe(cropSelection);
    expect(controller.panSession).toBe(panSession);
    expect(mutedResult).toBe('ok');
  });
});

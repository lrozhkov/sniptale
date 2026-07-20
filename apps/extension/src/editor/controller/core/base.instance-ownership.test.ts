/* eslint-disable max-lines-per-function --
   controller base regression suite intentionally validates the helper delegation surface together */

import type { FabricObject, Point, Rect } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import type { EditorRenderToDataUrlOptions } from '../../document/model/render-options';
import type { SourceState } from '../../document/model/source-state';
import type { EditorControllerInstance } from '../instance/types';
import type { ApplyDocumentOptions, CropSelection, DrawSession, PanSession } from './types';
import { ImageEditorControllerBase } from './base';

const helperMocks = vi.hoisted(() => ({
  addObjectForController: vi.fn(),
  advanceStepValueForController: vi.fn(),
  applyDocumentForController: vi.fn(async () => undefined),
  applyGridSnapForController: vi.fn(),
  applyToolModeForController: vi.fn(),
  buildViewportStateForController: vi.fn(() => ({ zoomPercent: 100 })),
  cancelTransientInteractionForController: vi.fn(() => true),
  commitHistoryForController: vi.fn(),
  createEditorControllerEventBindings: vi.fn(() => ({ bindings: true })),
  createEditorControllerPublicApiAdapter: vi.fn(() => ({ adapter: true })),
  decorateShapeForController: vi.fn(),
  ensureBrowserFrameOnTopForController: vi.fn(),
  ensureObjectReachableForController: vi.fn(() => true),
  ensureReachableObjectsForController: vi.fn(() => true),
  focusObjectInViewportForController: vi.fn(),
  getActiveCropRectForController: vi.fn(() => ({ kind: 'crop' })),
  logBrowserFrameForController: vi.fn(),
  moveSelectionForController: vi.fn(),
  moveSelectionToEdgeForController: vi.fn(),
  nextLabelIndexForController: vi.fn(() => 4),
  initializeObjectForController: vi.fn(),
  refreshActiveToolSettingsPreviewForController: vi.fn(),
  rebuildFrameDecorationsForController: vi.fn(async () => undefined),
  relayoutSceneForController: vi.fn(),
  scheduleViewportStateSyncForController: vi.fn(),
  scheduleZoomToFitForController: vi.fn(),
  sendFrameObjectsToBackForController: vi.fn(),
  startDrawSessionForController: vi.fn(),
  switchToSelectToolForController: vi.fn(),
  syncRuntimeStateForController: vi.fn(),
  syncViewportStateForController: vi.fn(),
  withHistoryMutedForController: vi.fn((_, callback: () => unknown) => callback()),
}));

vi.mock('../instance/bindings', () => ({
  createEditorControllerEventBindings: helperMocks.createEditorControllerEventBindings,
  createEditorControllerPublicApiAdapter: helperMocks.createEditorControllerPublicApiAdapter,
}));

vi.mock('../instance/helpers', () => ({
  addObjectForController: helperMocks.addObjectForController,
  advanceStepValueForController: helperMocks.advanceStepValueForController,
  applyDocumentForController: helperMocks.applyDocumentForController,
  applyGridSnapForController: helperMocks.applyGridSnapForController,
  applyToolModeForController: helperMocks.applyToolModeForController,
  buildViewportStateForController: helperMocks.buildViewportStateForController,
  cancelTransientInteractionForController: helperMocks.cancelTransientInteractionForController,
  commitHistoryForController: helperMocks.commitHistoryForController,
  decorateShapeForController: helperMocks.decorateShapeForController,
  ensureBrowserFrameOnTopForController: helperMocks.ensureBrowserFrameOnTopForController,
  ensureObjectReachableForController: helperMocks.ensureObjectReachableForController,
  ensureReachableObjectsForController: helperMocks.ensureReachableObjectsForController,
  focusObjectInViewportForController: helperMocks.focusObjectInViewportForController,
  getActiveCropRectForController: helperMocks.getActiveCropRectForController,
  logBrowserFrameForController: helperMocks.logBrowserFrameForController,
  moveSelectionForController: helperMocks.moveSelectionForController,
  moveSelectionToEdgeForController: helperMocks.moveSelectionToEdgeForController,
  nextLabelIndexForController: helperMocks.nextLabelIndexForController,
  initializeObjectForController: helperMocks.initializeObjectForController,
  refreshActiveToolSettingsPreviewForController:
    helperMocks.refreshActiveToolSettingsPreviewForController,
  rebuildFrameDecorationsForController: helperMocks.rebuildFrameDecorationsForController,
  relayoutSceneForController: helperMocks.relayoutSceneForController,
  scheduleViewportStateSyncForController: helperMocks.scheduleViewportStateSyncForController,
  scheduleZoomToFitForController: helperMocks.scheduleZoomToFitForController,
  sendFrameObjectsToBackForController: helperMocks.sendFrameObjectsToBackForController,
  startDrawSessionForController: helperMocks.startDrawSessionForController,
  switchToSelectToolForController: helperMocks.switchToSelectToolForController,
  syncRuntimeStateForController: helperMocks.syncRuntimeStateForController,
  syncViewportStateForController: helperMocks.syncViewportStateForController,
  withHistoryMutedForController: helperMocks.withHistoryMutedForController,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const testControllerInstances = new WeakMap<object, EditorControllerInstance>();

describe('ImageEditorControllerBase', () => {
  it('routes core instance helpers through the current controller ownership seam', async () => {
    class TestControllerBase extends ImageEditorControllerBase {
      protected getControllerInstance(): EditorControllerInstance {
        const existingInstance = testControllerInstances.get(this);

        if (existingInstance) {
          return existingInstance;
        }

        const instance: EditorControllerInstance = Object.assign(this, {
          applyActiveSettingsToSelection: vi.fn(),
          applyBrowserFrame: vi.fn(async () => undefined),
          applyCropSelection: vi.fn(async () => undefined),
          applyTextSelectionStyle: vi.fn(() => false),
          applyFrameSettings: vi.fn(),
          bringForwardSelection: vi.fn(),
          bringSelectionToFront: vi.fn(),
          cancelCropMode: vi.fn(),
          clearCanvasSizePreview: vi.fn(),
          clearSelection: vi.fn(),
          clearCropSelection: vi.fn(),
          clearRasterSelection: vi.fn(),
          closeDocument: vi.fn(),
          copyRenderedImage: vi.fn(async () => undefined),
          deleteSelection: vi.fn(),
          dispose: vi.fn(),
          duplicateSelection: vi.fn(async () => undefined),
          finalizeSelectionNudge: vi.fn(),
          insertImage: vi.fn(async () => undefined),
          insertTechnicalData: vi.fn(),
          applyLayerEffect: vi.fn(async () => undefined),
          applyLayerTransformation: vi.fn(async () => undefined),
          loadDocument: vi.fn(async () => undefined),
          mergeSelectedLayers: vi.fn(async () => undefined),
          mount: vi.fn(),
          navigateViewportTo: vi.fn(),
          nudgeSelection: vi.fn(() => true),
          openImage: vi.fn(async () => undefined),
          previewBrowserFrame: vi.fn(async () => undefined),
          previewCanvasSize: vi.fn(),
          previewLayerEffect: vi.fn(),
          previewRemoveBrowserFrame: vi.fn(async () => undefined),
          redo: vi.fn(async () => undefined),
          removeBrowserFrame: vi.fn(async () => undefined),
          reorderLayer: vi.fn(),
          resetToOriginal: vi.fn(async () => undefined),
          resetZoom: vi.fn(),
          resetLayerEffectPreview: vi.fn(),
          renameLayer: vi.fn(),
          removeLayerEffect: vi.fn(),
          renderRasterOverlay: vi.fn(),
          resizeCanvas: vi.fn(),
          resizeImage: vi.fn(),
          resizeLayer: vi.fn(),
          selectLayer: vi.fn(),
          sendBackwardSelection: vi.fn(),
          sendSelectionToBack: vi.fn(),
          setActiveTool: vi.fn(),
          setCropSelectionMouseEnabled: vi.fn(),
          subscribeRasterOverlay: vi.fn(() => () => undefined),
          suspendToolMode: vi.fn(),
          setZoom: vi.fn(),
          setZoomAtViewportPoint: vi.fn(),
          toggleLayerLock: vi.fn(),
          toggleLayerVisibility: vi.fn(),
          undo: vi.fn(async () => undefined),
          applyRasterBitmap: vi.fn(async () => undefined),
          updateLayerEffect: vi.fn(async () => undefined),
          zoomIn: vi.fn(),
          zoomOut: vi.fn(),
        });
        testControllerInstances.set(this, instance);
        return instance;
      }

      exportDocument(): EditorDocument {
        return { version: 1 } as EditorDocument;
      }

      renderToDataUrl(_options: EditorRenderToDataUrlOptions): string {
        return 'data:image/png;base64,base';
      }

      zoomToFit(): void {}

      clearCropSelection(): void {}
    }

    const controller = new TestControllerBase();
    expect(controller.viewportDevicePixelRatioBaseline).toBe(1);
    expect(controller.magnetManager).toBeNull();
    const object = { kind: 'object' } as unknown as FabricObject;
    const point = { x: 1, y: 2 } as Point;
    const frame = { preset: 'frame' } as unknown as EditorFrameSettings;
    const browserFrame = { enabled: true } as BrowserFrameState;
    const document = { version: 1 } as EditorDocument;
    const drawSession = { tool: 'arrow' } as DrawSession;
    const cropGuide = { kind: 'crop' } as unknown as Rect;
    const cropSelection = { kind: 'selection' } as unknown as CropSelection;
    const panSession = { kind: 'pan' } as unknown as PanSession;
    const source = { kind: 'source' } as unknown as SourceState;

    controller.canvasDocumentSize = { height: 40, width: 30 };
    controller.source = source;
    controller.history = { push: vi.fn() } as never;
    controller.drawSession = drawSession;
    controller.cropGuide = cropGuide;
    controller.cropSelection = cropSelection;
    controller.panSession = panSession;

    controller.getPublicApiAdapter();
    controller.applyGridSnap(object);
    controller.buildViewportState();
    controller.syncViewportState();
    controller.scheduleViewportStateSync();
    controller.cancelTransientInteraction();
    controller.startDrawSession('arrow', point, object);
    controller.getActiveCropRect();
    controller.decorateShape(object, 'rectangle');
    controller.addObject(object);
    controller.moveSelection(1);
    controller.moveSelectionToEdge('front');
    controller.logBrowserFrame('frame:debug');
    controller.ensureBrowserFrameOnTop();
    controller.relayoutScene(frame, browserFrame);
    controller.prepareObject(object);
    await controller.applyDocument(document, {} as ApplyDocumentOptions);
    await controller.rebuildFrameDecorations();
    controller.sendFrameObjectsToBack();
    controller.ensureObjectReachable(object);
    controller.ensureReachableObjects();
    controller.focusObjectInViewport(object);
    controller.withHistoryMuted(() => 'muted');
    controller.commitHistory();
    controller.scheduleZoomToFit();
    controller.syncRuntimeState();
    controller.applyToolMode();
    controller.refreshActiveToolSettingsPreview();
    controller.switchToSelectTool();
    controller.nextLabelIndex('rectangle');
    controller.advanceStepValue();

    expect(helperMocks.createEditorControllerEventBindings).toHaveBeenCalledOnce();
    expect(helperMocks.createEditorControllerPublicApiAdapter).toHaveBeenCalledOnce();
    expect(helperMocks.applyGridSnapForController).toHaveBeenCalledWith(controller, object);
    expect(helperMocks.buildViewportStateForController).toHaveBeenCalledWith(controller);
    expect(helperMocks.scheduleViewportStateSyncForController).toHaveBeenCalledWith(controller);
    expect(helperMocks.startDrawSessionForController).toHaveBeenCalledWith(
      controller,
      'arrow',
      point,
      object
    );
    expect(helperMocks.decorateShapeForController).toHaveBeenCalledWith(
      controller,
      object,
      'rectangle'
    );
    expect(helperMocks.applyDocumentForController).toHaveBeenCalledWith(controller, document, {});
    expect(helperMocks.refreshActiveToolSettingsPreviewForController).toHaveBeenCalledWith(
      controller
    );
    expect(helperMocks.withHistoryMutedForController).toHaveBeenCalled();
    expect(helperMocks.nextLabelIndexForController).toHaveBeenCalledWith(controller, 'rectangle');
    expect(helperMocks.advanceStepValueForController).toHaveBeenCalledOnce();
  });
});

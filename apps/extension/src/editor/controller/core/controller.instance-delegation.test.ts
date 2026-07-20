import { beforeEach, expect, it, vi } from 'vitest';
import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import { helperMocks } from './controller.instance-delegation.test-support';
import { createImageEditorController } from './controller';

beforeEach(() => {
  vi.clearAllMocks();
});

function createInertElement<T extends HTMLElement>(): T {
  return { nodeType: 1 } as T;
}

function createControllerScenario() {
  return {
    browserFrame: { enabled: true } as BrowserFrameState,
    controller: createImageEditorController(),
    editorDocument: { version: 1 } as EditorDocument,
    frame: { preset: 'frame' } as unknown as EditorFrameSettings,
  };
}

async function exerciseDocumentDelegates(controller: any, editorDocument: EditorDocument) {
  controller.mount(
    createInertElement<HTMLCanvasElement>(),
    createInertElement<HTMLDivElement>(),
    createInertElement<HTMLDivElement>()
  );
  controller.dispose();
  await controller.openImage('data:image/png;base64,open', 'open.png');
  await controller.loadDocument(editorDocument);
  controller.closeDocument();
  controller.exportDocument();
  controller.renderToDataUrl({ format: 'png', quality: 0.9 });
  await controller.copyRenderedImage();
}

async function exerciseSelectionDelegates(controller: any) {
  controller.setActiveTool('crop');
  controller.clearSelection();
  controller.suspendToolMode();
  controller.applyActiveSettingsToSelection();
  controller.previewActiveSettingsOnSelection();
  controller.applyTextSelectionStyle('italic');
  await controller.undo();
  await controller.redo();
  await controller.resetToOriginal();
  controller.deleteSelection();
  await controller.duplicateSelection();
  controller.nudgeSelection({ code: 'ArrowRight', deltaX: 1, deltaY: 0, step: 1 });
  controller.finalizeSelectionNudge('ArrowRight');
  controller.bringForwardSelection();
  controller.sendBackwardSelection();
  controller.bringSelectionToFront();
  controller.sendSelectionToBack();
  controller.reorderLayer('dragged', 'target');
  controller.selectLayer('layer-1', { focusViewport: true, toggle: true });
  controller.renameLayer('layer-1', 'Renamed');
  controller.toggleLayerVisibility('layer-1');
  controller.toggleLayerLock('layer-1');
  controller.resizeLayer('layer-1', 100, 200);
  await controller.mergeSelectedLayers();
  await controller.applyLayerEffect('layer-1', {
    amount: 0.4,
    enabled: true,
    id: 'brightness',
  });
  await controller.updateLayerEffect('layer-1', { amount: 0.4, enabled: true, id: 'brightness' });
  controller.removeLayerEffect('layer-1', 'brightness');
  await controller.applyLayerTransformation('layer-1', 'rotate-left');
  await controller.insertImage('data:image/png;base64,inserted', 'inserted.png');
  controller.insertRichShape('block-arrow');
  controller.insertRichShape('custom-badge', { customDefinition: { id: 'custom-badge' } });
  controller.insertTechnicalData(['url']);
}

async function exerciseSceneDelegates(
  controller: any,
  frame: EditorFrameSettings,
  browserFrame: BrowserFrameState
) {
  controller.resizeCanvas(1000, 800);
  controller.resizeImage(800, 600);
  controller.applyFrameSettings(frame);
  await controller.applyBrowserFrame(browserFrame);
  await controller.previewBrowserFrame(browserFrame);
  await controller.removeBrowserFrame();
  await controller.previewRemoveBrowserFrame();
  controller.zoomIn();
  controller.zoomOut();
  controller.zoomToFit();
  controller.resetZoom();
  controller.setZoom(1.5);
  controller.navigateViewportTo(0.25, 0.75);
  controller.clearCropSelection();
  controller.cancelCropMode();
  await controller.applyCropSelection();
}

function expectDocumentDelegates(controller: any, editorDocument: EditorDocument) {
  expect(helperMocks.mountEditorController).toHaveBeenCalledOnce();
  expect(helperMocks.disposeEditorController).toHaveBeenCalledOnce();
  expect(helperMocks.openImageForController).toHaveBeenCalledWith(
    controller,
    'data:image/png;base64,open',
    'open.png',
    {}
  );
  expect(helperMocks.loadDocumentForController).toHaveBeenCalledWith(controller, editorDocument);
  expect(helperMocks.exportDocumentForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.renderToDataUrlForController).toHaveBeenCalledWith(controller, {
    format: 'png',
    quality: 0.9,
  });
  expect(helperMocks.copyRenderedImageForController).toHaveBeenCalledWith(controller, undefined);
}

function expectSelectionDelegates(controller: any) {
  expectSelectionCoreDelegates(controller);
  expectSelectionLayerDelegates(controller);
  expectSelectionInsertionDelegates(controller);
}

function expectSelectionCoreDelegates(controller: any) {
  for (const mock of [
    helperMocks.clearSelectionForController,
    helperMocks.suspendToolModeForController,
    helperMocks.applySelectionSettingsForController,
    helperMocks.previewSelectionSettingsForController,
    helperMocks.deleteSelectionForController,
    helperMocks.resizeCanvasForController,
    helperMocks.resizeImageForController,
    helperMocks.mergeSelectedLayersForController,
  ]) {
    expect(mock).toHaveBeenCalled();
  }
  expect(helperMocks.setActiveToolForController).toHaveBeenCalledWith(controller, 'crop');
  expect(helperMocks.applyTextSelectionStyleForController).toHaveBeenCalledWith(
    controller,
    'italic'
  );
  expect(helperMocks.nudgeSelectionForController).toHaveBeenCalledWith(controller, {
    code: 'ArrowRight',
    deltaX: 1,
    deltaY: 0,
    step: 1,
  });
  expect(helperMocks.finalizeSelectionNudgeForController).toHaveBeenCalledWith(
    controller,
    'ArrowRight'
  );
  expect(helperMocks.bringForwardSelectionForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.sendBackwardSelectionForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.bringSelectionToFrontForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.sendSelectionToBackForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.selectLayerForController).toHaveBeenCalledWith(controller, 'layer-1', {
    focusViewport: true,
    toggle: true,
  });
  expect(helperMocks.renameLayerForController).toHaveBeenCalledWith(
    controller,
    'layer-1',
    'Renamed'
  );
}

function expectSelectionLayerDelegates(controller: any) {
  expect(helperMocks.applyLayerEffectForController).toHaveBeenCalledWith(controller, 'layer-1', {
    amount: 0.4,
    enabled: true,
    id: 'brightness',
  });
  expect(helperMocks.updateLayerEffectForController).toHaveBeenCalledWith(controller, 'layer-1', {
    amount: 0.4,
    enabled: true,
    id: 'brightness',
  });
  expect(helperMocks.removeLayerEffectForController).toHaveBeenCalledWith(
    controller,
    'layer-1',
    'brightness'
  );
  expect(helperMocks.applyLayerTransformationForController).toHaveBeenCalledWith(
    controller,
    'layer-1',
    'rotate-left'
  );
}

function expectSelectionInsertionDelegates(controller: any) {
  expect(helperMocks.insertRichShapeForController).toHaveBeenCalledWith(
    controller,
    'block-arrow',
    undefined
  );
  expect(helperMocks.insertRichShapeForController).toHaveBeenCalledWith(
    controller,
    'custom-badge',
    { customDefinition: { id: 'custom-badge' } }
  );
  expect(helperMocks.insertTechnicalDataForController).toHaveBeenCalledWith(
    controller,
    ['url'],
    'column'
  );
}

function expectSceneDelegates(
  controller: any,
  frame: EditorFrameSettings,
  browserFrame: BrowserFrameState
) {
  expect(helperMocks.applyFrameSettingsForController).toHaveBeenCalledWith(controller, frame);
  expect(helperMocks.applyBrowserFrameForController).toHaveBeenCalledWith(controller, browserFrame);
  expect(helperMocks.previewBrowserFrameForController).toHaveBeenCalledWith(
    controller,
    browserFrame
  );
  expect(helperMocks.removeBrowserFrameForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.zoomInForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.zoomOutForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.scheduleZoomToFitForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.resetZoomForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.setZoomForController).toHaveBeenCalledWith(controller, 1.5);
  expect(helperMocks.navigateViewportForController).toHaveBeenCalledWith(controller, 0.25, 0.75);
  expect(helperMocks.clearCropSelectionForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.cancelCropModeForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.applyCropSelectionForController).toHaveBeenCalledWith(controller);
}

it('creates a page-owned controller instance that delegates all public actions', async () => {
  const { browserFrame, controller, editorDocument, frame } = createControllerScenario();

  await exerciseDocumentDelegates(controller, editorDocument);
  await exerciseSelectionDelegates(controller);
  await exerciseSceneDelegates(controller, frame, browserFrame);

  expectDocumentDelegates(controller, editorDocument);
  expectSelectionDelegates(controller);
  expectSceneDelegates(controller, frame, browserFrame);
}, 15000);

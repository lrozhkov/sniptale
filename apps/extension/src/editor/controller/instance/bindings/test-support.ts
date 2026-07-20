import { expect } from 'vitest';
import type { FabricObject } from 'fabric';
import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';
import type { EditorControllerInstance } from '../types';
import type { createEditorControllerPublicApiAdapter } from '../../public-api/bindings/factory';
import { getExpectedLabelIndexType } from './test-fixtures';

export function exercisePublicApiMethods(params: {
  adapter: ReturnType<typeof createEditorControllerPublicApiAdapter>;
  browserFrame: BrowserFrameState;
  document: EditorDocument;
  frame: EditorFrameSettings;
  object: FabricObject;
}) {
  params.adapter.prepareObject(params.object);
  params.adapter.nextLabelIndex(getExpectedLabelIndexType());
  params.adapter.ensureObjectReachable(params.object);
  params.adapter.focusObjectInViewport(params.object);
  params.adapter.ensureReachableObjects();
  void params.adapter.rebuildFrameDecorations();
  params.adapter.sendFrameObjectsToBack();
  params.adapter.ensureBrowserFrameOnTop();
  params.adapter.logBrowserFrame('test', { ok: true });
  params.adapter.relayoutScene(params.frame, params.browserFrame, { preserveCanvasSize: true });
  params.adapter.scheduleZoomToFit();
  void params.adapter.applyDocument(params.document, { resetHistory: true });
  params.adapter.renderToDataUrl({ format: 'png', quality: 0.8 });
  void params.adapter.copyRenderedImage({ outputSize: { width: 320, height: 180 } });
  params.adapter.switchToSelectTool();
  params.adapter.clearCropSelection();
}

export function expectPublicApiMethodCalls(params: {
  controller: EditorControllerInstance;
  browserFrame: BrowserFrameState;
  document: EditorDocument;
  frame: EditorFrameSettings;
  object: FabricObject;
}) {
  expect(params.controller.prepareObject).toHaveBeenCalledWith(params.object);
  expect(params.controller.nextLabelIndex).toHaveBeenCalledWith(getExpectedLabelIndexType());
  expect(params.controller.ensureObjectReachable).toHaveBeenCalledWith(params.object);
  expect(params.controller.focusObjectInViewport).toHaveBeenCalledWith(params.object);
  expect(params.controller.ensureReachableObjects).toHaveBeenCalled();
  expect(params.controller.rebuildFrameDecorations).toHaveBeenCalled();
  expect(params.controller.sendFrameObjectsToBack).toHaveBeenCalled();
  expect(params.controller.ensureBrowserFrameOnTop).toHaveBeenCalled();
  expect(params.controller.logBrowserFrame).toHaveBeenCalledWith('test', { ok: true });
  expect(params.controller.relayoutScene).toHaveBeenCalledWith(params.frame, params.browserFrame, {
    preserveCanvasSize: true,
  });
  expect(params.controller.scheduleZoomToFit).toHaveBeenCalled();
  expect(params.controller.applyDocument).toHaveBeenCalledWith(params.document, {
    resetHistory: true,
  });
  expect(params.controller.renderToDataUrl).toHaveBeenCalledWith({ format: 'png', quality: 0.8 });
  expect(params.controller.copyRenderedImage).toHaveBeenCalledWith({
    outputSize: { height: 180, width: 320 },
  });
  expect(params.controller.switchToSelectTool).toHaveBeenCalled();
  expect(params.controller.clearCropSelection).toHaveBeenCalled();
}

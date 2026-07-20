import type { FabricObject } from 'fabric';
import { useEditorStore } from '../../../state/useEditorStore';
import type { BrowserFrameState } from '../../../../features/editor/document/types';
import { applyEditorBrowserFrameSettings } from '../../public-actions';
import type { EditorBrowserFrameApi } from './contracts';
import { createEditorSceneStoreBridge } from './store';

function createBrowserFrameRelayout(controller: Pick<EditorBrowserFrameApi, 'relayoutScene'>) {
  return (
    nextBrowserFrame: BrowserFrameState,
    options?: {
      canvasSize?: { width: number; height: number };
      sourceSize?: { width: number; height: number };
      preserveCanvasSize?: boolean;
      fitSourceToContent?: boolean;
    }
  ) => {
    const frame = useEditorStore.getState().frame;
    controller.relayoutScene(frame, nextBrowserFrame, options);
  };
}

function createEditorBrowserFrameArgs(controller: EditorBrowserFrameApi) {
  return {
    canvas: controller.canvas,
    source: controller.source,
    store: createEditorSceneStoreBridge(),
    canvasDocumentSize: controller.canvasDocumentSize,
    zoomLevel: controller.zoomLevel,
    viewportDevicePixelRatioBaseline: controller.viewportDevicePixelRatioBaseline,
    relayoutScene: createBrowserFrameRelayout(controller),
    prepareObject: (object: FabricObject) => controller.prepareObject(object),
    nextLabelIndex: (type: 'browser-frame') => controller.nextLabelIndex(type),
    ensureBrowserFrameOnTop: () => controller.ensureBrowserFrameOnTop(),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  };
}

export async function applyEditorControllerBrowserFrame(
  controller: EditorBrowserFrameApi,
  browserFrame: BrowserFrameState
): Promise<void> {
  await applyEditorBrowserFrameSettings({
    browserFrame,
    ...createEditorBrowserFrameArgs(controller),
  });
}

export async function previewEditorControllerBrowserFrame(
  _controller: object,
  _browserFrame: BrowserFrameState
): Promise<void> {
  return;
}

export async function removeEditorControllerBrowserFrame(_controller: object): Promise<void> {
  return;
}

export async function previewRemoveEditorControllerBrowserFrame(
  _controller: object
): Promise<void> {
  return;
}

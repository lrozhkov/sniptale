import type { FabricObject } from 'fabric';
import { useEditorStore } from '../../../state/useEditorStore';
import type { BrowserFrameState } from '../../../../features/editor/document/types';
import {
  applyEditorBrowserFrameSettings,
  removeEditorBrowserFrameSettings,
} from '../../public-actions';
import type { EditorBrowserFrameApi } from './contracts';
import { createEditorSceneStoreBridge } from './store';
import { getSourceObject } from '../../document/layers';
import { enqueueEditorSceneMutation } from './scene-mutation-queue';

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

function createEditorBrowserFrameArgs(controller: EditorBrowserFrameApi, token: number) {
  return {
    isMutationCurrent: () => controller.isLayerMutationTokenCurrent(token),
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

function enqueueBrowserFrameIntent(
  controller: EditorBrowserFrameApi,
  operation: (args: ReturnType<typeof createEditorBrowserFrameArgs>) => Promise<void>
): Promise<void> {
  const canvas = controller.canvas;
  const sourceObject = getSourceObject(canvas);
  const token = controller.createLayerMutationToken();
  return enqueueEditorSceneMutation(canvas, async () => {
    if (
      controller.canvas !== canvas ||
      canvas?.disposed ||
      canvas?.destroyed ||
      getSourceObject(canvas) !== sourceObject ||
      !controller.isLayerMutationTokenCurrent(token)
    )
      return;
    const args = createEditorBrowserFrameArgs(controller, token);
    const tokenIsCurrent = args.isMutationCurrent;
    args.isMutationCurrent = () =>
      controller.canvas === canvas &&
      !canvas?.disposed &&
      !canvas?.destroyed &&
      getSourceObject(canvas) === sourceObject &&
      tokenIsCurrent();
    await operation(args);
  });
}

export async function applyEditorControllerBrowserFrame(
  controller: EditorBrowserFrameApi,
  browserFrame: BrowserFrameState
): Promise<void> {
  await enqueueBrowserFrameIntent(controller, (args) =>
    applyEditorBrowserFrameSettings({ browserFrame, ...args })
  );
}

export async function previewEditorControllerBrowserFrame(
  controller: EditorBrowserFrameApi,
  _browserFrame: BrowserFrameState
): Promise<void> {
  await enqueueEditorSceneMutation(controller.canvas, async () => undefined);
}

export async function removeEditorControllerBrowserFrame(
  controller: EditorBrowserFrameApi
): Promise<void> {
  await enqueueBrowserFrameIntent(controller, removeEditorBrowserFrameSettings);
}

export async function previewRemoveEditorControllerBrowserFrame(
  controller: EditorBrowserFrameApi
): Promise<void> {
  await enqueueEditorSceneMutation(controller.canvas, async () => undefined);
}

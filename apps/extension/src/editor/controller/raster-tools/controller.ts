import { buildRasterizedSourceState } from '../layer-effects/rasterize';
import { applyRasterBitmapToTarget } from '../raster/object';
import { renderEditorRasterOverlay } from './overlay';
import type { Canvas, FabricObject } from 'fabric';
import {
  copyRasterSelectionToClipboard,
  cutRasterSelectionToClipboard,
  deleteRasterSelectionPixels,
  pasteRasterClipboardImage,
} from './clipboard';
import { clearEditorRasterSelection, subscribeEditorRasterOverlay } from './session';
import type { EditorRasterTargetReference } from '../raster/types';
import type { EditorRasterToolSessionState } from './types';

interface RasterToolControllerLike {
  canvas: Canvas | null;
  rasterToolSession: EditorRasterToolSessionState;
  layerMutationToken: number;
  source: import('../../document/model/source-state').SourceState | null;
  nextLabelIndex(type: 'image'): number;
  prepareObject(object: FabricObject): void;
  sendFrameObjectsToBack(): void;
  commitHistory(): void;
  syncRuntimeState(): void;
}

export function clearRasterSelectionForController(controller: RasterToolControllerLike): void {
  clearEditorRasterSelection(controller.rasterToolSession);
}

export function subscribeRasterOverlayForController(
  controller: RasterToolControllerLike,
  listener: () => void
): () => void {
  return subscribeEditorRasterOverlay(controller.rasterToolSession, listener);
}

export function renderRasterOverlayForController(
  controller: RasterToolControllerLike,
  context: CanvasRenderingContext2D,
  size: { width: number; height: number }
): void {
  renderEditorRasterOverlay({
    canvas: controller.canvas,
    context,
    session: controller.rasterToolSession,
    size,
  });
}

export async function applyRasterBitmapForController(
  controller: RasterToolControllerLike,
  reference: EditorRasterTargetReference,
  bitmap: HTMLCanvasElement
): Promise<void> {
  await applyRasterBitmapToTarget({
    context: {
      canvas: controller.canvas,
      prepareObject: (object) => controller.prepareObject(object),
      sendFrameObjectsToBack: () => controller.sendFrameObjectsToBack(),
      commitHistory: () => controller.commitHistory(),
      syncRuntimeState: () => controller.syncRuntimeState(),
      createLayerMutationToken: () => {
        controller.layerMutationToken += 1;
        return controller.layerMutationToken;
      },
      isLayerMutationTokenCurrent: (token) => controller.layerMutationToken === token,
      setSourceFromObject: (object) => {
        controller.source = buildRasterizedSourceState(controller.source, object);
      },
    },
    reference,
    bitmap,
  });
}

function createRasterClipboardController(controller: RasterToolControllerLike) {
  return {
    canvas: controller.canvas,
    rasterToolSession: controller.rasterToolSession,
    source: controller.source,
    nextLabelIndex: (type: 'image') => controller.nextLabelIndex(type),
    prepareObject: (object: FabricObject) => controller.prepareObject(object),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
    applyRasterBitmap: (reference: EditorRasterTargetReference, bitmap: HTMLCanvasElement) =>
      applyRasterBitmapForController(controller, reference, bitmap),
  };
}

export async function copyRasterSelectionForController(
  controller: RasterToolControllerLike
): Promise<boolean> {
  return await copyRasterSelectionToClipboard(createRasterClipboardController(controller));
}

export async function cutRasterSelectionForController(
  controller: RasterToolControllerLike
): Promise<boolean> {
  return await cutRasterSelectionToClipboard(createRasterClipboardController(controller));
}

export async function deleteRasterSelectionForController(
  controller: RasterToolControllerLike
): Promise<boolean> {
  return await deleteRasterSelectionPixels(createRasterClipboardController(controller));
}

export async function pasteRasterClipboardForController(
  controller: RasterToolControllerLike
): Promise<boolean> {
  return await pasteRasterClipboardImage(createRasterClipboardController(controller));
}

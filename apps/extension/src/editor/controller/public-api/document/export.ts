import { useEditorStore } from '../../../state/useEditorStore';
import {
  buildEditorCanvasDocument,
  copyEditorRenderedImage,
  renderEditorCanvasToDataUrl,
  resolveEditorImageMimeType,
} from '../../document/export';
import { getSourceObject } from '../../document/layers';
import { syncSourceStateFromObject } from '../../document/source';
import type {
  EditorRenderedImageOptions,
  EditorRenderToDataUrlOptions,
} from '../../../document/model/render-options';
import type { EditorDocument } from '../../../../features/editor/document/types';
import { loadEditorExportSettings } from '../../../persistence/export-settings';
import type { Canvas } from 'fabric';

import type { SourceState } from '../../../document/model/source-state';
import type { EditorControllerDocumentSize } from '../../instance/types/shared';

/**
 * Controller surface required to sync and export the editable document.
 */
export interface EditorDocumentExportControllerApi {
  canvas: Canvas | null;
  canvasDocumentSize: EditorControllerDocumentSize;
  setSource: (source: SourceState | null) => void;
  source: SourceState | null;
}

/**
 * Controller surface required to render the current canvas to an image data URL.
 */
export interface EditorDocumentRenderControllerApi {
  canvas: Canvas | null;
}

/**
 * Controller surface required to copy the rendered editor image.
 */
export interface EditorDocumentCopyControllerApi {
  renderToDataUrl: (options: EditorRenderToDataUrlOptions) => string;
}

export function exportEditorDocumentViaController(
  controller: EditorDocumentExportControllerApi
): EditorDocument {
  controller.setSource(
    syncSourceStateFromObject(controller.source, getSourceObject(controller.canvas))
  );

  return buildEditorCanvasDocument({
    canvas: controller.canvas,
    source: controller.source,
    canvasDocumentSize: controller.canvasDocumentSize,
    frame: useEditorStore.getState().frame,
    browserFrame: useEditorStore.getState().browserFrame,
  });
}

export function renderEditorControllerToDataUrl(
  controller: EditorDocumentRenderControllerApi,
  options: EditorRenderToDataUrlOptions
): string {
  return renderEditorCanvasToDataUrl(controller.canvas, options);
}

export async function copyRenderedEditorImageViaController(
  controller: EditorDocumentCopyControllerApi,
  options: EditorRenderedImageOptions = {}
): Promise<void> {
  const settings = await loadEditorExportSettings();

  await copyEditorRenderedImage({
    dataUrl: controller.renderToDataUrl({
      format: settings.imageFormat,
      quality: settings.imageQuality,
      ...options,
    }),
    mimeType: resolveEditorImageMimeType(settings.imageFormat),
  });
}

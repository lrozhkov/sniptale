import type { Canvas } from 'fabric';
import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import {
  resolveBrowserClipboardImageMimeType,
  writeBrowserClipboardItems,
} from '@sniptale/platform/browser/clipboard';
import { translate } from '../../../platform/i18n';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { normalizeEditorFrameSettings } from '../../../features/editor/document/constants';
import { collectRichShapeDocumentObjects, serializeCanvasObjects } from './';
import type {
  EditorRenderedImageSize,
  EditorRenderToDataUrlOptions,
} from '../../document/model/render-options';

import type { SourceState } from '../../document/model/source-state';

export function buildEditorCanvasDocument(options: {
  canvas: Canvas | null;
  source: SourceState | null;
  canvasDocumentSize: { width: number; height: number };
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
}): EditorDocument {
  if (!options.canvas || !options.source) {
    throw new Error(translate('editor.runtime.editorNotInitialized'));
  }

  return {
    version: 1,
    sourceImageData: options.source.dataUrl,
    sourceName: options.source.name,
    sourceWidth: options.source.intrinsicWidth,
    sourceHeight: options.source.intrinsicHeight,
    canvasWidth: options.canvasDocumentSize.width,
    canvasHeight: options.canvasDocumentSize.height,
    sourceLeft: options.source.left,
    sourceTop: options.source.top,
    sourceDisplayWidth: options.source.displayWidth,
    sourceDisplayHeight: options.source.displayHeight,
    frame: normalizeEditorFrameSettings(options.frame),
    browserFrame: { ...options.browserFrame },
    canvasJson: serializeCanvasObjects(options.canvas),
    richShapes: collectRichShapeDocumentObjects(options.canvas),
  };
}

function normalizeOutputSize(size: EditorRenderedImageSize): EditorRenderedImageSize {
  return {
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
  };
}

function normalizeQuality(quality: number) {
  const normalizedQuality = quality > 1 ? quality / 100 : quality;
  return Math.max(0, Math.min(1, normalizedQuality));
}

function resolveRenderedCanvasElement(
  canvas: Canvas,
  outputSize?: EditorRenderedImageSize
): HTMLCanvasElement {
  const sourceCanvas = canvas.toCanvasElement(1);
  if (!outputSize) {
    return sourceCanvas;
  }

  const nextSize = normalizeOutputSize(outputSize);
  if (sourceCanvas.width === nextSize.width && sourceCanvas.height === nextSize.height) {
    return sourceCanvas;
  }

  const resizedCanvas = document.createElement('canvas');
  resizedCanvas.width = nextSize.width;
  resizedCanvas.height = nextSize.height;
  resizedCanvas.getContext('2d')?.drawImage(sourceCanvas, 0, 0, nextSize.width, nextSize.height);

  return resizedCanvas;
}

export function renderEditorCanvasToDataUrl(
  canvas: Canvas | null,
  options: EditorRenderToDataUrlOptions
): string {
  if (!canvas) {
    throw new Error(translate('editor.runtime.canvasUnavailable'));
  }

  const activeObject = canvas.getActiveObject();
  canvas.discardActiveObject();
  canvas.renderAll();

  const renderedCanvas = resolveRenderedCanvasElement(canvas, options.outputSize);
  const mimeType = resolveBrowserClipboardImageMimeType(options.format);
  const dataUrl = renderedCanvas.toDataURL(mimeType, normalizeQuality(options.quality));

  if (activeObject) {
    canvas.setActiveObject(activeObject);
  }
  canvas.renderAll();
  return dataUrl;
}

async function createClipboardBlob(dataUrl: string): Promise<Blob> {
  return dataUrlToBlob(dataUrl);
}

export async function copyEditorRenderedImage(options: {
  dataUrl: string;
  mimeType: string;
}): Promise<void> {
  const blob = await createClipboardBlob(options.dataUrl);
  await writeBrowserClipboardItems([
    new ClipboardItem({
      [options.mimeType]: blob,
    }),
  ]);
}

export const resolveEditorImageMimeType = resolveBrowserClipboardImageMimeType;

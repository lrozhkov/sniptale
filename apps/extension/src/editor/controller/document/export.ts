import { withEditorVectorAcceptedRendering } from '../../objects/vector-elements/runtime';
import { inspectEditorRasterCanvas } from '../../../features/editor/document/raster-state';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
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
import { collectRichShapeDocumentObjects } from './';
import { captureCanvasObjects } from './serialization';
import { collectEditorVectorDefinitions } from './vector-elements';
import { inspectEditorVectorCanvas } from '../../../features/editor/document/vector-document';
import type {
  EditorRenderedImageSize,
  EditorRenderToDataUrlOptions,
} from '../../document/model/render-options';

import type { SourceState } from '../../document/model/source-state';
import {
  getEditorEditingDocumentSize,
  getEditorWorkspaceMargin,
} from '../../document/canvas-surface/editing-surface';
import { EditorCanvas } from '../../document/canvas-surface/render-region';

export function buildEditorCanvasDocument(options: {
  canvas: Canvas | null;
  source: SourceState | null;
  canvasDocumentSize: { width: number; height: number };
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  displayName?: string;
}): EditorDocument {
  if (!options.canvas || !options.source) {
    throw new Error(translate('editor.runtime.editorNotInitialized'));
  }

  const { enabled: _runtimePresence, ...browserFrame } = options.browserFrame;
  let capturedCanvas: ReturnType<typeof captureCanvasObjects> | null = captureCanvasObjects(
    options.canvas
  );
  let canvasJson: string | undefined;
  const raster = inspectEditorRasterCanvas(
    capturedCanvas,
    (value, kind): value is string =>
      isImageDataUrl(value) && (kind === 'image' || value.startsWith('data:image/png;'))
  );
  const vectorDefinitions = collectEditorVectorDefinitions(options.canvas);
  const vectors = inspectEditorVectorCanvas(
    capturedCanvas,
    new Set(Object.keys(vectorDefinitions))
  );
  if (!vectors.valid) throw new Error('Invalid editor vector metadata');
  if (!raster.valid) throw new Error('Invalid editor raster metadata');
  return {
    version: vectors.hasVectors ? 4 : raster.hasRaster ? 3 : 2,
    ...(vectors.hasVectors ? { vectorDefinitions } : {}),
    sourceImageData: options.source.dataUrl,
    sourceName: options.source.name,
    ...(options.displayName === undefined ? {} : { displayName: options.displayName }),
    sourceWidth: options.source.intrinsicWidth,
    sourceHeight: options.source.intrinsicHeight,
    canvasWidth: options.canvasDocumentSize.width,
    canvasHeight: options.canvasDocumentSize.height,
    sourceLeft: options.source.left,
    sourceTop: options.source.top,
    sourceDisplayWidth: options.source.displayWidth,
    sourceDisplayHeight: options.source.displayHeight,
    frame: normalizeEditorFrameSettings(options.frame),
    browserFrame,
    ...(options.source.compositionBase
      ? { compositionBase: { ...options.source.compositionBase } }
      : {}),
    get canvasJson() {
      if (canvasJson === undefined) {
        canvasJson = JSON.stringify(capturedCanvas);
        capturedCanvas = null;
      }
      return canvasJson;
    },
    set canvasJson(value: string) {
      canvasJson = value;
      capturedCanvas = null;
    },
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
  const cropGuides = canvas.getObjects().filter((object) => object.sniptaleRole === 'crop-guide');
  const visibility = cropGuides.map((object) => object.visible);
  cropGuides.forEach((object) => {
    object.visible = false;
  });
  let sourceCanvas: HTMLCanvasElement;
  try {
    const documentSize = getEditorEditingDocumentSize(canvas);
    const margin = documentSize ? getEditorWorkspaceMargin(documentSize) : 0;
    sourceCanvas = withEditorVectorAcceptedRendering(canvas.getObjects(), () =>
      canvas instanceof EditorCanvas && canvas.hasVirtualViewport
        ? canvas.renderDocumentCanvas(
            documentSize && outputSize
              ? Math.min(
                  normalizeOutputSize(outputSize).width / documentSize.width,
                  normalizeOutputSize(outputSize).height / documentSize.height
                )
              : 1
          )
        : documentSize
          ? canvas.toCanvasElement(1, {
              left: margin,
              top: margin,
              width: documentSize.width,
              height: documentSize.height,
            })
          : canvas.toCanvasElement(1)
    );
  } finally {
    cropGuides.forEach((object, index) => {
      object.visible = visibility[index] ?? true;
    });
  }
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

  const renderedCanvas = resolveRenderedCanvasElement(canvas, options.outputSize);
  const mimeType = resolveBrowserClipboardImageMimeType(options.format);
  return renderedCanvas.toDataURL(mimeType, normalizeQuality(options.quality));
}

/** Encodes a detached render asynchronously so preview saves do not stall editor input. */
export async function renderEditorCanvasToBlob(
  canvas: Canvas | null,
  options: EditorRenderToDataUrlOptions
): Promise<Blob> {
  options.signal?.throwIfAborted();
  if (!canvas) throw new Error(translate('editor.runtime.canvasUnavailable'));
  const renderedCanvas = resolveRenderedCanvasElement(canvas, options.outputSize);
  const mimeType = resolveBrowserClipboardImageMimeType(options.format);
  return new Promise<Blob>((resolve, reject) => {
    const onAbort = () => reject(options.signal?.reason);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const release = () => {
      options.signal?.removeEventListener('abort', onAbort);
      renderedCanvas.width = renderedCanvas.height = 0;
    };
    try {
      renderedCanvas.toBlob(
        (blob) => {
          release();
          if (options.signal?.aborted) reject(options.signal.reason);
          else if (!blob) reject(new Error('Editor image encoding failed'));
          else resolve(blob);
        },
        mimeType,
        normalizeQuality(options.quality)
      );
    } catch (error) {
      release();
      reject(error);
    }
  });
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

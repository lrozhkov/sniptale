import type { Canvas, FabricObject } from 'fabric';
import { blobToDataUrl, dataUrlToBlob } from '../../../../platform/media-utils/data-url';
import { renderEditorCanvasToDataUrl } from '../../document/export';
import { CUSTOM_JSON_PROPS } from '../../../document/model';
import type { EditorRenderToDataUrlOptions } from '../../../document/model/render-options';
import { flushActiveFrameAnnotationDraft } from '../../../frame-annotation/draft-coordinator';
import { collectFrameAnnotationProxies } from '../../../frame-annotation/proxy';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../platform/i18n';
import { rasterizeFrameAnnotations } from '../../../../composition/frame-annotation-raster-client';
import { createRuntimeMessagingTransport } from '../../../../platform/runtime-messaging';

const frameAnnotationRasterTransport = createRuntimeMessagingTransport();
const frameAnnotationExportQueues = new WeakMap<Canvas, Promise<void>>();

export async function renderEditorWithFrameAnnotations(options: {
  canvas: Canvas | null;
  canvasDocumentSize: { width: number; height: number };
  renderOptions: EditorRenderToDataUrlOptions;
}): Promise<string> {
  const canvas = options.canvas;
  if (!canvas) {
    flushActiveFrameAnnotationDraft();
    return renderEditorCanvasToDataUrl(canvas, options.renderOptions);
  }
  return enqueueFrameAnnotationExport(canvas, () =>
    renderEditorWithFrameAnnotationsInTurn({ ...options, canvas })
  );
}

async function renderEditorWithFrameAnnotationsInTurn(options: {
  canvas: Canvas;
  canvasDocumentSize: { width: number; height: number };
  renderOptions: EditorRenderToDataUrlOptions;
}): Promise<string> {
  flushActiveFrameAnnotationDraft();
  const { canvas } = options;
  const entries = collectFrameAnnotationProxies(canvas.getObjects());
  if (entries.length === 0) return renderEditorCanvasToDataUrl(canvas, options.renderOptions);

  const signature = createCanvasVisualSignature(canvas);
  const output = await rasterizeFrameAnnotations({
    transport: frameAnnotationRasterTransport,
    input: {
      baseImage: await renderBaseImage(
        canvas,
        entries.map((entry) => entry.object)
      ),
      width: options.canvasDocumentSize.width,
      height: options.canvasDocumentSize.height,
      snapshots: entries.map((entry) => entry.snapshot),
      ...(options.renderOptions.outputSize
        ? {
            requestedWidth: options.renderOptions.outputSize.width,
            requestedHeight: options.renderOptions.outputSize.height,
          }
        : {}),
    },
    isCurrent: () => createCanvasVisualSignature(canvas) === signature,
  });
  const result = await convertRasterBlob(output.blob, options.renderOptions);
  if (createCanvasVisualSignature(canvas) !== signature) {
    throw new Error('Frame annotation raster result is stale');
  }
  if (output.metadata.downscaled) {
    showToast(translate('highlighter.exportOptimizedSize'), 'warning');
  }
  return result;
}

function enqueueFrameAnnotationExport<T>(canvas: Canvas, operation: () => Promise<T>): Promise<T> {
  const predecessor = frameAnnotationExportQueues.get(canvas) ?? Promise.resolve();
  const work = predecessor.then(operation);
  const settled = work.then(
    () => undefined,
    () => undefined
  );
  frameAnnotationExportQueues.set(canvas, settled);
  return work.finally(() => {
    if (frameAnnotationExportQueues.get(canvas) === settled) {
      frameAnnotationExportQueues.delete(canvas);
    }
  });
}

async function renderBaseImage(canvas: Canvas, proxies: FabricObject[]): Promise<Blob> {
  const visibility = proxies.map((object) => ({ object, visible: object.visible !== false }));
  for (const entry of visibility) entry.object.set({ visible: false });
  try {
    return dataUrlToBlob(renderEditorCanvasToDataUrl(canvas, { format: 'png', quality: 1 }));
  } finally {
    for (const entry of visibility) entry.object.set({ visible: entry.visible });
    canvas.requestRenderAll();
  }
}

const VISUAL_SIGNATURE_PROPS = [
  ...CUSTOM_JSON_PROPS,
  'sniptaleBlurStrokeColor',
  'sniptaleBlurStrokeWidth',
  'sniptaleRichShape',
  'sniptaleRichShapeCatalogId',
] as const;

function createCanvasVisualSignature(canvas: Canvas): string {
  return JSON.stringify({
    backgroundColor: serializeCanvasVisualValue(canvas.backgroundColor),
    backgroundImage: serializeCanvasVisualObject(canvas.backgroundImage),
    clipPath: serializeCanvasVisualObject(canvas.clipPath),
    height: canvas.height,
    objects: canvas.getObjects().map(serializeCanvasVisualObject),
    overlayColor: serializeCanvasVisualValue(canvas.overlayColor),
    overlayImage: serializeCanvasVisualObject(canvas.overlayImage),
    viewportTransform: canvas.viewportTransform,
    width: canvas.width,
  });
}

function serializeCanvasVisualObject(object: FabricObject | undefined): unknown {
  return object?.toObject([...VISUAL_SIGNATURE_PROPS]) ?? null;
}

function serializeCanvasVisualValue(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('toObject' in value)) return value ?? null;
  const toObject = value.toObject;
  return typeof toObject === 'function' ? toObject.call(value) : value;
}

async function convertRasterBlob(
  blob: Blob,
  options: EditorRenderToDataUrlOptions
): Promise<string> {
  if (options.format === 'png') return blobToDataUrl(blob);
  const image = new Image();
  const url = URL.createObjectURL(blob);
  try {
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    const mime = options.format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const quality = options.quality > 1 ? options.quality / 100 : options.quality;
    return canvas.toDataURL(mime, Math.max(0, Math.min(1, quality)));
  } finally {
    URL.revokeObjectURL(url);
  }
}

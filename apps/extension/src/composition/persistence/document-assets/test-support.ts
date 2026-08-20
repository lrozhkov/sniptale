import type { EditorDocument } from '../../../features/editor/document/types';
import type { PersistedEditorDocumentV3 } from './contracts';

export function createPersistedEditorDocumentFixture(
  document: EditorDocument,
  assetId = 'editor-source'
): PersistedEditorDocumentV3 {
  if (document.frame.backgroundImageData || document.browserFrame?.faviconDataUrl) {
    throw new Error('Fixture helper requires explicit assets for optional editor images.');
  }
  const { backgroundImageData: _backgroundImageData, ...frame } = document.frame;
  const browserFrame = document.browserFrame
    ? (() => {
        const { faviconDataUrl: _faviconDataUrl, ...metadata } = document.browserFrame;
        return { ...metadata, favicon: null };
      })()
    : undefined;
  return {
    version: 3,
    sourceImage: { assetId },
    sourceName: document.sourceName,
    sourceWidth: document.sourceWidth,
    sourceHeight: document.sourceHeight,
    canvasWidth: document.canvasWidth,
    canvasHeight: document.canvasHeight,
    sourceLeft: document.sourceLeft,
    sourceTop: document.sourceTop,
    sourceDisplayWidth: document.sourceDisplayWidth,
    sourceDisplayHeight: document.sourceDisplayHeight,
    frame: { ...frame, backgroundImage: null },
    ...(browserFrame ? { browserFrame } : {}),
    canvasJson: document.canvasJson,
    ...(document.richShapes === undefined ? {} : { richShapes: document.richShapes }),
    assets: [{ assetId, role: 'source-image' }],
  };
}

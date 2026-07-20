import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import {
  normalizeBrowserFrameState,
  normalizeEditorFrameSettings,
} from '../../../features/editor/document/constants';
import { normalizeEditorDocumentRichShapes } from '../../../features/editor/document/rich-shape';

import type { SourceState } from '../../document/model/source-state';

export interface PreparedAppliedDocument {
  normalizedDocument: EditorDocument;
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  canvasSize: { width: number; height: number };
  source: SourceState;
}

export function prepareAppliedDocument(document: EditorDocument): PreparedAppliedDocument {
  const frame = normalizeEditorFrameSettings(document.frame);
  const browserFrame = normalizeBrowserFrameState(document.browserFrame, frame);
  const normalizedDocument: EditorDocument = {
    ...document,
    frame,
    browserFrame,
    richShapes: normalizeEditorDocumentRichShapes(document.richShapes),
  };

  return {
    normalizedDocument,
    frame,
    browserFrame,
    canvasSize: {
      width: normalizedDocument.canvasWidth,
      height: normalizedDocument.canvasHeight,
    },
    source: {
      id: 'source-image-layer',
      dataUrl: normalizedDocument.sourceImageData,
      name: normalizedDocument.sourceName,
      intrinsicWidth: normalizedDocument.sourceWidth,
      intrinsicHeight: normalizedDocument.sourceHeight,
      left: normalizedDocument.sourceLeft,
      top: normalizedDocument.sourceTop,
      displayWidth: normalizedDocument.sourceDisplayWidth,
      displayHeight: normalizedDocument.sourceDisplayHeight,
      visible: true,
      locked: true,
    },
  };
}

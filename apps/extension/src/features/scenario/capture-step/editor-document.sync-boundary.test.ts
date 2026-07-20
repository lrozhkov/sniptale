import { expect, it } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../editor/document/constants';
import { syncScenarioCaptureEditorDocumentOverlays } from './editor-document';

function createEditorDocument(canvasJson: string) {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,doc',
    sourceName: null,
    sourceWidth: 320,
    sourceHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson,
  };
}

it('leaves editor documents unchanged when canvas JSON is malformed', () => {
  const document = createEditorDocument('{');

  expect(syncScenarioCaptureEditorDocumentOverlays(document, [])).toBe(document);
});

it('leaves editor documents unchanged when canvas JSON is not an object', () => {
  const document = createEditorDocument('[]');

  expect(syncScenarioCaptureEditorDocumentOverlays(document, [])).toBe(document);
});

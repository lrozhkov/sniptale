import type { EditorRichShapeDocumentObject } from '../../../../features/editor/document/rich-shape';
import type { EditorControllerPublicApiAdapter } from '../../public-api/types';
import {
  applyRichShapeFormattingPatch,
  type EditorRichShapeFormattingPatch,
} from '../../rich-shape-formatting';
import {
  applyRichShapeDocumentObjectToObject,
  exportRichShapeDocumentObject,
  isRichShapeObject,
} from '../../../objects/rich-shape';
import { refreshRichShapeTextEditorForCanvas } from '../../rich-shape-text-editor';
import { isEditableObject } from '../../../document/model';

function getSelectedRichShapeObjects(canvas: EditorControllerPublicApiAdapter['canvas']) {
  return (
    canvas
      ?.getActiveObjects()
      .filter((object) => isEditableObject(object) && !object.sniptaleLocked)
      .filter(isRichShapeObject) ?? []
  );
}

export function getSelectedRichShapeDocumentObject(
  api: Pick<EditorControllerPublicApiAdapter, 'canvas'>
): EditorRichShapeDocumentObject | null {
  const [shape, ...rest] = getSelectedRichShapeObjects(api.canvas);
  if (!shape || rest.length > 0) {
    return null;
  }

  return structuredClone(exportRichShapeDocumentObject(shape));
}

export function updateSelectedRichShapeFormatting(
  api: Pick<
    EditorControllerPublicApiAdapter,
    'canvas' | 'commitHistory' | 'syncRuntimeState' | 'withHistoryMuted'
  >,
  patch: EditorRichShapeFormattingPatch
): boolean {
  const selectedObjects = getSelectedRichShapeObjects(api.canvas);
  if (selectedObjects.length === 0) {
    return false;
  }

  let changed = false;
  api.withHistoryMuted(() => {
    selectedObjects.forEach((object) => {
      const nextShape = applyRichShapeFormattingPatch(exportRichShapeDocumentObject(object), patch);
      changed = applyRichShapeDocumentObjectToObject(object, nextShape) || changed;
    });
    api.canvas?.requestRenderAll();
  });

  if (!changed) {
    return false;
  }

  api.commitHistory();
  api.syncRuntimeState();
  refreshRichShapeTextEditorForCanvas(api.canvas);
  return true;
}

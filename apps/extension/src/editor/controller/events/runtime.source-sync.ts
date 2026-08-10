import { refreshBlurObjectsForSource } from '../../objects/annotation/blur/object';
import { clearLegacyBlurMetadata } from '../../drawing/object/blur';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { syncSourceStateFromObject } from '../document/source';
import type { EditorControllerEventStateBindings } from './types';

type CanvasObject = import('fabric').FabricObject;

export function syncSourceState(
  bindings: EditorControllerEventStateBindings,
  object: CanvasObject
) {
  bindings.setSource(syncSourceStateFromObject(bindings.getSource(), object));
  if (object.sniptaleType === 'source-image') {
    const canvas = bindings.getCanvas();
    refreshBlurObjectsForSource(canvas, bindings.getSource());
    canvas?.getObjects().forEach((candidate) => {
      if (readEditorDrawingObject(candidate)?.kind === 'blur') {
        clearLegacyBlurMetadata(candidate);
      }
    });
  }
}

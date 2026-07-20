import { refreshBlurObjectsForSource } from '../../objects/annotation/blur/object';
import { syncSourceStateFromObject } from '../document/source';
import type { EditorControllerEventStateBindings } from './types';

type CanvasObject = import('fabric').FabricObject;

export function syncSourceState(
  bindings: EditorControllerEventStateBindings,
  object: CanvasObject
) {
  bindings.setSource(syncSourceStateFromObject(bindings.getSource(), object));
  if (object.sniptaleType === 'source-image') {
    refreshBlurObjectsForSource(bindings.getCanvas(), bindings.getSource());
  }
}

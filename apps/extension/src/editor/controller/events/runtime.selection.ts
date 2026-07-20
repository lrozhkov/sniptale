import { isArrowObject, setArrowEditMode } from '../../objects/arrow';
import { isLineObject, setLineEditMode } from '../../objects/line';
import type { EditorControllerEventCommandBindings } from './types';

type CanvasObject = import('fabric').FabricObject;
type SelectionChangeEvent = { deselected?: CanvasObject[]; selected?: CanvasObject[] };

export function createSelectionChangeHandler(
  bindings: Pick<EditorControllerEventCommandBindings, 'syncRuntimeState'>
) {
  return (event?: SelectionChangeEvent) => {
    event?.deselected?.forEach((object) => {
      if (isArrowObject(object) && object.sniptaleArrowEditMode) {
        setArrowEditMode(object, false);
      }
      if (isLineObject(object) && object.sniptaleLineEditMode) {
        setLineEditMode(object, false);
      }
    });
    bindings.syncRuntimeState();
  };
}

import type { EditorControllerEventCommandBindings } from './types';

type CanvasObject = import('fabric').FabricObject;
type SelectionChangeEvent = { deselected?: CanvasObject[]; selected?: CanvasObject[] };

export function createSelectionChangeHandler(
  bindings: Pick<EditorControllerEventCommandBindings, 'syncRuntimeState'>
) {
  return (_event?: SelectionChangeEvent) => {
    bindings.syncRuntimeState();
  };
}

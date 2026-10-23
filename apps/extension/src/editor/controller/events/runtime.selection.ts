import { ActiveSelection } from 'fabric';
import { applyEditorActiveSelectionInteractionControls } from '../document/interaction-controls/apply';
import { applyEditorDrawingActiveSelectionChrome } from '../../drawing/object/controls/apply';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventStateBindings,
} from './types';

type CanvasObject = import('fabric').FabricObject;
type SelectionChangeEvent = { deselected?: CanvasObject[]; selected?: CanvasObject[] };

export function createSelectionChangeHandler(
  bindings: Pick<EditorControllerEventCommandBindings, 'syncRuntimeState'> &
    Pick<EditorControllerEventStateBindings, 'getCanvas'>
) {
  return (_event?: SelectionChangeEvent) => {
    const activeObject = bindings.getCanvas()?.getActiveObject();
    if (activeObject instanceof ActiveSelection) {
      activeObject.controls = ActiveSelection.createControls().controls;
      activeObject.set({ lockScalingX: false, lockScalingY: false });
      applyEditorActiveSelectionInteractionControls(activeObject);
      activeObject.setCoords();
    }
    applyEditorDrawingActiveSelectionChrome(activeObject);
    bindings.syncRuntimeState();
  };
}

import { EditorCanvas } from '../../document/canvas-surface/render-region';
import { ActiveSelection, Point } from 'fabric';
import { applyEditorActiveSelectionInteractionControls } from '../document/interaction-controls/apply';
import { applyEditorDrawingActiveSelectionChrome } from '../../drawing/object/controls/apply';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventStateBindings,
} from './types';

type CanvasObject = import('fabric').FabricObject;
type SelectionChangeEvent = { deselected?: CanvasObject[]; selected?: CanvasObject[] };

function fitProjectedSelection(canvas: EditorCanvas, active: ActiveSelection): void {
  const members = active.getObjects();
  if (!members.some((member) => member.sniptaleType === 'frame-annotation')) return;
  const positions = members.map((object) => object.getXY());
  const boxes = members.map(
    (object) => canvas.getLayerPresentationBounds(object) ?? object.getBoundingRect()
  );
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  active.set({ width: right - left, height: bottom - top });
  active.setPositionByOrigin(new Point(left, top), 'left', 'top');
  members.forEach((object, index) => object.setXY(positions[index]!));
  active.setCoords();
}

export function createSelectionChangeHandler(
  bindings: Pick<EditorControllerEventCommandBindings, 'syncRuntimeState'> &
    Pick<EditorControllerEventStateBindings, 'getCanvas'>
) {
  return (_event?: SelectionChangeEvent) => {
    const canvas = bindings.getCanvas();
    const activeObject = canvas?.getActiveObject();
    if (activeObject instanceof ActiveSelection) {
      if (canvas instanceof EditorCanvas) fitProjectedSelection(canvas, activeObject);
      activeObject.controls = ActiveSelection.createControls().controls;
      activeObject.set({ lockScalingX: false, lockScalingY: false });
      applyEditorActiveSelectionInteractionControls(activeObject);
      activeObject.setCoords();
    }
    applyEditorDrawingActiveSelectionChrome(activeObject);
    bindings.syncRuntimeState();
  };
}

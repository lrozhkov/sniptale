import { ActiveSelection, Group, Path, type FabricObject } from 'fabric';
import { isEditorDrawingSelection, readEditorDrawingObject } from '../metadata';
import { createDrawingArrowControls, syncDrawingArrowControlAnchors } from './arrow';
import { createDrawingBoxControls, createDrawingTextControls } from './box';
import { applyDrawingSelectionChrome } from './chrome';

export function applyEditorDrawingInteractionControls(object: FabricObject): void {
  if (object instanceof Group && object.sniptaleType === 'group') {
    applyDrawingSelectionChrome(object, { controls: !object.sniptaleLocked });
    return;
  }
  const drawing = readEditorDrawingObject(object);
  if (!drawing) return;
  applyDrawingSelectionChrome(object);
  if (drawing.kind === 'arrow' && object instanceof Path) {
    object.controls = createDrawingArrowControls();
    syncDrawingArrowControlAnchors(object, drawing);
    object.set({ hasBorders: false, lockRotation: true, perPixelTargetFind: true });
    object.setCoords();
    return;
  }
  object.controls =
    drawing.kind === 'text' ? createDrawingTextControls(object) : createDrawingBoxControls(object);
  object.setCoords();
}

export function applyEditorDrawingActiveSelectionChrome(object: FabricObject | undefined): void {
  if (!(object instanceof ActiveSelection)) return;
  if (!isEditorDrawingSelection(object)) return;
  applyDrawingSelectionChrome(object, { controls: false });
}

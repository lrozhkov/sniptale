import { ActiveSelection, Path, type FabricObject } from 'fabric';
import { isEditorDrawingSelection, readEditorDrawingObject } from '../metadata';
import { createDrawingArrowControls } from './arrow';
import { createDrawingBoxControls, createDrawingTextControls } from './box';
import { applyDrawingSelectionChrome } from './chrome';

export function applyEditorDrawingInteractionControls(object: FabricObject): void {
  const drawing = readEditorDrawingObject(object);
  if (!drawing) return;
  applyDrawingSelectionChrome(object);
  if (drawing.kind === 'arrow' && object instanceof Path) {
    object.controls = createDrawingArrowControls();
    object.set({ hasBorders: false, lockRotation: true });
    return;
  }
  object.controls =
    drawing.kind === 'text' ? createDrawingTextControls(object) : createDrawingBoxControls(object);
}

export function applyEditorDrawingActiveSelectionChrome(object: FabricObject | undefined): void {
  if (!(object instanceof ActiveSelection)) return;
  if (!isEditorDrawingSelection(object)) return;
  applyDrawingSelectionChrome(object, { controls: false });
}

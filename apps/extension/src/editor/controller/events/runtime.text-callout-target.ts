import { isTextbox } from '../core/helpers';

type CanvasObject = import('fabric').FabricObject;
type TextboxObject = import('fabric').Textbox;

export function isResizableTextCallout(object: CanvasObject): object is TextboxObject {
  return (
    isTextbox(object) && (object.sniptaleType === 'text' || object.sniptaleType === 'meta-stamp')
  );
}

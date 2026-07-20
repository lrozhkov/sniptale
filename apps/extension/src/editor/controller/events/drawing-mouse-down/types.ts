import type { EditorTool as Tool } from '../../../../features/editor/document/types';
import type { FabricObject, TPointerEvent as PointerEvent } from 'fabric';
import type {
  EditorControllerEventCommandBindings as CommandBindings,
  EditorControllerEventCropBindings as CropBindings,
  EditorControllerEventObjectBindings as ObjectBindings,
  EditorControllerEventStateBindings as StateBindings,
} from '../types';

export type Bindings = StateBindings & CropBindings & ObjectBindings & CommandBindings;
export type DrawingTool = Tool;

export type DrawingMouseDownEvent = {
  alreadySelected?: boolean;
  e: PointerEvent;
  target?: FabricObject;
};

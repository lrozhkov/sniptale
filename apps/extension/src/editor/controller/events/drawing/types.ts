import type {
  EditorControllerEventCommandBindings as CommandBindings,
  EditorControllerEventCropBindings as CropBindings,
  EditorControllerEventObjectBindings as ObjectBindings,
  EditorControllerEventStateBindings as StateBindings,
} from '../types';

export type DrawingEventBindings = StateBindings & CropBindings & ObjectBindings & CommandBindings;
